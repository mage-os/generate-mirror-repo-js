#!/usr/bin/env bash
#
# Find all non mirror-* repositories in the mage-os GitHub organization
# that have a given branch.
#
# Usage:
#   ./find-repos-with-branch.sh [branch] [output-file]
#
# Defaults:
#   branch       = release/3.x
#   output-file  = repos-with-<branch-slug>.txt
#
set -euo pipefail

ORG="mage-os"
BRANCH="${1:-release/3.x}"
SLUG="${BRANCH//\//-}"
OUTFILE="${2:-repos-with-${SLUG}.txt}"

command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

echo "Listing repositories in '${ORG}' (excluding mirror-*)..." >&2

# Pull every non-archived repo name (forks included). --limit large enough to cover the org.
mapfile -t REPOS < <(
  gh repo list "$ORG" --limit 1000 --no-archived --json name \
    | jq -r '.[].name' \
    | grep -v '^mirror-' \
    | sort
)

echo "Found ${#REPOS[@]} candidate repositories." >&2
echo "Checking each for branch '${BRANCH}'..." >&2

MATCHED=()
MISSING=()
ERRORED=()

for repo in "${REPOS[@]}"; do
  # gh api returns 0 with branch JSON on hit, non-zero on miss/error.
  if out=$(gh api -H "Accept: application/vnd.github+json" \
                  "repos/${ORG}/${repo}/branches/${BRANCH}" 2>&1); then
    sha=$(echo "$out" | jq -r '.commit.sha' 2>/dev/null || echo "?")
    MATCHED+=("${repo}	${sha}")
    printf '  [hit ] %s @ %s\n' "$repo" "${sha:0:12}" >&2
  else
    if echo "$out" | grep -q 'Branch not found'; then
      MISSING+=("$repo")
      printf '  [miss] %s\n' "$repo" >&2
    else
      ERRORED+=("${repo}: ${out}")
      printf '  [err ] %s\n' "$repo" >&2
    fi
  fi
done

{
  echo "# Repositories in '${ORG}' with branch '${BRANCH}'"
  echo "# Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo "# Candidates scanned: ${#REPOS[@]} (mirror-* and archived excluded; forks included)"
  echo "# Matched: ${#MATCHED[@]}  Missing: ${#MISSING[@]}  Errored: ${#ERRORED[@]}"
  echo
  echo "## Matched (repo<TAB>sha)"
  printf '%s\n' "${MATCHED[@]:-}"
  echo
  echo "## Missing branch"
  printf '%s\n' "${MISSING[@]:-}"
  if [ "${#ERRORED[@]}" -gt 0 ]; then
    echo
    echo "## Errored"
    printf '%s\n' "${ERRORED[@]}"
  fi
} > "$OUTFILE"

echo >&2
echo "Wrote results to: $OUTFILE" >&2
echo "Matched ${#MATCHED[@]} / ${#REPOS[@]} repositories." >&2
