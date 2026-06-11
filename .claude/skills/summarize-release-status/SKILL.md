---
name: summarize-release-status
description: Use when the user asks for a Mage-OS release-prep status update to share with other maintainers — e.g. "summarize release status for Discord", "write a maintainer update", "status of 3.0 prep", "draft a status message about the release branches", or after running the branch audit / PR-prep skills and the user wants the takeaway formatted for sharing.
---

# Summarize Release Status for Maintainers

Produces a concise, copy-paste-ready maintainer update (Discord-style) summarizing the state of branch coverage and PR readiness for a Mage-OS release. Consumes the output files from [[audit-release-branches]] and/or [[prep-release-prs]].

## When to use

- After running an audit / PR-prep pass, when the user wants a shareable update.
- Periodic check-ins to maintainers about release progress.
- Catching up new maintainers on where the release stands.

## When NOT to use

- Full release notes (use [[analyze-release-preview]] instead).
- Per-PR status (just link the PRs directly).
- Internal-only tracking (a plain `.txt` file is fine).

## Input data

Whichever of these exist in the working directory:

- `repos-with-release-<X>.x.txt` — output of `find-repos-with-branch.sh`
- `develop-vs-trunk.txt` — output of `find-unmerged-develop.sh`
- `release-prs-plan.txt` — output of `open-release-prs.sh` (especially after `--apply` so it contains PR URLs)

## Output shape

Markdown chunks suitable for Discord. Aim for short, scannable, no emoji unless the user asks for them. Structure:

1. **One-sentence header** — what release, what was scanned.
2. **`release/3.x` already cut** — bulleted list of repos.
3. **`develop` / `2.4-develop` ahead of trunk** — table with repo, branch, commits ahead. Order alphabetically.
4. **Next step / status** — what automation has run, what's pending, exclusions and why.
5. **Pointer** — where the scripts and outputs live for anyone who wants to re-run.

Keep the whole thing under ~25 lines so it fits in one Discord message. If a section is empty, omit it rather than printing "(none)".

## Example

The version numbers below are illustrative for the 3.0 cycle — substitute the actual release the user is preparing (4.0, 5.0, …).

```
**Mage-OS 3.0 release prep — branch status**

Scanned all non-mirror repos in `mage-os` (65 total, forks included).

**`release/3.x` already cut (5 repos, ready to go):**
- generate-mirror-repo-js
- mageos-inventory
- mageos-magento2
- mageos-magento2-page-builder
- mageos-security-package

**`develop` / `2.4-develop` ahead of `main` (need merging for 3.0):**
| Repo | Branch | Commits ahead |
|---|---|---|
| mageos-PHPCompatibilityFork | develop | 8 |
| mageos-adobe-stock-integration | develop | 33 |
| ...

**Next step:** PR automation ready (12 PRs planned). `mageos-magento2` excluded — pre-merged manually both directions. Will run after maintainer review.
```

## Tips

- Always quote the absolute commit-ahead numbers — maintainers use them to gauge merge complexity.
- Call out diverged branches (high `behind` count) explicitly — they may not merge cleanly.
- If [[prep-release-prs]] has been applied, include a flat list of PR URLs at the end so reviewers can jump in directly.
- Re-running the audit before writing the summary keeps numbers current; counts change as PRs merge.
