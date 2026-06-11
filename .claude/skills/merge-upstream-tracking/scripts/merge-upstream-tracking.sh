#!/usr/bin/env bash
#
# Merge upstream-tracking branches into the Mage-OS default branch across the
# mage-os org, preserving Mage-OS CI files.
#
# Each mageos-* repo has a default branch (mage-os or main) carrying CI files,
# and a tracking branch (main, master, 2.4-develop, etc.) auto-synced from
# mirror-* repos. This script merges tracking into default, resolving conflicts
# in favour of Mage-OS CI files.
#
# Defaults to DRY RUN. Pass --apply to clone, merge, push, and create PRs.
#
# Usage:
#   ./merge-upstream-tracking.sh
#   ./merge-upstream-tracking.sh --apply
#   ./merge-upstream-tracking.sh --apply --repo mageos-magento-zend-db --repo mageos-magento2-sample-data
#   ./merge-upstream-tracking.sh --apply --exclude mageos-magento2
#
set -euo pipefail

ORG="mage-os"
APPLY=0
BRANCH="merge/upstream-$(date +%Y-%m-%d)"
WORKDIR="/tmp/merge-upstream-work"
PLAN_FILE="upstream-merge-plan.txt"
ONLY_REPOS=()
EXCLUDE=()

# Mage-OS CI files to preserve during merge
CI_FILES=(
  ".github/workflows/merge-upstream-changes.yml"
  ".github/workflows/sansec-ecomscan.yml"
  "CODEOWNERS"
)

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)    APPLY=1; shift ;;
    --branch)   BRANCH="$2"; shift 2 ;;
    --workdir)  WORKDIR="$2"; shift 2 ;;
    --plan-file) PLAN_FILE="$2"; shift 2 ;;
    --repo)     ONLY_REPOS+=("$2"); shift 2 ;;
    --exclude)  EXCLUDE+=("$2"); shift 2 ;;
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

is_selected() {
  # If --repo was used, only process those repos; otherwise process all.
  [ "${#ONLY_REPOS[@]}" -eq 0 ] && return 0
  local r="$1" x
  for x in "${ONLY_REPOS[@]}"; do
    [ "$x" = "$r" ] && return 0
  done
  return 1
}

command -v gh  >/dev/null || { echo "gh CLI is required" >&2; exit 1; }
command -v jq  >/dev/null || { echo "jq is required" >&2; exit 1; }
command -v git >/dev/null || { echo "git is required" >&2; exit 1; }

# Known upstream-tracking branch names (exact match)
TRACKING_NAMES=("main" "master" "develop" "2.4-develop")

is_tracking_candidate() {
  local b="$1"
  # Exact match against known tracking names
  for name in "${TRACKING_NAMES[@]}"; do
    [ "$b" = "$name" ] && return 0
  done
  # Version-style branches: N.N.x, N.x, N.N-production, N.N-develop
  [[ "$b" =~ ^[0-9]+\.[0-9]+\.x$ ]] && return 0
  [[ "$b" =~ ^[0-9]+\.x$ ]] && return 0
  [[ "$b" =~ ^[0-9]+\.[0-9]+-[a-z]+$ ]] && return 0
  return 1
}

default_branch() {
  gh api -H "Accept: application/vnd.github+json" \
    "repos/${ORG}/$1" --jq '.default_branch'
}

is_fork() {
  gh api -H "Accept: application/vnd.github+json" \
    "repos/${ORG}/$1" --jq '.fork'
}

ahead_by() {
  local result
  result=$(gh api -H "Accept: application/vnd.github+json" \
    "repos/${ORG}/$1/compare/$2...$3" --jq '.ahead_by' 2>/dev/null) || true
  # Validate it's an integer (API may return JSON error object)
  [[ "$result" =~ ^[0-9]+$ ]] && echo "$result" || echo ""
}

existing_pr() {
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

PLAN=()       # repo<TAB>tracking<TAB>default<TAB>ahead<TAB>fork<TAB>existing-pr-or-none
SKIPPED=()    # repo<TAB>reason

for repo in "${REPOS[@]}"; do
  if ! is_selected "$repo"; then continue; fi
  if is_excluded "$repo"; then
    SKIPPED+=("${repo}	excluded via --exclude")
    continue
  fi

  defbranch=$(default_branch "$repo")

  # List branches, find tracking branch (non-default, non-skip-prefix)
  mapfile -t branches < <(
    gh api -H "Accept: application/vnd.github+json" \
      "repos/${ORG}/${repo}/branches" --paginate --jq '.[].name' 2>/dev/null
  )

  tracking=""
  for b in "${branches[@]}"; do
    [ "$b" = "$defbranch" ] && continue
    is_tracking_candidate "$b" || continue
    tracking="$b"
    break
  done

  if [ -z "$tracking" ]; then
    SKIPPED+=("${repo}	no tracking branch found")
    continue
  fi

  ahead=$(ahead_by "$repo" "$defbranch" "$tracking")
  if [ -z "$ahead" ]; then
    SKIPPED+=("${repo}	compare failed (${tracking} vs ${defbranch})")
    continue
  fi
  if [ "$ahead" -eq 0 ]; then
    SKIPPED+=("${repo}	already merged (${tracking} == ${defbranch})")
    continue
  fi

  fork=$(is_fork "$repo")
  pr=$(existing_pr "$repo" "$defbranch" "$BRANCH")
  PLAN+=("${repo}	${tracking}	${defbranch}	${ahead}	${fork}	${pr:-none}")
done

# Write plan file header
{
  echo "# Upstream tracking-branch merge plan"
  echo "# Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo "# PR branch: ${BRANCH}"
  echo "# Mode: $([ $APPLY -eq 1 ] && echo APPLY || echo dry-run)"
  echo "# Planned merges: ${#PLAN[@]}"
  echo "# Skipped:        ${#SKIPPED[@]}"
  echo
  echo "## Planned (repo<TAB>tracking<TAB>default<TAB>ahead<TAB>fork<TAB>existing-pr)"
  printf '%s\n' "${PLAN[@]:-}"
  echo
  echo "## Skipped (repo<TAB>reason)"
  printf '%s\n' "${SKIPPED[@]:-}"
} > "$PLAN_FILE"

echo >&2
echo "Plan written to: $PLAN_FILE" >&2
echo "Planned: ${#PLAN[@]}   Skipped: ${#SKIPPED[@]}" >&2

# Pretty print plan to stderr
printf '\n%-55s %-15s %-10s %-7s %-6s %s\n' \
  REPO TRACKING DEFAULT AHEAD FORK EXISTING-PR >&2
printf '%-55s %-15s %-10s %-7s %-6s %s\n' \
  "-------------------------------------------------------" \
  "---------------" "----------" "-------" "------" "-----------" >&2
for row in "${PLAN[@]:-}"; do
  IFS=$'\t' read -r r t d a f p <<<"$row"
  printf '%-55s %-15s %-10s %-7s %-6s %s\n' "$r" "$t" "$d" "$a" "$f" "$p" >&2
done

if [ $APPLY -eq 0 ]; then
  echo >&2
  echo "Dry run only. Re-run with --apply to clone, merge, push, and create PRs." >&2
  exit 0
fi

# --- Apply mode ---

mkdir -p "$WORKDIR"

CREATED=()
FAILED=()
SKIPPED_EXISTING=()

do_merge() {
  local repo="$1" tracking="$2" defbranch="$3" fork="$4"
  local repo_dir="${WORKDIR}/${repo}"

  echo >&2
  echo "=== ${repo}: ${tracking} -> ${defbranch} ===" >&2

  # Clone
  if [ -d "$repo_dir" ]; then
    echo "  [info] Using existing clone at ${repo_dir}" >&2
    git -C "$repo_dir" fetch origin >/dev/null 2>&1
  else
    gh repo clone "${ORG}/${repo}" "$repo_dir" -- --quiet 2>&1
  fi

  cd "$repo_dir"

  # Clean up any prior merge branch
  git checkout "$defbranch" -- 2>/dev/null || git checkout "$defbranch"
  git reset --hard "origin/${defbranch}" >/dev/null 2>&1
  git branch -D "$BRANCH" 2>/dev/null || true

  # Create PR branch
  git checkout -b "$BRANCH"

  # Merge tracking branch
  if git merge "origin/${tracking}" --no-edit 2>&1; then
    echo "  [info] Merge succeeded cleanly" >&2
  else
    echo "  [info] Merge had conflicts, resolving..." >&2
    local conflicted
    conflicted=$(git diff --name-only --diff-filter=U 2>/dev/null || true)

    for f in $conflicted; do
      local is_ci=0
      for ci in "${CI_FILES[@]}"; do
        [ "$f" = "$ci" ] && { is_ci=1; break; }
      done
      if [ $is_ci -eq 1 ]; then
        echo "    Keeping ours: $f" >&2
        git checkout --ours "$f" && git add "$f"
      else
        echo "    Taking theirs: $f" >&2
        git checkout --theirs "$f" && git add "$f"
      fi
    done
    git commit --no-edit
  fi

  # Restore any CI files silently deleted by the merge
  local restored=0
  for f in "${CI_FILES[@]}"; do
    if [ ! -f "$f" ]; then
      if git show "${defbranch}:${f}" >/dev/null 2>&1; then
        echo "    Restoring deleted: $f" >&2
        git checkout "$defbranch" -- "$f"
        restored=1
      fi
    fi
  done
  if [ $restored -eq 1 ]; then
    git add "${CI_FILES[@]}" 2>/dev/null || true
    git commit --amend --no-edit
  fi

  # Verify CI files
  local missing=0
  for f in "${CI_FILES[@]}"; do
    if [ ! -f "$f" ]; then
      echo "  [WARN] Missing after merge: $f" >&2
      missing=1
    fi
  done
  [ $missing -eq 0 ] && echo "  [ok  ] All CI files preserved" >&2

  # Show diff summary
  local stat
  stat=$(git diff --stat "${defbranch}...${BRANCH}" 2>/dev/null || echo "(no file changes)")
  if [ -n "$stat" ]; then
    echo "  [info] Diff: ${stat}" >&2
  else
    echo "  [info] No file-level changes (history reconciliation only)" >&2
  fi

  # Push
  git push -u origin "$BRANCH" --force-with-lease 2>&1

  # Create PR (fork repos need --repo to target the correct repo)
  local pr_body
  pr_body=$(cat <<EOF
## Summary
- Sync tracking branch \`${tracking}\` into Mage-OS branch \`${defbranch}\`
- Preserves all Mage-OS CI files (merge-upstream-changes, sansec-ecomscan, CODEOWNERS)

Created by \`merge-upstream-tracking.sh\`.
EOF
)
  local pr_url
  if pr_url=$(gh pr create \
      --repo "${ORG}/${repo}" \
      --head "$BRANCH" \
      --base "$defbranch" \
      --title "Merge upstream (${tracking}) into ${defbranch}" \
      --body "$pr_body" 2>&1); then
    echo "  [ok  ] PR: ${pr_url}" >&2
    CREATED+=("${repo}	${pr_url}")
  else
    echo "  [fail] PR creation failed: ${pr_url}" >&2
    FAILED+=("${repo}	${pr_url}")
  fi

  cd - >/dev/null
}

echo >&2
echo "Creating merges and PRs..." >&2

for row in "${PLAN[@]:-}"; do
  IFS=$'\t' read -r repo tracking defbranch ahead fork pr <<<"$row"
  if [ "$pr" != "none" ]; then
    SKIPPED_EXISTING+=("${repo}#${pr}")
    echo "  [skip] ${repo}: PR #${pr} already open (${tracking} -> ${defbranch})" >&2
    continue
  fi

  if do_merge "$repo" "$tracking" "$defbranch" "$fork"; then
    :
  else
    FAILED+=("${repo}	merge or push failed")
    echo "  [fail] ${repo}: merge or push failed" >&2
  fi
done

# Append results to plan file
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
