#!/usr/bin/env bash
#
# Preflight gate checks for a Mage-OS release.
#
# Usage: preflight.sh <TARGET_VERSION> [UPSTREAM_VERSION]
#   e.g. preflight.sh 3.4.0 2.4.9
#
# Exits non-zero if any blocking gate fails.

set -uo pipefail

TARGET="${1:-}"
UPSTREAM="${2:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <TARGET_VERSION> [UPSTREAM_VERSION]" >&2
  exit 64
fi

if [[ ! "$TARGET" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Target version '$TARGET' is not X.Y.Z" >&2
  exit 64
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
CORE_REPO="mage-os/mageos-magento2"
ACTIONS_REPO="mage-os/github-actions"
PROD_REPO_URL="https://repo.mage-os.org"

FAILED=0
WARNED=0

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAILED=$((FAILED + 1)); }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; WARNED=$((WARNED + 1)); }
info() { printf '        %s\n' "$1"; }

echo
echo "Mage-OS release preflight — target $TARGET"
echo "==========================================="

# --- Determine previous published version --------------------------------
echo
echo "Previous version"

PUBLISHED_JSON="$(curl -sS --max-time 30 "$PROD_REPO_URL/p2/mage-os/product-community-edition.json" 2>/dev/null)"

if [[ -z "$PUBLISHED_JSON" ]]; then
  fail "could not fetch published version list from $PROD_REPO_URL"
  PREV=""
else
  PREV="$(printf '%s' "$PUBLISHED_JSON" | php -r '
    $d = json_decode(stream_get_contents(STDIN), true);
    $target = $argv[1];
    $versions = array_map(fn($p) => $p["version"], $d["packages"]["mage-os/product-community-edition"] ?? []);
    $lower = array_values(array_filter($versions, fn($v) => version_compare($v, $target, "<")));
    usort($lower, "version_compare");
    echo $lower ? end($lower) : "";
  ' -- "$TARGET" 2>/dev/null)"

  if [[ -z "$PREV" ]]; then
    fail "could not determine a published version below $TARGET"
  else
    pass "previous published version is $PREV"
    PREV_MAJOR="${PREV%%.*}"
    TARGET_MAJOR="${TARGET%%.*}"
    if [[ "$PREV_MAJOR" != "$TARGET_MAJOR" ]]; then
      warn "major-version boundary ($PREV -> $TARGET) — confirm the previous version with the user"
    fi
  fi
fi

# --- Gate 1: previous release's history files are merged ------------------
echo
echo "Gate 1 — history files for $PREV"

if [[ -n "$PREV" ]]; then
  MISSING=()
  for pkg in magento2-base product-community-edition project-community-edition; do
    [[ -f "$REPO_ROOT/resource/history/mage-os/$pkg/$PREV.json" ]] || MISSING+=("$pkg")
  done
  # minimal editions exist from 3.0.0 onward
  if [[ "$(printf '%s\n%s\n' "$PREV" "3.0.0" | sort -V | head -1)" == "3.0.0" ]]; then
    for pkg in product-minimal-edition project-minimal-edition; do
      [[ -f "$REPO_ROOT/resource/history/mage-os/$pkg/$PREV.json" ]] || MISSING+=("$pkg")
    done
  fi

  if [[ ${#MISSING[@]} -eq 0 ]]; then
    pass "all history files present for $PREV"
  else
    fail "missing history files for $PREV: ${MISSING[*]}"
    info "building without them makes $PREV's packages drift on rebuild"
    info "run the add-release-history skill for $PREV and merge that PR first"
  fi
fi

# --- Gate 2: target tag must not already exist ----------------------------
echo
echo "Gate 2 — target tag"

if gh api "repos/$CORE_REPO/git/ref/tags/$TARGET" --jq '.ref' >/dev/null 2>&1; then
  fail "tag $TARGET already exists in $CORE_REPO — this would be a re-release"
else
  pass "tag $TARGET does not exist yet in $CORE_REPO"
fi

# --- Gate 3: target must not already be published -------------------------
echo
echo "Gate 3 — not already published"

if [[ -n "$PUBLISHED_JSON" ]]; then
  # Parse rather than grep — the p2 payload's whitespace is not guaranteed.
  IS_PUBLISHED="$(printf '%s' "$PUBLISHED_JSON" | php -r '
    $d = json_decode(stream_get_contents(STDIN), true);
    $versions = array_map(fn($p) => $p["version"], $d["packages"]["mage-os/product-community-edition"] ?? []);
    echo in_array($argv[1], $versions, true) ? "yes" : "no";
  ' -- "$TARGET" 2>/dev/null)"

  if [[ "$IS_PUBLISHED" == "yes" ]]; then
    fail "$TARGET is already published on repo.mage-os.org"
  elif [[ "$IS_PUBLISHED" == "no" ]]; then
    pass "$TARGET is not yet published"
  else
    warn "could not determine whether $TARGET is published"
  fi
fi

# --- Gate 4: supported-version matrix -------------------------------------
echo
echo "Gate 4 — supported-version matrix"

INDIVIDUAL="$(gh api "repos/$ACTIONS_REPO/contents/supported-version/src/versions/mage-os/individual.json?ref=main" \
  --jq '.content' 2>/dev/null | base64 -d 2>/dev/null)"

if [[ -z "$INDIVIDUAL" ]]; then
  warn "could not read individual.json from $ACTIONS_REPO"
else
  if printf '%s' "$INDIVIDUAL" | grep -q "project-community-edition:$TARGET"; then
    pass "individual.json has an entry for $TARGET"

    if [[ -n "$UPSTREAM" ]]; then
      ENTRY_UPSTREAM="$(printf '%s' "$INDIVIDUAL" | php -r '
        $d = json_decode(stream_get_contents(STDIN), true);
        echo $d["mage-os/project-community-edition:" . $argv[1]]["upstream"] ?? "";
      ' -- "$TARGET" 2>/dev/null)"
      if [[ "$ENTRY_UPSTREAM" == "$UPSTREAM" ]]; then
        pass "matrix upstream matches $UPSTREAM"
      else
        fail "matrix says upstream '$ENTRY_UPSTREAM' but release declares '$UPSTREAM'"
      fi
    fi
  else
    fail "individual.json has no entry for $TARGET"
  fi
fi

# dist/ is what CI actually consumes — source JSON being right is not enough
DIST="$(gh api "repos/$ACTIONS_REPO/contents/supported-version/dist/index.js?ref=main" \
  --jq '.content' 2>/dev/null | base64 -d 2>/dev/null)"

if [[ -z "$DIST" ]]; then
  warn "could not read supported-version/dist/index.js"
elif printf '%s' "$DIST" | grep -q "project-community-edition:$TARGET"; then
  pass "dist/index.js contains $TARGET (bundle was rebuilt)"
else
  fail "dist/index.js does NOT contain $TARGET — 'npm run build' was not run or not committed"
fi

# --- Gate 5: gh account ---------------------------------------------------
echo
echo "Gate 5 — gh authentication"

ACTIVE_ACCOUNT="$(gh api user --jq '.login' 2>/dev/null)"
if [[ -z "$ACTIVE_ACCOUNT" ]]; then
  fail "gh is not authenticated"
else
  # A non-collaborator gets 403 here, so treat any non-permission payload as "no access".
  PERM="$(gh api "repos/$CORE_REPO/collaborators/$ACTIVE_ACCOUNT/permission" --jq '.permission' 2>/dev/null)"
  case "$PERM" in
    admin|maintain|write)
      pass "authenticated as '$ACTIVE_ACCOUNT' with '$PERM' on $CORE_REPO" ;;
    *)
      fail "active gh account '$ACTIVE_ACCOUNT' has no write access to $CORE_REPO"
      OTHERS="$(gh auth status 2>&1 | sed -n 's/.*Logged in to github.com account \([^ ]*\).*/\1/p' \
        | grep -vx "$ACTIVE_ACCOUNT" | tr '\n' ' ')"
      if [[ -n "${OTHERS// /}" ]]; then
        info "other authenticated account(s): ${OTHERS}"
        info "switch with: gh auth switch --user <account>"
      fi ;;
  esac
fi

# --- Survey: bundled repos with commits since PREV ------------------------
echo
echo "Survey — repos with commits since $PREV (HINT ONLY, not evidence)"

if [[ -n "$PREV" ]]; then
  REPOS=(mageos-magento2 mageos-inventory mageos-magento2-page-builder mageos-security-package
         mageos-composer mageos-magento2-sample-data mageos-composer-root-update-plugin
         mageos-composer-dependency-version-audit-plugin mageos-adobe-stock-integration
         mageos-magento-coding-standard mageos-magento2-functional-testing-framework
         mageos-magento-composer-installer mageos-inventory-composer-installer
         mageos-magento-zend-cache mageos-magento-zend-db mageos-magento-zend-log
         mageos-magento-zend-pdf mageos-magento-zend-loader mageos-magento-zend-memory
         mageos-magento-zend-exception mageos-magento-zf-captcha mageos-magento-zf-db
         mageos-magento-zf-soap)

  for r in "${REPOS[@]}"; do
    AHEAD="$(gh api "repos/mage-os/$r/compare/$PREV...main" --jq '.ahead_by' 2>/dev/null)"
    [[ -z "$AHEAD" || "$AHEAD" == "0" ]] && continue

    # One subject per line — filtering a joined string would test the whole
    # blob at once and mislabel any repo that has even one infra commit.
    SUBJECTS="$(gh api "repos/mage-os/$r/compare/$PREV...main" \
      --jq '.commits[].commit.message | split("\n")[0]' 2>/dev/null)"

    SUBSTANTIVE="$(printf '%s\n' "$SUBJECTS" | grep -vi \
      -e 'sansec' -e 'terraform' -e '^Merge branch' -e '^Merge remote-tracking' -e '^Merge pull request')"

    if [[ -n "${SUBSTANTIVE//[[:space:]]/}" ]]; then
      info "$r: $AHEAD ahead — possible content:"
      printf '%s\n' "$SUBSTANTIVE" | while IFS= read -r line; do
        [[ -n "${line//[[:space:]]/}" ]] && info "    $line"
      done
    else
      info "$r: $AHEAD ahead (infra/merge commits only)"
    fi
  done

  echo
  info "Commit counts are unreliable: push-release-tag.yml puts 'Release X.Y.Z' on a"
  info "diverged lineage, so shipped commits can still show as 'ahead'. Use"
  info "verify-packages.php to establish what actually changed."
fi

# --- Summary --------------------------------------------------------------
echo
echo "==========================================="
if [[ $FAILED -gt 0 ]]; then
  printf '\033[31m%d gate(s) failed\033[0m, %d warning(s) — do not build\n' "$FAILED" "$WARNED"
  exit 1
fi
printf '\033[32mAll gates passed\033[0m'
[[ $WARNED -gt 0 ]] && printf ' with %d warning(s) — review before proceeding' "$WARNED"
printf '\n'
exit 0
