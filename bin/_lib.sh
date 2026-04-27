#!/usr/bin/env bash
# Shared helpers for local test scripts.

log() { echo ""; echo ">>> $*"; }

check_prerequisites() {
  local ROOT="$1"

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
    curl -fSL https://github.com/mage-os/php-dependency-list/raw/main/php-classes.phar \
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

# Portable in-place sed (works on both macOS/BSD and Linux/GNU)
sed_inplace() {
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}
