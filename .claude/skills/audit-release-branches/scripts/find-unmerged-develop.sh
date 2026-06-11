#!/usr/bin/env bash
#
# For every non mirror-* repository in the mage-os org, look for cases where a
# 'develop' or '2.4-develop' branch exists alongside 'main' or 'master', and
# report when the develop branch is ahead of the trunk branch (i.e. carries
# commits that have not been merged in).
#
# Usage:
#   ./find-unmerged-develop.sh [output-file] [--exclude-with-branch <branch>]
#
# Pass --exclude-with-branch release/3.x to skip repos that already have that
# release branch cut (i.e. work is already prepped there).
#
set -euo pipefail

ORG="mage-os"
OUTFILE=""
EXCLUDE_BRANCH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --exclude-with-branch) EXCLUDE_BRANCH="$2"; shift 2 ;;
    *) OUTFILE="$1"; shift ;;
  esac
done
OUTFILE="${OUTFILE:-develop-vs-trunk.txt}"

DEV_BRANCHES=("develop" "2.4-develop")
TRUNK_BRANCHES=("main" "master")

command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

echo "Listing repositories in '${ORG}' (mirror-* excluded, forks included)..." >&2
mapfile -t REPOS < <(
  gh repo list "$ORG" --limit 1000 --no-archived --json name \
    | jq -r '.[].name' \
    | grep -v '^mirror-' \
    | sort
)
echo "Found ${#REPOS[@]} candidate repositories." >&2

branch_exists() {
  # $1=repo  $2=branch — quiet HEAD; rc=0 if present
  gh api -H "Accept: application/vnd.github+json" \
    "repos/${ORG}/$1/branches/$2" >/dev/null 2>&1
}

AHEAD_ROWS=()    # repo<TAB>dev<TAB>trunk<TAB>ahead<TAB>behind
EVEN_ROWS=()     # repo with matching branches but dev not ahead (informational)

SKIPPED_ROWS=()  # repos excluded because they already have $EXCLUDE_BRANCH

for repo in "${REPOS[@]}"; do
  if [ -n "$EXCLUDE_BRANCH" ] && branch_exists "$repo" "$EXCLUDE_BRANCH"; then
    SKIPPED_ROWS+=("$repo")
    printf '  [skip ] %s (has %s)\n' "$repo" "$EXCLUDE_BRANCH" >&2
    continue
  fi
  dev_found=""
  trunk_found=""
  for d in "${DEV_BRANCHES[@]}"; do
    if branch_exists "$repo" "$d"; then dev_found="$d"; break; fi
  done
  [ -z "$dev_found" ] && continue
  for t in "${TRUNK_BRANCHES[@]}"; do
    if branch_exists "$repo" "$t"; then trunk_found="$t"; break; fi
  done
  [ -z "$trunk_found" ] && continue

  # compare base=trunk head=dev -> ahead_by/behind_by are from the perspective
  # of head relative to base, i.e. ahead_by = commits on dev not in trunk.
  cmp=$(gh api -H "Accept: application/vnd.github+json" \
    "repos/${ORG}/${repo}/compare/${trunk_found}...${dev_found}" \
    --jq '{ahead: .ahead_by, behind: .behind_by, status}' 2>/dev/null || echo '')
  if [ -z "$cmp" ]; then
    printf '  [err ] %s (%s vs %s)\n' "$repo" "$dev_found" "$trunk_found" >&2
    continue
  fi
  ahead=$(echo "$cmp" | jq -r '.ahead')
  behind=$(echo "$cmp" | jq -r '.behind')
  if [ "$ahead" -gt 0 ]; then
    AHEAD_ROWS+=("${repo}	${dev_found}	${trunk_found}	${ahead}	${behind}")
    printf '  [AHEAD] %s : %s is %s commits ahead of %s (behind %s)\n' \
      "$repo" "$dev_found" "$ahead" "$trunk_found" "$behind" >&2
  else
    EVEN_ROWS+=("${repo}	${dev_found}	${trunk_found}	${ahead}	${behind}")
    printf '  [even ] %s : %s == %s\n' "$repo" "$dev_found" "$trunk_found" >&2
  fi
done

{
  echo "# Repos in '${ORG}' where develop/2.4-develop has commits not in main/master"
  echo "# Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo "# Candidates scanned: ${#REPOS[@]}"
  [ -n "$EXCLUDE_BRANCH" ] && echo "# Excluded (already have '${EXCLUDE_BRANCH}'): ${#SKIPPED_ROWS[@]}"
  echo "# With develop AHEAD of trunk: ${#AHEAD_ROWS[@]}"
  echo "# With develop matching/behind trunk: ${#EVEN_ROWS[@]}"
  echo
  echo "## Ahead (repo<TAB>dev-branch<TAB>trunk-branch<TAB>ahead<TAB>behind)"
  printf '%s\n' "${AHEAD_ROWS[@]:-}"
  echo
  echo "## Even or behind (informational)"
  printf '%s\n' "${EVEN_ROWS[@]:-}"
  if [ -n "$EXCLUDE_BRANCH" ]; then
    echo
    echo "## Skipped (already have '${EXCLUDE_BRANCH}')"
    printf '%s\n' "${SKIPPED_ROWS[@]:-}"
  fi
} > "$OUTFILE"

echo >&2
echo "Wrote results to: $OUTFILE" >&2
echo "${#AHEAD_ROWS[@]} repos have develop commits not yet merged to trunk." >&2
