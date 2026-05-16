---
name: prep-release-prs
description: Use when preparing a Mage-OS major/minor release and you need to open the batch of PRs that merge release/3.x (or other release branch) and unmerged develop branches into each repo's default branch — e.g. "open the release prep PRs", "create PRs for 3.0", "merge release/3.x into main everywhere", "open the develop-into-main PRs".
---

# Open Release-Prep PRs Across the Mage-OS Org

Bulk-opens PRs across every relevant repo in the `mage-os` org to merge release content into trunk. Used after [[audit-release-branches]] has identified the repos in scope.

For each repo it prefers `release/3.x` as the head branch if present; otherwise it falls back to `develop` or `2.4-develop`. The base is the repo's actual default branch (auto-detected — handles `main` vs `master`).

## When to use

- A Mage-OS release is being prepped and the audit shows N repos with merge-able content.
- All repos to be touched are known and reviewed (see [[audit-release-branches]] output).
- You want one PR per repo, opened consistently with a release-prep title and body.

## When NOT to use

- One-off merges — just open the PR manually with `gh pr create`.
- Repos outside the `mage-os` org.
- When repos need cherry-picks / rebases rather than straight merges — open those manually.

## Required tools

- `gh` CLI authenticated with write access to the target repos (an account with maintainer / admin on `mage-os`)
- `jq`

## Script

`scripts/open-release-prs.sh` — defaults to **dry run**. Run it once without `--apply` to inspect the plan, then re-run with `--apply` to actually create PRs.

```bash
# Dry run for the current Mage-OS 3.0 cycle (uses defaults).
./open-release-prs.sh

# Override release branch + label for a future release (e.g. 4.0):
./open-release-prs.sh \
  --release-branch release/4.x \
  --release-name "Mage-OS 4.0"

# Apply: creates PRs via `gh pr create`.
./open-release-prs.sh --apply

# As drafts (recommended for large diffs):
./open-release-prs.sh --apply --draft

# Skip specific repos (e.g. one that's been pre-merged manually):
./open-release-prs.sh --apply --exclude mageos-magento2
```

Flags:
- `--release-branch <branch>` — release head branch to look for (default `release/3.x`)
- `--release-name <label>` — human label used in PR title/body (default `Mage-OS 3.0`)
- `--apply` — actually create the PRs (without this, no writes happen)
- `--draft` — open as draft PRs
- `--exclude <repo>` — skip a repo (repeatable)
- `--plan-file <path>` — override the plan output path

## Behavior

For each non `mirror-*`, non-archived repo in `mage-os`:

1. Determine head branch: prefer `<release-branch>` (e.g. `release/3.x`), else `develop`, else `2.4-develop`. Skip if none exist.
2. Determine base: repo's default branch.
3. Compare base..head — skip if head is not ahead of base (already merged).
4. Look for an open PR with the same head/base — skip if one exists (idempotent).
5. Otherwise, queue or open a PR titled `<release-name> prep: merge <head> into <base>` with a body explaining the merge intent and noting commits-ahead.

The plan file (`release-prs-plan.txt` by default) records every planned, skipped, created, and failed PR with URLs.

## Typical workflow

1. Run [[audit-release-branches]] to know what's in scope.
2. `./open-release-prs.sh` — dry run; verify the table matches expectations.
3. Identify any repos to exclude (already-merged, requires manual care, etc.).
4. `./open-release-prs.sh --apply [--draft] [--exclude REPO ...]`
5. Hand the resulting PR URLs to maintainers for review (see [[summarize-release-status]] for the maintainer-facing message).

## Notes

- Defaults target the current cycle (`release/3.x`, `Mage-OS 3.0`). For future releases pass `--release-branch` and `--release-name` instead of editing the script.
- Auto-detects `main` vs `master` per repo via the GitHub API — do not hardcode.
- Large diverged branches (high `behind` count) may need rebase rather than merge; open those manually rather than letting this script create an unmergeable PR.
