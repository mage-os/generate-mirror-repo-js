#!/usr/bin/env bash
# Local test script for the Mage-OS minimal metapackage build.
# Builds the minimal release packages and tests composer install.
# Run from the project root: bash bin/test-minimal-local.sh [MAGEOS_VERSION] [UPSTREAM_VERSION]
#
# Usage:
#   bash bin/test-minimal-local.sh                          # uses defaults below
#   bash bin/test-minimal-local.sh 2.2.0-alpha1 2.4.8-p3   # specify both versions

set -euo pipefail

MAGEOS_RELEASE="${1:-2.2.0-alpha1}"
UPSTREAM_RELEASE="${2:-2.4.8-p3}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=bin/_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

cd "$ROOT"

BUILD_DIR="build-mageos-minimal"
REPO_URL="https://release.mage-os.org"
INSTALL_PACKAGE="mage-os/project-minimal-edition"

# ─── Build ─────────────────────────────────────────────────────────────────────

build() {
  log "Clearing previous build"
  rm -rf "${BUILD_DIR}"

  log "Generating minimal release packages (mageosRelease=${MAGEOS_RELEASE} upstreamRelease=${UPSTREAM_RELEASE})"
  node src/make/mageos-release.js \
    --outputDir="${BUILD_DIR}/packages" \
    --gitRepoDir=generate-repo/repositories \
    --repoUrl="${REPO_URL}" \
    --mageosRelease="${MAGEOS_RELEASE}" \
    --upstreamRelease="${UPSTREAM_RELEASE}" \
    --skipHistory

  log "Configuring satis"
  local SATIS_JSON="/tmp/satis-mageos-minimal.json"
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

  log "Testing composer install"
  local TEST_DIR="test-install-mageos-minimal"
  rm -rf "${TEST_DIR}"
  mkdir "${TEST_DIR}"
  cd "${TEST_DIR}"

  composer init --no-interaction --name="test/mageos-minimal" --stability=alpha
  composer config repositories.release \
    "{\"type\": \"composer\", \"url\": \"file://${ABSPATH}\"}"

  composer require "${INSTALL_PACKAGE}:${MAGEOS_RELEASE}" --no-interaction

  cd "$ROOT"
  log "SUCCESS - ${INSTALL_PACKAGE}:${MAGEOS_RELEASE} installed"
}

# ─── Main ──────────────────────────────────────────────────────────────────────

check_prerequisites "$ROOT"
build

log "All done"
