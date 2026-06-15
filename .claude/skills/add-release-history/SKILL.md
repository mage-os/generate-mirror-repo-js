---
name: add-release-history
description: Add release history files for Mage-OS or Magento versions by fetching package data from the upstream composer repository. Use this skill whenever the user asks to add, create, or generate history files for a Mage-OS or Magento release version (e.g. "add history files for Mage-OS 2.3.0", "add Magento 2.4.9 history", "create release history for 2.2.2"). Also use when the user mentions adding a new version to this repository's history.
---

# Add Release History Files

This skill automates adding release history files for a new Mage-OS or Magento version. It fetches package metadata from the upstream composer repository, creates the required history JSON files, validates them, details all changes vs the prior version, and opens a PR.

## What are history files?

The `resource/history/{vendor}/` directory stores composer package snapshots for each release. Three core files per version, plus two minimal-edition files for Mage-OS from 3.0.0 onward:

| File | Purpose | Content |
|------|---------|---------|
| `magento2-base/{VERSION}.json` | Core platform dependencies and file map | Full composer.json: name, require, conflict, replace, extra (chmod, component_paths, map) |
| `product-community-edition/{VERSION}.json` | Vendor-specific add-on packages | Only the add-on packages that differentiate from core, plus `extra.magento_version` (Mage-OS only) |
| `project-community-edition/{VERSION}.json` | Project installer plugins | Just the composer plugin dependencies |
| `product-minimal-edition/{VERSION}.json` | Minimal distribution metapackage (Mage-OS, ≥ 3.0.0) | **Entire** composer.json, verbatim |
| `project-minimal-edition/{VERSION}.json` | Minimal distribution project installer (Mage-OS, ≥ 3.0.0) | **Entire** composer.json, verbatim |

The product-community-edition file is the trickiest — it must include only the vendor-specific add-on packages (like `aligent/magento2-pci-4-compatibility`, `mage-os/module-automatic-translation`, etc. for Mage-OS; or `adobe-commerce/os-extensions-metapackage`, `magento/inventory-metapackage`, etc. for Magento), not packages already required by magento2-base. The helper script determines this by diffing product-community-edition's require against magento2-base's require for the same version.

### Why the minimal-edition files are different

The community-edition files store only a **diff** (the add-on packages); the build reconstructs the full package by reading the git-tag composer.json and merging the diff on top. That cannot work for the minimal editions: their package list is a curated **subset** produced by a build-time filter that is deliberately skipped for historic rebuilds, so a re-build can't recreate it. Instead, the build detects a complete stored snapshot (it carries `prefer-stable`/`name`, which diff files don't) and emits it **verbatim**. Therefore the minimal files must contain the whole composer.json.

Two consequences the helper script handles automatically:
- **Source is the dist zip, not the p2 API.** The Composer v2 p2 API strips fields the verbatim emit depends on (`prefer-stable`, `config`, `minimum-stability`, `repositories`). The script reads composer.json directly from the published package zip so those survive.
- **`require` is sorted.** The generator emits `require` sorted by package name (issue #325 byte-compatibility), so the script ksorts `require` in the stored snapshot to match — otherwise the package checksum would change at the latest→historic transition. The `release-history-ordering` unit test guards this for `*-minimal-edition` from 3.0.0.

Minimal editions are **Mage-OS only** and **start at 3.0.0**. For Magento, or for Mage-OS versions before 3.0.0, the script skips them (the packages aren't published).

## Vendor differences

| Aspect | Mage-OS | Magento |
|--------|---------|---------|
| Source | repo.mage-os.org (public, Composer v2) | repo.magento.com (auth required, Composer v1) |
| History path | `resource/history/mage-os/` | `resource/history/magento/` |
| magento2-base indent | 2-space | 4-space |
| metapackage indent | 2-space | 2-space |
| `extra.magento_version` | Included in product-ce | Not included |

Magento fetches require credentials in `~/.composer/auth.json` for `repo.magento.com`. If missing, the script will error with a clear message.

## Step-by-step process

### 1. Parse the request

Extract the target version and vendor from the user's request. Default vendor is `mage-os`. If the user mentions "Magento" or uses a version like `2.4.x`, use `--vendor=magento`.

### 2. Prepare the branch

```bash
git checkout main
git pull origin main
git checkout -b release/{vendor}-{VERSION}
```

### 3. Fetch and write the history files

Run the helper script from the repository root:

```bash
php .claude/skills/add-release-history/scripts/fetch-release.php {VERSION} --vendor={vendor}
```

This script:
- Fetches the three community-edition packages from the upstream composer repository
- Determines add-on packages by diffing product-community-edition's require against magento2-base's require for the same version (anything not in magento2-base is an add-on)
- Reports new/removed add-ons compared to the previous version's history file
- For Mage-OS ≥ 3.0.0, also fetches the two minimal-edition packages' full composer.json from their dist zips and writes them verbatim (require ksorted); for Magento or older Mage-OS versions these are skipped automatically
- Writes the JSON files with correct per-vendor indentation
- Validates the JSON

If the script reports new or removed add-on packages, mention this to the user — it means the distribution changed what it bundles.

If the script fails because the version doesn't exist in the repository, tell the user and stop.

### 4. Detail all changes vs the prior version

After writing the files, diff each one against its predecessor. Use `diff` to get the raw changes, then summarize them in a table for the user showing:

- Package version bumps (distinguish trivial release-version bumps from actual dependency changes)
- New or removed dependencies
- Constraint changes (e.g. `^15.0` → `^15.0 <15.31.0`)
- Changes to the `magento_version` field (Mage-OS only)
- Any changes to the file map in magento2-base

Show the user this summary before proceeding.

### 5. Commit, push, and open a PR

```bash
git add resource/history/{vendor}/magento2-base/{VERSION}.json \
      resource/history/{vendor}/product-community-edition/{VERSION}.json \
      resource/history/{vendor}/project-community-edition/{VERSION}.json
# Mage-OS >= 3.0.0 also writes the minimal-edition snapshots:
git add resource/history/mage-os/product-minimal-edition/{VERSION}.json \
      resource/history/mage-os/project-minimal-edition/{VERSION}.json 2>/dev/null || true
```

Commit with message: `Add history files for {Vendor} {VERSION}`

Push to `release/{vendor}-{VERSION}` and open a PR. Include the change summary from step 4 in the PR body so reviewers can see exactly what changed.

Use this PR body format:

```
## Summary
- Add release history files for {Vendor} {VERSION}

## Changes vs {PREVIOUS_VERSION}

### magento2-base
{table or list of changes}

### product-community-edition
{table or list of changes}

### project-community-edition
{table or list of changes}

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
