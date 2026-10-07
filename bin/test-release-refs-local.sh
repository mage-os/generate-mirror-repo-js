#!/usr/bin/env bash
# Local test script for a release built from a release refs file.
#
# Builds a release of an older line the way a security release on a maintenance
# branch would be built, then checks three things the normal release scripts
# cannot: that the refs file is honoured, that packages starting after the
# target version are left out, and that the result installs.
#
# Run from the project root: bash bin/test-release-refs-local.sh [--full] [VERSION] [UPSTREAM] [KEY=REF ...]
#
# Usage:
#   bash bin/test-release-refs-local.sh                                  # 2.3.1 from the 2.3.0 tags
#   bash bin/test-release-refs-local.sh 2.3.1 2.4.8-p5                   # pick the upstream base
#   bash bin/test-release-refs-local.sh 2.3.1 2.4.8-p5 magento2=release/2.x
#   bash bin/test-release-refs-local.sh --full 2.3.1 2.4.8-p5            # rehearse the real release
#
# The last form is the real shape of a maintenance release: every repository
# builds from its previous tag except the ones that received a patch, which
# build from their maintenance branch.
#
# --full rehearses what the release workflow actually runs: it rebuilds the
# history and the magento/* aliases instead of skipping them, and it puts the
# refs file at the conventional path the generator finds by version, rather
# than passing --releaseRefsFile. Much slower, and the only mode that covers
# the interaction between a maintenance release and the history rebuild.
#
# Environment:
#   BASE_REF         ref for the '*' key (default: the target version's .0 release)
#   KEEP_REFS_FILE   in --full mode, keep the generated refs file instead of
#                    removing it on exit

set -euo pipefail

FULL=0
ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--full" ]; then FULL=1; else ARGS+=("$arg"); fi
done
set -- ${ARGS+"${ARGS[@]}"}

MAGEOS_RELEASE="${1:-2.3.1}"
UPSTREAM_RELEASE="${2:-2.4.8-p5}"
shift 2 2>/dev/null || shift $#
OVERRIDES=("$@")

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=bin/_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

cd "$ROOT"

BUILD_DIR="build-mageos-release-refs"
REPO_URL="https://release.mage-os.org"
INSTALL_PACKAGE="mage-os/project-community-edition"
GIT_REPO_DIR="generate-repo/repositories"
BASE_REF="${BASE_REF:-${MAGEOS_RELEASE%.*}.0}"

# The generator looks for <vendor>-release-refs/<version>.js when no
# --releaseRefsFile is given, which is how a real release finds it. --full
# exercises that lookup; the default mode passes an out-of-tree file instead,
# so the repository is left untouched.
CONVENTION_FILE="src/build-config/mage-os-release-refs/${MAGEOS_RELEASE}.js"
if [ "${FULL}" -eq 1 ]; then
  REFS_FILE="${CONVENTION_FILE}"
else
  REFS_DIR="$(mktemp -d -t mageos-release-refs)"
  REFS_FILE="${REFS_DIR}/${MAGEOS_RELEASE}.js"
fi

# --full writes into the repository, so never overwrite a refs file that is
# actually committed: that is the file a real release uses.
if [ "${FULL}" -eq 1 ] && git ls-files --error-unmatch "${CONVENTION_FILE}" >/dev/null 2>&1; then
  echo "ERROR: ${CONVENTION_FILE} is committed to the repository." >&2
  echo "--full would overwrite and then delete it. Build it with the workflow," >&2
  echo "or run without --full to use an out-of-tree refs file." >&2
  exit 1
fi

cleanup() {
  if [ "${FULL}" -eq 1 ] && [ -z "${KEEP_REFS_FILE:-}" ] && [ -f "${CONVENTION_FILE}" ]; then
    rm -f "${CONVENTION_FILE}"
  fi
  [ -n "${REFS_DIR:-}" ] && rm -rf "${REFS_DIR}"
  return 0
}
trap cleanup EXIT

# ─── Refs file ─────────────────────────────────────────────────────────────────

write_refs_file() {
  log "Writing refs file ${REFS_FILE}"

  {
    echo "module.exports = {"
    echo "  '*': '${BASE_REF}',"
    for override in ${OVERRIDES+"${OVERRIDES[@]}"}; do
      if [[ "$override" != *=* ]]; then
        echo "ERROR: override '${override}' is not KEY=REF" >&2
        exit 1
      fi
      echo "  '${override%%=*}': '${override#*=}',"
    done
    echo "};"
  } > "${REFS_FILE}"

  cat "${REFS_FILE}"
}

# ─── Build ─────────────────────────────────────────────────────────────────────

# The generator commits to a work branch and creates the release tag in each
# clone, so a second run would die on "nothing to commit" or refuse the tag
# that already exists. Both belong to the previous run of this script.
clean_previous_run() {
  log "Clearing the previous run's work branch and tag from the clones"

  local work_branch="prep-release/mage-os-${MAGEOS_RELEASE}"
  for repo in "${GIT_REPO_DIR}"/*/; do
    [ -d "${repo}.git" ] || continue
    git -C "${repo}" rev-parse --verify --quiet "refs/heads/${work_branch}" >/dev/null 2>&1 && {
      git -C "${repo}" checkout --force --quiet --detach 2>/dev/null || true
      git -C "${repo}" branch -D "${work_branch}" >/dev/null 2>&1 || true
    }
    git -C "${repo}" tag -d "${MAGEOS_RELEASE}" >/dev/null 2>&1 || true
    git -C "${repo}" checkout --force --quiet -- . 2>/dev/null || true
  done
}

build() {
  log "Clearing previous build"
  rm -rf "${BUILD_DIR}"

  local extra=()
  if [ "${FULL}" -eq 1 ]; then
    log "Generating release ${MAGEOS_RELEASE} with history and aliases (upstream ${UPSTREAM_RELEASE})"
    log "Refs come from ${CONVENTION_FILE} by convention, with no --releaseRefsFile"
  else
    log "Generating release ${MAGEOS_RELEASE} from refs (upstream ${UPSTREAM_RELEASE})"
    extra=(--releaseRefsFile="${REFS_FILE}" --skipHistory --skipAliases)
  fi

  node src/make/mageos-release.js \
    --outputDir="${BUILD_DIR}/packages" \
    --gitRepoDir="${GIT_REPO_DIR}" \
    --repoUrl="${REPO_URL}" \
    --mageosRelease="${MAGEOS_RELEASE}" \
    --upstreamRelease="${UPSTREAM_RELEASE}" \
    ${extra+"${extra[@]}"}
}

# ─── Checks ────────────────────────────────────────────────────────────────────

# The release branch the generator cut must descend from the ref we asked for,
# otherwise the refs file was silently ignored and this built from the default
# branch instead.
assert_refs_honoured() {
  log "Checking each repository was built from its configured ref"

  local work_branch="prep-release/mage-os-${MAGEOS_RELEASE}"
  local failed=0

  while read -r key dir; do
    local expected="${BASE_REF}"
    for override in ${OVERRIDES+"${OVERRIDES[@]}"}; do
      [ "${override%%=*}" = "$key" ] && expected="${override#*=}"
    done

    local repo="${GIT_REPO_DIR}/${dir}"
    [ -d "${repo}/.git" ] || { echo "  SKIP ${key}: not cloned"; continue; }

    if git -C "${repo}" merge-base --is-ancestor "${expected}" "${work_branch}" 2>/dev/null; then
      echo "  OK   ${key} <- ${expected}"
    else
      echo "  FAIL ${key}: ${work_branch} does not descend from ${expected}"
      failed=1
    fi
  done < <(node -e "
    const {buildConfig} = require('./src/build-config/mageos-release-build-config');
    const {isPartOfRelease} = require('./src/release-build-tools');
    for (const i of buildConfig) {
      if (!isPartOfRelease(i, '${MAGEOS_RELEASE}')) continue;
      console.log(i.key, i.repoUrl.split('/').pop().replace(/\.git$/, ''));
    }
  ")

  [ "$failed" -eq 0 ] || { echo "ERROR: refs file was not honoured"; exit 1; }
}

# Anything whose fromTag is later than this release must not be built, or an
# older line picks up packages that never existed in it.
assert_later_packages_absent() {
  log "Checking packages that start after ${MAGEOS_RELEASE} were left out"

  local skipped
  skipped="$(node -e "
    const {buildConfig} = require('./src/build-config/mageos-release-build-config');
    const {isPartOfRelease} = require('./src/release-build-tools');
    const names = [];
    for (const i of buildConfig) {
      if (!isPartOfRelease(i, '${MAGEOS_RELEASE}')) names.push(i.key);
      for (const m of i.extraMetapackages || []) {
        if (!isPartOfRelease(m, '${MAGEOS_RELEASE}')) names.push(m.name);
      }
    }
    console.log(names.join(' '));
  ")"

  if [ -z "${skipped}" ]; then
    echo "  nothing to exclude for ${MAGEOS_RELEASE}"
    return
  fi

  local failed=0
  for name in ${skipped}; do
    local found
    found="$(find "${BUILD_DIR}/packages" -name "${name}-${MAGEOS_RELEASE}.zip" 2>/dev/null | head -1)"
    if [ -n "${found}" ]; then
      echo "  FAIL ${name}: built although it starts after ${MAGEOS_RELEASE} (${found})"
      failed=1
    else
      echo "  OK   ${name} not built"
    fi
  done

  [ "$failed" -eq 0 ] || { echo "ERROR: a later package was built into ${MAGEOS_RELEASE}"; exit 1; }
}

assert_release_built() {
  log "Checking the release itself was built"

  local expected="${BUILD_DIR}/packages/mage-os/product-community-edition-${MAGEOS_RELEASE}.zip"
  [ -f "${expected}" ] || { echo "ERROR: ${expected} missing"; exit 1; }
  echo "  OK   $(basename "${expected}")"
}

# ─── Install ───────────────────────────────────────────────────────────────────

install_test() {
  log "Configuring satis"
  local SATIS_JSON="/tmp/satis-mageos-release-refs.json"
  node bin/set-satis-homepage-url.js \
    --satisConfig=satis.json \
    --repoUrl="${REPO_URL}" > "${SATIS_JSON}"

  cat <<< "$(jq \
    --arg outdir "../${BUILD_DIR}" \
    --arg repodir "../${BUILD_DIR}/packages" \
    '."output-dir" = $outdir | .repositories[0].url = $repodir' \
    "${SATIS_JSON}")" > "${SATIS_JSON}"

  cp mageos.html.twig satis/views/mageos.html.twig
  jq -r .version package.json > satis/views/version

  log "Running satis"
  cd satis && bin/satis build "${SATIS_JSON}" "../${BUILD_DIR}" && cd "$ROOT"

  log "Fixing URLs for local file:// access"
  local ABSPATH
  ABSPATH="$(realpath "${BUILD_DIR}")"

  while IFS= read -r f; do
    sed_inplace "s|${REPO_URL}/|file://${ABSPATH}/|g" "$f"
    sed_inplace "s|\.\./${BUILD_DIR}/|file://${ABSPATH}/|g" "$f"
  done < <(find "${BUILD_DIR}" -name "*.json")

  jq --arg url "file://${ABSPATH}/p2/%package%.json" \
    '."metadata-url" = $url' \
    "${BUILD_DIR}/packages.json" > /tmp/pkg-fixed.json \
    && mv /tmp/pkg-fixed.json "${BUILD_DIR}/packages.json"

  log "Testing composer install of ${INSTALL_PACKAGE}:${MAGEOS_RELEASE}"
  local TEST_DIR="test-install-mageos-release-refs"
  rm -rf "${TEST_DIR}"
  mkdir "${TEST_DIR}"
  cd "${TEST_DIR}"

  composer init --no-interaction --name="test/mageos-release-refs" --stability=stable
  composer config repositories.release \
    "{\"type\": \"composer\", \"url\": \"file://${ABSPATH}\"}"
  composer require "${INSTALL_PACKAGE}:${MAGEOS_RELEASE}" --no-interaction

  cd "$ROOT"
}

# ─── Main ──────────────────────────────────────────────────────────────────────

check_prerequisites "$ROOT"
clean_previous_run
write_refs_file
build
assert_release_built
assert_refs_honoured
assert_later_packages_absent
install_test

if [ "${FULL}" -eq 1 ]; then
  log "SUCCESS - ${MAGEOS_RELEASE} built from ${BASE_REF} with full history and installed"
else
  log "SUCCESS - ${MAGEOS_RELEASE} built from ${BASE_REF} and installed"
fi
