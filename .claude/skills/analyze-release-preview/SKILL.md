---
name: analyze-release-preview
description: Analyze a Mage-OS release preview by comparing it against the previous version. Produces a full dependency diff, per-repo changelogs with PRs and contributors, and a risk assessment suitable for release notes. Use this skill whenever the user asks to analyze, compare, preview, diff, or prepare release notes for a Mage-OS version (e.g. "analyze 2.2.2 release", "what changed in 2.3.0 preview", "compare release preview", "release notes for 2.2.2", "diff 2.2.2 vs 2.2.1"). Also use when the user mentions checking or reviewing a release on preview-repo.mage-os.org.
---

# Analyze Mage-OS Release Preview

This skill compares a Mage-OS release preview against the previous released version to produce a comprehensive analysis covering dependency changes, code changes, contributors, and risk assessment. The output is designed to feed directly into release notes and release-readiness reviews.

## Data sources

- **New version**: Fetched from `preview-repo.mage-os.org` (or `repo.mage-os.org` if already released)
- **Previous version**: Fetched from `repo.mage-os.org` (production), falling back to history files in `resource/history/mage-os/` if needed
- **Changelogs**: Cloned from GitHub repos listed in `src/build-config/mageos-release-build-config.js` and `src/build-config/packages-config.js`

## Required inputs

The user must provide:
1. **Target version** — the Mage-OS version to analyze (e.g. `2.2.2`)
2. **Upstream Magento version** — the Magento release this maps to (e.g. `2.4.8-p4`)

The skill will automatically determine the previous Mage-OS version by looking at what's published on repo.mage-os.org.

## Step-by-step process

### 1. Determine versions

Parse the target version from the user's request. Ask for the upstream Magento version if not provided.

Determine the previous Mage-OS version automatically: fetch the version list from `repo.mage-os.org/p2/mage-os/product-community-edition.json` and pick the highest version below the target. If the previous version is ambiguous (e.g. major version boundary), confirm with the user.

### 2. Fetch package metadata

Run the helper script from the repository root:

```bash
php .claude/skills/analyze-release-preview/scripts/fetch-release-data.php \
  <PREVIOUS_VERSION> <NEW_VERSION> \
  [--source=preview-repo.mage-os.org]
```

Options:
- `--source=preview-repo.mage-os.org` (default) — fetch the new version from the preview repo
- `--source=repo.mage-os.org` — fetch from production (for post-release analysis)

The script outputs a JSON report to stdout containing:
- The full `require` section for all three metapackages (product-community-edition, magento2-base, project-community-edition) for both versions
- A structured diff showing added, removed, and changed dependencies
- The `extra.magento_version` for both versions

### 3. Identify changed repos

From the diff output, identify which Mage-OS repositories have code changes. The key signal is add-on packages whose version changed — these map to repos in `src/build-config/packages-config.js`.

Also check the core repo (`mageos-magento2`) for any changes between the two release tags by examining its git history. Even if the core packages are just version-bumped, there may be constraint changes (like the `webonyx/graphql-php` example) that originated from core commits.

The mapping from add-on package names to GitHub repos is:

| Package prefix | GitHub repo |
|---------------|-------------|
| `mage-os/module-automatic-translation` | `mage-os/module-automatic-translation` |
| `mage-os/module-inventory-reservations-grid` | `mage-os/module-inventory-reservations-grid` |
| `mage-os/module-meta-robots-tag` | `mage-os/module-meta-robots-tag` |
| `mage-os/module-page-builder-template-import-export` | `mage-os/module-pagebuilder-template-import-export` |
| `mage-os/module-page-builder-widget` | `mage-os/module-page-builder-widget` |
| `mage-os/module-theme-optimization` | `mage-os/module-theme-optimization` |
| `mage-os/theme-adminhtml-m137` | `mage-os/theme-adminhtml-m137` |
| `mage-os/security-package` (metapackage) | `mage-os/mageos-security-package` |
| `mage-os/inventory-metapackage` | `mage-os/mageos-inventory` |
| `mage-os/page-builder` (metapackage) | `mage-os/mageos-magento2-page-builder` |
| Core packages (framework, modules, themes, languages) | `mage-os/mageos-magento2` |

### 4. Gather changelogs from GitHub

For each repo with changes, fetch the git log. Use `gh` or `git clone --bare` + `git log`.

There are two categories of repos with different tagging strategies:

**Release-versioned repos** — these use Mage-OS release version numbers as tags (e.g. `2.2.1`). The *previous* release tag will exist, but the *new* release tag typically will NOT exist yet (it gets created by the release build workflow after this analysis). Always compare from the previous release tag to `main`:
```bash
git log --format="%H %an <%ae> %s" <PREV_VERSION>..main
```

These repos are: `mageos-magento2` (core), `mageos-security-package`, `mageos-inventory`, `mageos-magento2-page-builder`, `mageos-adobe-stock-integration`, `mageos-composer`, `mageos-composer-root-update-plugin`, `mageos-composer-dependency-version-audit-plugin`, `mageos-magento-composer-installer`, `mageos-magento-coding-standard`, `mageos-magento2-functional-testing-framework`, `mageos-magento-allure-phpunit`, `mageos-inventory-composer-installer`, `mageos-magento2-sample-data`, and the Zend/ZF fork repos.

**Independently-versioned add-on repos** — these have their own version tags (e.g. `1.0.2`, `2.1.1`) that are independent of the Mage-OS release number. Compare between the old and new add-on version tags:
```bash
git log --format="%H %an <%ae> %s" <OLD_ADDON_VERSION>..<NEW_ADDON_VERSION>
```
If the new tag doesn't exist yet, use `<OLD_ADDON_VERSION>..main`.

These repos are: `module-automatic-translation`, `module-inventory-reservations-grid`, `module-meta-robots-tag`, `module-pagebuilder-template-import-export`, `module-page-builder-widget`, `module-theme-optimization`, `theme-adminhtml-m137`.

For repos where only CI/infra commits exist (e.g. "Add Sansec eComscan workflow", "Managed by Terraform"), note these as non-code changes and exclude from the release notes.

### 5. Produce the analysis report

Structure the output as follows:

#### Header
```
## Mage-OS {VERSION} Release Analysis
**Upstream**: Magento {UPSTREAM_VERSION}
**Previous**: Mage-OS {PREV_VERSION}
**Source**: {preview-repo.mage-os.org | repo.mage-os.org}
```

#### Dependency changes table

For each metapackage (product-community-edition, magento2-base, project-community-edition), show a table of non-trivial changes. "Trivial" means a version pin simply bumped from `{PREV}` → `{NEW}` (e.g. `2.2.1` → `2.2.2`). Focus on:

- Add-on package version bumps (e.g. `module-automatic-translation 2.0.1 → 2.1.0`)
- Third-party constraint changes (e.g. `webonyx/graphql-php ^15.0 <15.31.0 → ^15.0 !=15.31.0 !=15.31.1`)
- New or removed dependencies
- Changes to `extra.magento_version`

Use this table format:
```
| Package | {PREV_VERSION} | {NEW_VERSION} | Change |
|---------|----------------|---------------|--------|
```

If a metapackage has no non-trivial changes, say so explicitly.

#### Per-repo changelog

For each repository with meaningful changes, list PRs/commits with:
- Commit hash (short)
- PR number and title (if it was a PR merge)
- Author
- Brief description of what changed

Skip repos with only CI/infra commits (mention them in a "CI-only changes" section at the end).

#### Risk assessment

For each meaningful change, assign a risk level:
- **NEGLIGIBLE** — cosmetic, cleanup, conflict removal
- **LOW** — constraint loosening, patch-level dependency bumps, small bug fixes
- **MEDIUM** — minor version dependency bumps, feature changes, reverts of previous changes
- **HIGH** — major version bumps, breaking constraint changes, security-related changes

Include a one-line rationale for each rating.

#### Contributors

List all human contributors (exclude CI bots like `mage-os-ci`, `mage-os-terraform[bot]`) with their GitHub handle and what they contributed. This section feeds directly into release notes credits.

### 6. Offer next steps

After presenting the report, offer:
- "Would you like me to draft formal release notes from this analysis?"
- "Would you like me to investigate any of the flagged risks in more detail?"
- "Would you like me to add history files for this release?" (triggers the `add-release-history` skill)
