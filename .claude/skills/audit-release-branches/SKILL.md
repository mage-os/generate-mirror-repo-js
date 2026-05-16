---
name: audit-release-branches
description: Use when preparing a Mage-OS major/minor release (e.g. "audit branches for 3.0", "which repos have release/3.x", "what still needs merging for 2.4.9", "find repos where develop is ahead of main") and you need a snapshot of release-branch coverage across every repo in the mage-os GitHub organization.
---

# Audit Release Branches Across the Mage-OS Org

Produces a snapshot of branch state across every non `mirror-*` repo in the `mage-os` GitHub org. Used to answer two questions during release prep:

1. **Which repos already have a release branch cut?** (e.g. `release/3.x`)
2. **Which repos have `develop` or `2.4-develop` commits not yet merged to `main`/`master`?** Those are candidates for merge before the release goes out.

## When to use

- Starting prep for a Mage-OS major or minor release.
- Verifying that all repos slated for the release have a release branch.
- Identifying stale `develop` branches that need merging into trunk.
- Producing data for the [[summarize-release-status]] skill.

## Required tools

- `gh` CLI (authenticated against an account with read access to `mage-os`)
- `jq`

## Scripts

Both live in `scripts/` next to this SKILL.md.

### `find-repos-with-branch.sh`

Lists every non-archived, non `mirror-*` repo in the `mage-os` org and reports which have the given branch.

```bash
./find-repos-with-branch.sh [branch] [output-file]
```

Defaults: branch `release/3.x`, output `repos-with-<branch-slug>.txt`. Forks are included. The output file separates **matched** (with HEAD sha) from **missing**.

### `find-unmerged-develop.sh`

Scans the same repo list for repos where `develop` or `2.4-develop` exists alongside `main` or `master`, and the develop branch is ahead of trunk.

```bash
./find-unmerged-develop.sh [output-file] [--exclude-with-branch <branch>]
```

Use `--exclude-with-branch release/3.x` to skip repos where a release branch is already cut (those are tracked separately).

The output file lists ahead-of-trunk repos with the `ahead`/`behind` commit counts so you can spot diverged branches that may need a rebase rather than a straight merge.

## Typical workflow

1. Pick a working directory for the release-prep artifacts (e.g. `tmp/release-process/`).
2. Run `find-repos-with-branch.sh release/3.x` — captures which repos already have the release branch.
3. Run `find-unmerged-develop.sh --exclude-with-branch release/3.x` — captures repos that still need a merge.
4. Hand off the resulting `.txt` files to [[prep-release-prs]] (to open the PRs) or [[summarize-release-status]] (to produce a maintainer-facing update).

## Notes

- Archived repos are excluded (`--no-archived`).
- `mirror-*` repos are excluded because they are downstream mirrors, not authoring repos.
- Forks are included — some Mage-OS repos are forks of Magento upstream (e.g. `mageos-magento2`).
- If you want a different release branch (e.g. `release/3.1.x`), pass it as the first arg to `find-repos-with-branch.sh`.
