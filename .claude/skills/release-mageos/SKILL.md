---
name: release-mageos
description: Orchestrate a full Mage-OS release — preflight gate checks, preview build, artifact verification, production build, and all the release artifacts (GitHub release, website post, social copy). Use when the user is shipping a Mage-OS version and wants the whole process driven, e.g. "release 3.4.0", "let's ship 3.5.0", "run the release process", "what's left for the release". Also use for the individual phases ("run release preflight", "verify the built packages against 3.3.0").
---

# Release a Mage-OS Version

Drives a Mage-OS release end to end as a **gated checklist**, not an unattended script. Each phase verifies its preconditions, does the mechanical work, and stops at points where a human has to decide.

This skill sequences the existing release skills rather than replacing them:

| Phase | Delegates to |
|---|---|
| Preview analysis | [[analyze-release-preview]] |
| History files | [[add-release-history]] |
| Branch coverage (major/minor only) | [[audit-release-branches]], [[prep-release-prs]] |
| Maintainer status update | [[summarize-release-status]] |

## Required inputs

1. **Target version** (e.g. `3.4.0`)
2. **Upstream Magento version** (e.g. `2.4.9`)

Determine the previous version automatically from `repo.mage-os.org` — highest published version below the target. Confirm with the user at a major-version boundary.

**Upstream version gotcha:** Adobe ships some security fixes as *isolated patches* (e.g. `249-2026-08-001-CE`) rather than tagged releases. When that happens there is **no new upstream tag** and `upstream_release` stays at the current value. Check `magento/magento2` tags before assuming a bump. Getting this wrong silently produces a wrong `extra.magento_version` in every metapackage.

---

## Phase 1 — Preflight gates

```bash
./.claude/skills/release-mageos/scripts/preflight.sh <TARGET_VERSION> [UPSTREAM_VERSION]
```

Checks, in order:

1. **Previous release's history files are merged.** If `resource/history/mage-os/*/<PREV>.json` is missing, **stop**. Building without them makes the previous release's packages drift on rebuild. This is the single most important gate.
2. **Target tag does not already exist** in `mage-os/mageos-magento2` — guards against re-releasing.
3. **Target is not already published** on repo.mage-os.org.
4. **supported-version matrix entry exists** for the target in `mage-os/github-actions@main` — *and* `supported-version/dist/index.js` actually contains it. The source JSON being right does not mean the bundle was rebuilt; `dist/` is what CI consumes.
5. **`gh` is authenticated as the collaborator account.** Two accounts are usually configured; `marcelmtz` is the collaborator, `marcelswiftotter` gets "must be a collaborator" on PR create/edit.
6. **Bundled-repo survey** — which repos have commits since the previous tag.

Any FAIL blocks the release. WARNs are judgment calls — surface them and ask.

> **Do not trust the repo survey's commit counts.** `push-release-tag.yml` creates a `Release X.Y.Z` commit that is not on `main`, so tags sit on a diverged lineage and `git compare <tag>...main` reports commits as "ahead" that already shipped. It is a *hint about where to look*, never evidence. Phase 3 is what actually establishes what changed.

## Phase 2 — Preview build

Dispatch **Build, deploy & check Release** (`.github/workflows/build-mageos-release.yml`):

| Input | Value |
|---|---|
| `repo` | `https://preview-repo.mage-os.org/` |
| `remote_dir` | `/var/www/preview-repo.mage-os.org/html/` |
| `mageos_release` | target version |
| `upstream_release` | upstream version |
| `publish_tag` | **false** |

Poll until complete. Confirm the **Publish release tag** job is `skipped` — if it ran, the wrong inputs were used.

Then run [[analyze-release-preview]].

**Known non-finding:** the installation-check matrix is built from *published* versions, so it never covers the version being released. Every green preview has this hole. Do not report it as a pass for the new version; recommend a manual `composer create-project` against the preview repo.

## Phase 3 — Artifact verification

The load-bearing phase. Proves what actually shipped, independent of git history.

```bash
php ./.claude/skills/release-mageos/scripts/verify-packages.php <PREV> <NEW> \
  --packages=module-cms,module-review,module-catalog
# or, for the definitive full sweep (slow — downloads every package twice):
php ./.claude/skills/release-mageos/scripts/verify-packages.php <PREV> <NEW> --all
```

For each package it downloads the previous published zip and the new one, unzips both, and diffs, ignoring `composer.json` (which always differs by version bump). Output is the set of packages with **real content changes**.

Use it to confirm:

- Every change intended for this release is present in a built package
- Nothing unexpected changed
- Packages that *look* changed from commit counts are actually identical

Start from the PRs the release is supposed to contain, map each to its package, and verify. Anything in the diff that no PR explains needs an answer before shipping.

## Phase 4 — Human gate

Present: the dependency diff, the verified content changes, contributors, and any behavior changes needing release-note treatment. **Wait for explicit go/no-go.** Do not dispatch the production build on inference.

## Phase 5 — Production build

Same workflow, with:

| Input | Value |
|---|---|
| `repo` | `https://repo.mage-os.org/` |
| `remote_dir` | `/var/www/repo.mage-os.org/html/` |
| `publish_tag` | **true** |

`publish_tag: true` triggers `push-release-tag.yml`, which creates and pushes the version tag in every source repo. **There is no manual tagging step.**

The deploy job is gated to `["vinai", "rhoerr", "marcelmtz", "mage-os-ci"]`.

Afterwards confirm the target version is live on repo.mage-os.org before continuing.

## Phase 6 — Release artifacts

Generate all of these from **one shared content model** so they cannot drift:

### 6a. GitHub release

Match the previous release exactly: name = bare version, tag = bare version, `prerelease: false`, target `main`.

```bash
gh release create <VERSION> -R mage-os/mageos-magento2 --draft --verify-tag \
  --title "<VERSION>" --notes-file <notes.md>
```

Always `--draft` first. `--verify-tag` prevents creating a stray tag. To publish:

```bash
gh release edit <VERSION> -R mage-os/mageos-magento2 --draft=false --latest
```

`--latest` is required — GitHub does not infer it from the version number, so without it the badge stays on the old release.

Structure (from the 3.3.0/3.4.0 releases): header (`**Released:**` / `**Upstream:**`) → intro + upgrade command → Security → Fixes → Bundled add-on updates → Upgrade notes → Contributors.

### 6b. Website post — `mage-os/mage-os-org`

**This repo is forked.** Verify remotes before branching:

- `origin` → the user's fork (`marcelmtz/mage-os-org`)
- `source` → upstream (`mage-os/mage-os-org`) — note it is **not** called `upstream`

Branch from **`source/main`**, never `origin/main` — the fork's main is routinely dozens of commits stale. Push to `origin`, open the PR against `mage-os/mage-os-org`.

```bash
git fetch source && git checkout -b release/<X-Y-Z>-announcement source/main
```

File: `src/data/post/YYYY-MM-DD-mage-os-<x>-<y>-<z>-release.md`. Copy the previous release post's frontmatter shape; release posts use `~/assets/images/blog/2026/New-Mage-OS-Website.png` and `author: mage-os-team`.

Post URL is `/<category-slug>/<filename-stem>` with **no trailing slash** (`trailingSlash: false`), so:
`https://mage-os.org/releases/YYYY-MM-DD-mage-os-<x>-<y>-<z>-release`

Sections: intro → Security → Other fixes → Upgrade notes → Our foundation (upstream base, certified stack, previous version EOL) → Thanks → How to upgrade.

### 6c. Social copy

**LinkedIn** — plain text only; LinkedIn strips Markdown, so `**bold**` renders as literal asterisks. Use `→` for bullets. Longer, contextual, hashtags at the end.

**Discord** — Markdown renders. Keep it tight, include the copy-pasteable upgrade command, and wrap URLs in `<...>` to suppress duplicate embed cards.

**Ordering:** the website PR must be merged and the site rebuilt *before* the GitHub release is published or anything is posted — the announcement URL is referenced in all of them and 404s until then.

## Phase 7 — Post-release

Run [[add-release-history]] for the new version. It only works after the production build, since it reads published package metadata. **That PR must merge before the next release builds** — it is the Phase 1 gate for the following release.

---

## Contributors

Build the list from **two** sources, not one:

1. Commit authors across the bundled repos since the previous tag
2. **Release-engineering work**, which is invisible to `git log` on the content repos — history-file PRs, supported-version matrix entries, build dispatch, patch porting

Missing the second category is the default failure mode. Ask who drove the release machinery before finalizing.

Order the list alphabetically, case-insensitive, matching previous posts.

## Security releases

- If the release ports an Adobe isolated patch, link the bulletin (`APSBxx-xx`) for CVEs and severities rather than restating them. Do not invent CVE identifiers or CVSS vectors — if the bulletin is unreachable, leave them out and say so.
- **Never assume attack prerequisites from the class of fix.** Check what the controller actually is: `Controller\Adminhtml\*` is admin, `Controller\Account\*` is storefront. A blanket "requires an authenticated admin session" is wrong the moment one fix is storefront-facing or unauthenticated.
- Call out behavior changes prominently, in both intro and upgrade notes, when a fix removes capability that admins currently have. Where the relevant permissions already exist in the previous release, say so — merchants can then fix their roles *before* upgrading.
- If a bulletin lists more issues than the release ships, address the gap explicitly or point at the bulletin without implying completeness.

## Known traps

| Trap | Reality |
|---|---|
| `git compare <tag>...main` | Lies — release commits sit on a diverged lineage. Diff published artifacts. |
| `dist/index.js` in github-actions | Must be verified to contain new data; source JSON alone is not enough. |
| `mage-os-org` remotes | `origin` = fork (often stale), `source` = upstream. |
| `gh` account | Two configured; only the collaborator can create/edit PRs. |
| Composer `audit.block-insecure` | Breaks integrity checks when an advisory hits a pinned dep. `COMPOSER_NO_AUDIT=1` does **not** disable it — only `composer config audit.block-insecure false`. |
| Installation-check matrix | Never covers the version being released. |
| Isolated patches | No upstream tag; `upstream_release` does not move. |
| `--latest` on release publish | Not inferred from the version number. |
| Exact version pins | Core packages are pinned exactly, so per-package upgrades need inline aliases and are rarely practical advice. |
