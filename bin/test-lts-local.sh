#!/usr/bin/env bash
# Local test script for a maintenance release built from a release refs file.
#
# Builds a release of an older line the way a security release on a maintenance
# branch would be built, then checks three things the normal release scripts
# cannot: that the refs file is honoured, that packages starting after the
# target version are left out, and that the result installs.
#
# Run from the project root: bash bin/test-lts-local.sh [VERSION] [UPSTREAM] [KEY=REF ...]
#
# Usage:
#   bash bin/test-lts-local.sh                                  # 2.3.1 from the 2.3.0 tags
#   bash bin/test-lts-local.sh 2.3.1 2.4.8-p5                   # pick the upstream base
#   bash bin/test-lts-local.sh 2.3.1 2.4.8-p5 magento2=release/2.x
#
# The last form is the real shape of a maintenance release: every repository
# builds from its previous tag except the ones that received a patch, which
# build from their maintenance branch.
#
# Environment:
#   BASE_REF   ref for the '*' key (default: the target version's .0 release)

set -euo pipefail

MAGEOS_RELEASE="${1:-2.3.1}"
UPSTREAM_RELEASE="${2:-2.4.8-p5}"
shift 2 2>/dev/null || shift $#
OVERRIDES=("$@")

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=bin/_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

cd "$ROOT"

BUILD_DIR="build-mageos-lts"
REPO_URL="https://release.mage-os.org"
INSTALL_PACKAGE="mage-os/project-community-edition"
GIT_REPO_DIR="generate-repo/repositories"
BASE_REF="${BASE_REF:-${MAGEOS_RELEASE%.*}.0}"
REFS_FILE="$(mktemp -t "mageos-lts-refs-${MAGEOS_RELEASE}.XXXXXX").js"

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

build() {
  log "Clearing previous build"
  rm -rf "${BUILD_DIR}"

  log "Generating release ${MAGEOS_RELEASE} from refs (upstream ${UPSTREAM_RELEASE})"
  node src/make/mageos-release.js \
    --outputDir="${BUILD_DIR}/packages" \
    --gitRepoDir="${GIT_REPO_DIR}" \
    --repoUrl="${REPO_URL}" \
    --mageosRelease="${MAGEOS_RELEASE}" \
    --upstreamRelease="${UPSTREAM_RELEASE}" \
    --releaseRefsFile="${REFS_FILE}" \
    --skipHistory \
    --skipAliases
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
  local SATIS_JSON="/tmp/satis-mageos-lts.json"
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
  local TEST_DIR="test-install-mageos-lts"
  rm -rf "${TEST_DIR}"
  mkdir "${TEST_DIR}"
  cd "${TEST_DIR}"

  composer init --no-interaction --name="test/mageos-lts" --stability=stable
  composer config repositories.release \
    "{\"type\": \"composer\", \"url\": \"file://${ABSPATH}\"}"
  composer require "${INSTALL_PACKAGE}:${MAGEOS_RELEASE}" --no-interaction

  cd "$ROOT"
}

# ─── Main ──────────────────────────────────────────────────────────────────────

check_prerequisites "$ROOT"
write_refs_file
build
assert_release_built
assert_refs_honoured
assert_later_packages_absent
install_test

log "SUCCESS - ${MAGEOS_RELEASE} built from ${BASE_REF} and installed"
