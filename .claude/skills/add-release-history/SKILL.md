---
name: add-release-history
description: Add release history files for Mage-OS or Magento versions by fetching package data from the upstream composer repository. Use this skill whenever the user asks to add, create, or generate history files for a Mage-OS or Magento release version (e.g. "add history files for Mage-OS 2.3.0", "add Magento 2.4.9 history", "create release history for 2.2.2"). Also use when the user mentions adding a new version to this repository's history.
---

# Add Release History Files

This skill automates adding release history files for a new Mage-OS or Magento version. It fetches package metadata from the upstream composer repository, creates the three required history JSON files, validates them, details all changes vs the prior version, and opens a PR.

## What are history files?

The `resource/history/{vendor}/` directory stores composer package snapshots for each release. Three files per version:

| File | Purpose | Content |
|------|---------|---------|
| `magento2-base/{VERSION}.json` | Core platform dependencies and file map | Full composer.json: name, require, conflict, replace, extra (chmod, component_paths, map) |
| `product-community-edition/{VERSION}.json` | Vendor-specific add-on packages | Only the add-on packages that differentiate from core, plus `extra.magento_version` (Mage-OS only) |
| `project-community-edition/{VERSION}.json` | Project installer plugins | Just the composer plugin dependencies |

The product-community-edition file is the trickiest — it must include only the vendor-specific add-on packages (like `aligent/magento2-pci-4-compatibility`, `mage-os/module-automatic-translation`, etc. for Mage-OS; or `adobe-commerce/os-extensions-metapackage`, `magento/inventory-metapackage`, etc. for Magento), not packages already required by magento2-base. The helper script determines this by diffing product-community-edition's require against magento2-base's require for the same version.

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
- Fetches all three packages from the upstream composer repository
- Determines add-on packages by diffing product-community-edition's require against magento2-base's require for the same version (anything not in magento2-base is an add-on)
- Reports new/removed add-ons compared to the previous version's history file
- Writes the three JSON files with correct per-vendor indentation
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
