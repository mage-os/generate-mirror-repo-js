#!/usr/bin/env bash
# Local test script for mageos-nightly and upstream-nightly builds.
# Run from the project root: bash bin/test-nightly-local.sh [mageos|upstream|both]
#
# Usage:
#   bash bin/test-nightly-local.sh          # runs both
#   bash bin/test-nightly-local.sh mageos   # mageos-nightly only
#   bash bin/test-nightly-local.sh upstream # upstream-nightly only

set -euo pipefail

TARGET="${1:-both}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$ROOT"

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
  local BUILD_TYPE="$1"      # mageos or upstream
  local ENTRYPOINT="$2"      # e.g. src/make/mageos-nightly.js
  local REPO_URL="$3"        # e.g. https://nightly.mage-os.org
  local BUILD_DIR="$4"       # e.g. build-mageos-nightly
  local INSTALL_PACKAGE="$5" # e.g. mage-os/project-community-edition

  log "[$BUILD_TYPE] Clearing previous build"
  rm -rf "${BUILD_DIR}"

  log "[$BUILD_TYPE] Generating packages"
  node "${ENTRYPOINT}" \
    --outputDir="${BUILD_DIR}/packages" \
    --gitRepoDir=generate-repo/repositories \
    --repoUrl="${REPO_URL}"

  log "[$BUILD_TYPE] Configuring satis"
  local SATIS_JSON="/tmp/satis-${BUILD_TYPE}.json"
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

  log "[$BUILD_TYPE] Running satis"
  cd satis && bin/satis build "${SATIS_JSON}" "../${BUILD_DIR}" && cd "$ROOT"

  log "[$BUILD_TYPE] Fixing URLs for local file:// access"
  local ABSPATH
  ABSPATH="$(realpath "${BUILD_DIR}")"

  find "${BUILD_DIR}" -name "*.json" | xargs sed -i '' \
    "s|${REPO_URL}/|file://${ABSPATH}/|g"

  jq --arg url "file://${ABSPATH}/p2/%package%.json" \
    '."metadata-url" = $url' \
    "${BUILD_DIR}/packages.json" > /tmp/pkg-fixed.json \
    && mv /tmp/pkg-fixed.json "${BUILD_DIR}/packages.json"

  log "[$BUILD_TYPE] Testing composer install"
  local TEST_DIR="test-install-${BUILD_TYPE}-nightly"
  rm -rf "${TEST_DIR}"
  mkdir "${TEST_DIR}"
  cd "${TEST_DIR}"

  composer init --no-interaction --name="test/${BUILD_TYPE}-nightly" --stability=alpha
  composer config repositories.nightly \
    "{\"type\": \"composer\", \"url\": \"file://${ABSPATH}\"}"
  composer config minimum-stability alpha
  composer config prefer-stable true

  composer require "${INSTALL_PACKAGE}" --no-interaction

  cd "$ROOT"
  log "[$BUILD_TYPE] SUCCESS - ${INSTALL_PACKAGE} installed"
}

# ─── Main ──────────────────────────────────────────────────────────────────────

check_prerequisites

if [[ "$TARGET" == "mageos" || "$TARGET" == "both" ]]; then
  build \
    "mageos" \
    "src/make/mageos-nightly.js" \
    "https://nightly.mage-os.org" \
    "build-mageos-nightly" \
    "mage-os/project-community-edition"
fi

if [[ "$TARGET" == "upstream" || "$TARGET" == "both" ]]; then
  build \
    "upstream" \
    "src/make/upstream-nightly.js" \
    "https://upstream-nightly.mage-os.org" \
    "build-upstream-nightly" \
    "magento/project-community-edition"
fi

log "All done"
