#!/usr/bin/env bash
# Local test script for mageos-release builds.
# Builds all tagged Mage-OS releases (history) and tests composer install of the most recent.
# Run from the project root: bash bin/test-release-local.sh [VERSION]
#
# Usage:
#   bash bin/test-release-local.sh          # installs latest available release
#   bash bin/test-release-local.sh 2.1.0    # installs specific release version

set -euo pipefail

INSTALL_VERSION="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$ROOT"

BUILD_DIR="build-mageos-release"
REPO_URL="https://release.mage-os.org"
INSTALL_PACKAGE="mage-os/project-community-edition"

# ─── Prerequisites ─────────────────────────────────────────────────────────────

log() { echo ""; echo ">>> $*"; }

check_prerequisites() {
  log "Checking prerequisites"

  if ! command -v node &>/dev/null; then
    echo "ERROR: node is not installed"; exit 1
  fi
  if ! command -v composer &>/dev/null; then
    echo "ERROR: composer is not installed"; exit 1
  fi
  if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is not installed"; exit 1
  fi
  if ! command -v php-classes.phar &>/dev/null; then
    log "Installing php-classes.phar"
    curl -L https://github.com/mage-os/php-dependency-list/raw/main/php-classes.phar \
      -o /usr/local/bin/php-classes.phar && chmod +x /usr/local/bin/php-classes.phar
  fi

  log "Installing node dependencies"
  npm ci

  if [ ! -f satis/bin/satis ]; then
    log "Installing satis"
    git clone https://github.com/composer/satis.git satis
    cd satis
    git checkout fafc1c2eca6394235f12f8a3ee4da7fc7c9fc874
    composer install
    cd "$ROOT"
  fi
}

# ─── Build ─────────────────────────────────────────────────────────────────────

build() {
  log "Clearing previous build"
  rm -rf "${BUILD_DIR}"

  log "Generating release packages (building all tagged releases)"
  node src/make/mageos-release.js \
    --outputDir="${BUILD_DIR}/packages" \
    --gitRepoDir=generate-repo/repositories \
    --repoUrl="${REPO_URL}"

  log "Configuring satis"
  local SATIS_JSON="/tmp/satis-mageos-release.json"
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

  find "${BUILD_DIR}" -name "*.json" | xargs sed -i '' \
    "s|${REPO_URL}/|file://${ABSPATH}/|g"

  jq --arg url "file://${ABSPATH}/p2/%package%.json" \
    '."metadata-url" = $url' \
    "${BUILD_DIR}/packages.json" > /tmp/pkg-fixed.json \
    && mv /tmp/pkg-fixed.json "${BUILD_DIR}/packages.json"

  log "Testing composer install"
  local TEST_DIR="test-install-mageos-release"
  rm -rf "${TEST_DIR}"
  mkdir "${TEST_DIR}"
  cd "${TEST_DIR}"

  composer init --no-interaction --name="test/mageos-release" --stability=stable
  composer config repositories.release \
    "{\"type\": \"composer\", \"url\": \"file://${ABSPATH}\"}"

  if [ -n "${INSTALL_VERSION}" ]; then
    composer require "${INSTALL_PACKAGE}:${INSTALL_VERSION}" --no-interaction
  else
    composer require "${INSTALL_PACKAGE}" --no-interaction
  fi

  cd "$ROOT"
  log "SUCCESS - ${INSTALL_PACKAGE} installed"
}

# ─── Main ──────────────────────────────────────────────────────────────────────

check_prerequisites
build

log "All done"
