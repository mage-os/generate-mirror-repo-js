---
name: merge-upstream-tracking
description: Use when syncing upstream mirror content into the Mage-OS default branches across the org — e.g. "merge upstream into mage-os branches", "sync tracking branches", "merge mirror content into main/mage-os", "bring in upstream PHP 8.5 fixes".
---

# Merge Upstream Tracking Branches into Mage-OS Branches

Merges each repo's upstream-tracking branch into its Mage-OS default branch, preserving Mage-OS CI files that upstream may have deleted. Used during release prep to reconcile diverged histories between the automated mirror sync and the Mage-OS branch.

## Background

Each `mageos-*` repo has two key branches:

- **Mage-OS branch** (the default branch — `mage-os` or `main`): carries Mage-OS CI files and any org-specific changes.
- **Tracking branch** (the other branch — `main`, `master`, `2.4-develop`, `2.21.x`, etc.): auto-synced daily from `mirror-*` repos via the `merge-upstream-changes` workflow.

Over time these diverge: both get infra commits (Terraform, Sansec) independently, and upstream code changes land on the tracking branch but not the Mage-OS branch. This skill reconciles them.

## When to use

- Before a Mage-OS release, to bring upstream changes into the default branches.
- When upstream has shipped PHP compatibility fixes, version bumps, or other changes that need to flow into the Mage-OS branches.
- Periodically, to keep tracking/default branch divergence low.

## When NOT to use

- For the main `mageos-magento2` monorepo — that has its own merge workflow.
- When a repo needs cherry-picks or rebases rather than a straight merge.
- For repos outside the `mage-os` org.

## Required tools

- `gh` CLI authenticated with write access to `mage-os` repos
- `jq`
- `git`

## Script

`scripts/merge-upstream-tracking.sh` — defaults to **dry run**. Run it once to inspect the plan, then re-run with `--apply` to clone, merge, push, and create PRs.

```bash
# Dry run — scan all non-mirror repos, show what would be merged:
./merge-upstream-tracking.sh

# Apply — clone, merge, push, and create PRs:
./merge-upstream-tracking.sh --apply

# Only process specific repos:
./merge-upstream-tracking.sh --apply --repo mageos-magento-zend-db --repo mageos-magento2-sample-data

# Skip specific repos:
./merge-upstream-tracking.sh --apply --exclude mageos-magento2

# Custom branch name (default: merge/upstream-YYYY-MM-DD):
./merge-upstream-tracking.sh --apply --branch merge/upstream-sync

# Custom work directory:
./merge-upstream-tracking.sh --apply --workdir /tmp/my-merge-work
```

Flags:
- `--apply` — actually clone, merge, push, and create PRs (without this, no writes happen)
- `--repo <name>` — only process this repo (repeatable; if omitted, scans all)
- `--exclude <name>` — skip a repo (repeatable)
- `--branch <name>` — PR branch name (default: `merge/upstream-YYYY-MM-DD`)
- `--workdir <path>` — directory for cloned repos (default: `/tmp/merge-upstream-work`)
- `--plan-file <path>` — override the plan output path

## Behavior

For each non `mirror-*`, non-archived repo in `mage-os`:

1. Detect the **default branch** (the Mage-OS branch).
2. Detect the **tracking branch** — the non-default branch that carries upstream content. Skips repos with fewer than 2 branches or where the only other branches are merge/release branches.
3. Compare default..tracking — report `ahead_by` (commits on tracking not in default). Skip if tracking is not ahead.
4. Check for an existing open PR with the same merge direction — skip if one exists.
5. In `--apply` mode:
   a. Clone the repo.
   b. Check out the default branch, create the PR branch.
   c. Merge the tracking branch.
   d. Resolve conflicts: keep Mage-OS versions of CI files, take upstream for everything else.
   e. Restore any CI files silently deleted by the merge.
   f. Push and create a PR (uses `--repo` flag for fork repos).
6. Write results to the plan file.

### CI files preserved

The script protects these Mage-OS CI files from deletion or overwrite during merge:

- `.github/workflows/merge-upstream-changes.yml`
- `.github/workflows/sansec-ecomscan.yml`
- `CODEOWNERS`

If a conflict occurs on these files, the Mage-OS (ours) version is kept. If the merge silently deletes them (because upstream removed them), they are restored from the default branch.

## Typical workflow

1. Run [[audit-release-branches]] to get a general picture of org state.
2. `./merge-upstream-tracking.sh` — dry run; review the plan table.
3. `./merge-upstream-tracking.sh --apply` — execute merges and create PRs.
4. Review the PRs (especially repos with code changes, not just infra reconciliation).
5. Report results via [[summarize-release-status]].

## Notes

- Fork repos (those forked from `mirror-*`) require `--repo` flag on `gh pr create` — the script handles this automatically.
- Repos where the tracking branch has only infra commits (Terraform, Sansec) will produce PRs with merge commits but no file diff. These are safe to merge and reconcile the git history.
- The `merge-upstream-changes` workflow runs daily. If this skill shows no repos need merging, the automated sync is working correctly and no manual intervention is needed.
