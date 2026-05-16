#!/usr/bin/env bash
#
# Open PRs to merge release branches into trunk across the mage-os org as
# part of a Mage-OS release preparation cycle.
#
# For every non mirror-* repo, two cases produce a PR:
#   1. Repo has the configured release branch (e.g. release/3.x) -> PR it into default
#   2. Repo has no release branch but has 'develop' or '2.4-develop' that is
#      ahead of 'main'/'master'                                 -> PR dev into trunk
#
# Defaults to DRY RUN. Pass --apply to actually create the PRs.
#
# Usage:
#   ./open-release-prs.sh \
#       --release-branch release/3.x \
#       --release-name "Mage-OS 3.0"
#   ./open-release-prs.sh --release-branch release/4.x --release-name "Mage-OS 4.0" --apply --draft
#
# Defaults: release-branch=release/3.x, release-name="Mage-OS 3.0"
#
set -euo pipefail

ORG="mage-os"
APPLY=0
DRAFT=0
PLAN_FILE="release-prs-plan.txt"
RELEASE_BRANCH="release/3.x"
RELEASE_NAME="Mage-OS 3.0"
EXCLUDE=()

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --draft) DRAFT=1; shift ;;
    --plan-file) PLAN_FILE="$2"; shift 2 ;;
    --release-branch) RELEASE_BRANCH="$2"; shift 2 ;;
    --release-name) RELEASE_NAME="$2"; shift 2 ;;
    --exclude) EXCLUDE+=("$2"); shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

is_excluded() {
  local r="$1" x
  for x in "${EXCLUDE[@]:-}"; do
    [ "$x" = "$r" ] && return 0
  done
  return 1
}

command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

DEV_BRANCHES=("develop" "2.4-develop")

branch_exists() {
  gh api -H "Accept: application/vnd.github+json" \
    "repos/${ORG}/$1/branches/$2" >/dev/null 2>&1
}

default_branch() {
  gh api -H "Accept: application/vnd.github+json" \
    "repos/${ORG}/$1" --jq '.default_branch'
}

ahead_by() {
  # $1=repo $2=base $3=head -> echoes ahead_by or empty on error
  gh api -H "Accept: application/vnd.github+json" \
    "repos/${ORG}/$1/compare/$2...$3" --jq '.ahead_by' 2>/dev/null || true
}

existing_pr() {
  # $1=repo $2=base $3=head -> echoes PR number if open, else empty
  gh pr list --repo "${ORG}/$1" --base "$2" --head "$3" --state open \
    --json number --jq '.[0].number // empty' 2>/dev/null || true
}

echo "Listing repositories in '${ORG}' (mirror-* excluded, forks included)..." >&2
mapfile -t REPOS < <(
  gh repo list "$ORG" --limit 1000 --no-archived --json name \
    | jq -r '.[].name' \
    | grep -v '^mirror-' \
    | sort
)
echo "Found ${#REPOS[@]} candidate repositories." >&2

PLAN=()       # repo<TAB>head<TAB>base<TAB>ahead<TAB>existing-pr-or-none
SKIPPED=()    # repo<TAB>reason

for repo in "${REPOS[@]}"; do
  if is_excluded "$repo"; then
    SKIPPED+=("${repo}	excluded via --exclude")
    continue
  fi
  head=""
  if branch_exists "$repo" "$RELEASE_BRANCH"; then
    head="$RELEASE_BRANCH"
  else
    for d in "${DEV_BRANCHES[@]}"; do
      if branch_exists "$repo" "$d"; then head="$d"; break; fi
    done
  fi
  [ -z "$head" ] && continue

  base=$(default_branch "$repo")
  if [ "$base" = "$head" ]; then
    SKIPPED+=("${repo}	head==base (${head})")
    continue
  fi

  ahead=$(ahead_by "$repo" "$base" "$head")
  if [ -z "$ahead" ]; then
    SKIPPED+=("${repo}	compare failed (${head} vs ${base})")
    continue
  fi
  if [ "$ahead" -eq 0 ]; then
    SKIPPED+=("${repo}	already merged (${head} == ${base})")
    continue
  fi

  pr=$(existing_pr "$repo" "$base" "$head")
  PLAN+=("${repo}	${head}	${base}	${ahead}	${pr:-none}")
done

# Write plan file
{
  echo "# ${RELEASE_NAME} release-prep PR plan"
  echo "# Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo "# Mode: $([ $APPLY -eq 1 ] && echo APPLY || echo dry-run)"
  echo "# Planned PRs: ${#PLAN[@]}"
  echo "# Skipped:     ${#SKIPPED[@]}"
  echo
  echo "## Planned (repo<TAB>head<TAB>base<TAB>ahead<TAB>existing-pr)"
  printf '%s\n' "${PLAN[@]:-}"
  echo
  echo "## Skipped (repo<TAB>reason)"
  printf '%s\n' "${SKIPPED[@]:-}"
} > "$PLAN_FILE"

echo >&2
echo "Plan written to: $PLAN_FILE" >&2
echo "Planned: ${#PLAN[@]}   Skipped: ${#SKIPPED[@]}" >&2

# Pretty print plan to stderr
printf '\n%-50s %-15s %-10s %-7s %s\n' REPO HEAD BASE AHEAD EXISTING-PR >&2
printf '%-50s %-15s %-10s %-7s %s\n' \
  "--------------------------------------------------" \
  "---------------" "----------" "-------" "-----------" >&2
for row in "${PLAN[@]:-}"; do
  IFS=$'\t' read -r r h b a p <<<"$row"
  printf '%-50s %-15s %-10s %-7s %s\n' "$r" "$h" "$b" "$a" "$p" >&2
done

if [ $APPLY -eq 0 ]; then
  echo >&2
  echo "Dry run only. Re-run with --apply to create PRs." >&2
  exit 0
fi

echo >&2
echo "Creating PRs..." >&2
DRAFT_FLAG=()
[ $DRAFT -eq 1 ] && DRAFT_FLAG=(--draft)

CREATED=()
FAILED=()
SKIPPED_EXISTING=()

for row in "${PLAN[@]:-}"; do
  IFS=$'\t' read -r repo head base ahead pr <<<"$row"
  if [ "$pr" != "none" ]; then
    SKIPPED_EXISTING+=("${repo}#${pr}")
    echo "  [skip] ${repo}: PR #${pr} already open (${head} -> ${base})" >&2
    continue
  fi

  title="${RELEASE_NAME} prep: merge ${head} into ${base}"
  body=$(cat <<EOF
Merge \`${head}\` into \`${base}\` as part of **${RELEASE_NAME}** release preparation.

- Head: \`${head}\`
- Base: \`${base}\`
- Commits ahead at time of PR creation: ${ahead}

This PR was opened by a release-prep automation script. Please review the diff
before merging — some branches have diverged from trunk and may need a rebase
or selective merge rather than a straight merge.
EOF
)

  if url=$(gh pr create --repo "${ORG}/${repo}" \
              --base "$base" --head "$head" \
              --title "$title" --body "$body" \
              "${DRAFT_FLAG[@]}" 2>&1); then
    CREATED+=("${repo}	${url}")
    echo "  [ok  ] ${repo}: ${url}" >&2
  else
    FAILED+=("${repo}	${url}")
    echo "  [fail] ${repo}: ${url}" >&2
  fi
done

{
  echo
  echo "## Apply results"
  echo "# Created:  ${#CREATED[@]}"
  echo "# Skipped (existing PR): ${#SKIPPED_EXISTING[@]}"
  echo "# Failed:   ${#FAILED[@]}"
  echo
  echo "### Created"
  printf '%s\n' "${CREATED[@]:-}"
  echo
  echo "### Skipped (existing PR)"
  printf '%s\n' "${SKIPPED_EXISTING[@]:-}"
  echo
  echo "### Failed"
  printf '%s\n' "${FAILED[@]:-}"
} >> "$PLAN_FILE"

echo >&2
echo "Created ${#CREATED[@]} PRs. Skipped ${#SKIPPED_EXISTING[@]} (existing). Failed ${#FAILED[@]}." >&2
echo "See: $PLAN_FILE" >&2
