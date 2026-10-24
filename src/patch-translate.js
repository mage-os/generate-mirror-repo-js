/**
 * Translates patch file paths between the Magento source tree layout
 * (app/code/Magento/Cms) and the installed Composer layout
 * (vendor/magento/module-cms).
 *
 * Adobe ships isolated security patches against an installed tree, so applying
 * one to this repository means rewriting every path in it. The two trees hold
 * byte-identical files, so the rewrite is total: no content is interpreted.
 */

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const packagesConfig = require('./build-config/packages-config');
// Required for its load-time side effect: mageos-release-build-config mutates
// the shared packages-config object in place, which is what renames the base
// package template to mage-os/magento2-base. Without this require the map
// would name magento/magento2-base and to-vendor output would carry the wrong
// namespace, and no test would fail.
require('./build-config/mageos-release-build-config');

/**
 * Directories whose immediate subdirectories are each their own package, as
 * opposed to packageIndividual entries which are a single package apiece.
 */
const packageDirsFor = (definition) => (definition.packageDirs || []).map(entry => entry.dir);

const individualEntriesFor = (definition) => (definition.packageIndividual || [])
  .filter(entry => typeof entry.dir === 'string');

const readComposerName = (git, dir) => {
  const raw = git(['show', `${git.ref}:${dir}/composer.json`], {allowFailure: true});
  if (!raw) return null;
  try {
    const name = JSON.parse(raw).name;
    return typeof name === 'string' && name.includes('/') ? name : null;
  } catch (exception) {
    return null;
  }
};

const templateName = (composerJsonPath) => {
  if (!composerJsonPath || !fs.existsSync(composerJsonPath)) return null;
  try {
    const name = JSON.parse(fs.readFileSync(composerJsonPath, 'utf8')).name;
    return typeof name === 'string' && name.includes('/') ? name : null;
  } catch (exception) {
    return null;
  }
};

const gitFor = (repoDir, ref) => {
  const git = (args, {allowFailure = false} = {}) => {
    try {
      return execFileSync('git', ['-C', repoDir, ...args], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 256,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (exception) {
      if (allowFailure) return null;
      throw exception;
    }
  };
  git.ref = ref;
  return git;
};

/**
 * Builds the package-name <-> source-directory mapping by reading each
 * package's own composer.json out of the given ref. The names are never
 * derived from the directory name: module directory CamelCase does not map to
 * package kebab-case by any rule the build itself relies on.
 */
const addRepoPackages = (toSource, {repoDir, ref, definition}) => {
  const git = gitFor(repoDir, ref);

  for (const dir of packageDirsFor(definition)) {
    const listing = git(['ls-tree', '--name-only', `${ref}:${dir}`], {allowFailure: true});
    if (!listing) continue;
    for (const entry of listing.split('\n').filter(Boolean)) {
      // dir '' means the repository root is the container, so each top level
      // directory is itself a package (inventory and security-package do this).
      const name_ = entry.replace(/\/$/, '');
      const packageDir = dir ? `${dir}/${name_}` : name_;
      const pkgName = readComposerName(git, packageDir);
      if (pkgName) toSource.set(pkgName, packageDir);
    }
  }

  for (const entry of individualEntriesFor(definition)) {
    // The base package has no composer.json in the tree; its name comes from the
    // template the build uses, and it maps to the repository root, which is where
    // lib/web, app/etc and the other unpackaged paths live.
    const name = entry.dir
      ? readComposerName(git, entry.dir)
      : templateName(entry.composerJsonPath);
    if (name) toSource.set(name, entry.dir);
  }

  return toSource;
};

/**
 * The repository's own top level entries at a ref: app, lib, setup, pub,
 * nginx.conf.sample and the rest.
 *
 * A patch path outside vendor/ is only a source tree path if it starts with one
 * of these. Without the check every unrecognised shape passes through unchanged
 * and is counted as translated, which is how a module-relative patch
 * (Model/GuestCart/..., etc/di.xml) reached git apply as if it were source
 * relative. Reading the tree rather than listing roots here keeps this from
 * drifting the way a hardcoded list would.
 */
const buildSourceRoots = ({repoDir, ref, gitRepoDir}) => {
  const roots = new Set();
  const dirs = gitRepoDir
    ? fs.readdirSync(gitRepoDir, {withFileTypes: true})
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(gitRepoDir, entry.name))
      .filter(dir => fs.existsSync(path.join(dir, '.git')))
    : [repoDir];

  for (const dir of dirs) {
    const head = ref || defaultRefOf(dir);
    if (!head) continue;
    const listing = gitFor(dir, head)(['ls-tree', '--name-only', head], {allowFailure: true});
    if (!listing) continue;
    for (const entry of listing.split('\n').filter(Boolean)) roots.add(entry.replace(/\/$/, ''));
  }
  return roots;
};

const dedupeBy = (entries, keyOf) => {
  const seen = new Set();
  return entries.filter(entry => {
    const key = keyOf(entry);
    if (typeof key !== 'string' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Whatever the checkout is currently on, so callers need not know each
 *  repository's default branch name (some use mage-os rather than main). */
const defaultRefOf = (repoDir) => {
  const git = gitFor(repoDir, 'HEAD');
  const head = git(['rev-parse', 'HEAD'], {allowFailure: true});
  return head ? head.trim() : null;
};

const repoDirName = (repoUrl) => path.basename(repoUrl).replace(/\.git$/, '');

/**
 * A patch may touch packages from any repository the distribution is built
 * from, not just magento2: the inventory, page builder and security package
 * modules all live in their own repositories. Passing gitRepoDir builds the map
 * across every repository present there, which is the layout the release build
 * already clones into.
 */
const buildPackageMap = ({repoDir, ref, definitionKey = 'magento2', gitRepoDir}) => {
  const toSource = new Map();

  if (gitRepoDir) {
    // Every directory layout any repository uses, applied to every checkout
    // found. Probing rather than matching config keys to directory names keeps
    // this working whichever set of repositories is cloned, and whatever they
    // are named locally.
    const everyLayout = {
      packageDirs: dedupeBy(
        Object.values(packagesConfig).flatMap(d => d.packageDirs || []),
        entry => entry.dir
      ),
      packageIndividual: dedupeBy(
        Object.values(packagesConfig).flatMap(d => d.packageIndividual || []),
        // dir alone is not unique here: dozens of base-package entries share
        // dir '' and differ only in which composer template names them.
        entry => typeof entry.dir === 'string'
          ? `${entry.dir} ${entry.composerJsonPath || ''}`
          : undefined
      ),
    };

    for (const entry of fs.readdirSync(gitRepoDir, {withFileTypes: true})) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(gitRepoDir, entry.name);
      if (!fs.existsSync(path.join(dir, '.git'))) continue;
      const head = ref || defaultRefOf(dir);
      if (!head) continue;
      addRepoPackages(toSource, {repoDir: dir, ref: head, definition: everyLayout});
    }
    return toSource;
  }

  const definition = packagesConfig[definitionKey];
  if (!definition) {
    throw new Error(`No package definition "${definitionKey}" in packages-config`);
  }
  // Every read below tolerates failure, so a ref that does not exist would
  // otherwise surface as an empty map and a patch that translates nothing.
  if (!gitFor(repoDir, ref)(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {allowFailure: true})) {
    throw new Error(`ref "${ref}" not found in ${repoDir}`);
  }
  return addRepoPackages(toSource, {repoDir, ref, definition});
};

/**
 * Longest-first so that lib/internal/Magento/Framework/Amqp is matched before
 * the lib/internal/Magento/Framework that contains it.
 */
const sortedByDepth = (map) => [...map.entries()].sort((a, b) => b[1].length - a[1].length);

const makeTranslators = (packageMap, sourceRoots) => {
  const byDepth = sortedByDepth(packageMap);

  const sourceToVendor = (path) => {
    for (const [name, dir] of byDepth) {
      // Sorted longest first, so the base package's empty dir is reached last
      // and acts as the fallback for the unpackaged paths it owns (lib/web,
      // app/etc) rather than never matching at all.
      if (dir === '') return `vendor/${name}/${path}`;
      if (path === dir) return `vendor/${name}`;
      if (path.startsWith(`${dir}/`)) return `vendor/${name}${path.slice(dir.length)}`;
    }
    return null;
  };

  const vendorToSource = (path) => {
    const match = path.match(/^vendor\/([^/]+\/[^/]+)(\/.*)?$/);
    // Some upstream patches address root relative paths directly, e.g.
    // lib/web/mage/menu.js, app/etc/di.xml or nginx.conf.sample. Those are
    // already source tree paths, so they pass through rather than counting as a
    // failed lookup - but only when the repository really has that root, or a
    // patch written relative to a module directory would pass through too and
    // be reported as translated.
    if (!match) {
      if (path.startsWith('vendor/')) return null;
      if (!sourceRoots) return path;
      return sourceRoots.has(path.split('/')[0]) ? path : null;
    }
    const [, name, rest] = match;
    // Adobe patches reference magento/*, the published packages are renamed to
    // mage-os/*, and a checkout may hold either depending on whether a release
    // build has rewritten its composer.json files. Try both directions.
    const candidates = [
      name,
      name.replace(/^mage-os\//, 'magento/'),
      name.replace(/^magento\//, 'mage-os/'),
    ];
    for (const candidate of candidates) {
      if (!packageMap.has(candidate)) continue;
      const dir = packageMap.get(candidate);
      return dir ? `${dir}${rest || ''}` : (rest || '').replace(/^\//, '');
    }
    return null;
  };

  return {sourceToVendor, vendorToSource};
};

/**
 * Paths that exist only in an installed tree and have no source tree
 * counterpart. Composer generates vendor/bin from package definitions, and
 * Adobe ships a patch-status marker there to track which isolated patches an
 * installation has applied. Hunks touching these are dropped rather than
 * failing the translation, because a source tree port must not contain them.
 */
const INSTALL_ONLY = [/^vendor\/bin\//];

const bare = (path) => path.replace(/^[ab]\//, '');

const isInstallOnly = (path) => path !== '/dev/null'
  && INSTALL_ONLY.some(pattern => pattern.test(bare(path)));

// Matches the path-bearing lines of a unified diff. Trailing text after the
// path (timestamps, tabs) is preserved verbatim.
//
// These shapes are only meaningful in a header position. A removed line whose
// own content begins "-- " arrives as "--- ...", which no regex can tell from a
// file marker; only position separates them, so the walk below tracks it.
const DIFF_GIT = /^(diff --git )(\S+)( )(\S+)(.*)$/;
const FILE_MARKER = /^(---|\+\+\+)(\s+)(\S+)(.*)$/;
const RENAME_OR_COPY = /^((?:rename|copy) (?:from|to) )(.+)$/;
const BINARY = /^(Binary files )(\S+)( and )(\S+)( differ)$/;

/**
 * Strips a leading a/ or b/ so the path can be looked up, and restores it after.
 * Real-world patches appear both with and without the prefix.
 */
const withPrefix = (path, translate) => {
  const match = path.match(/^([ab]\/)(.*)$/);
  const prefix = match ? match[1] : '';
  const bare = match ? match[2] : path;
  if (bare === '/dev/null' || path === '/dev/null') return null;
  const translated = translate(bare);
  return translated === null ? null : prefix + translated;
};

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

/**
 * Applies rewrite to the path-bearing header lines only, skipping hunk bodies.
 *
 * Hunk extent comes from the @@ line counts rather than from the next header:
 * a plain diff -u has no per-file header to stop at, and the corpus contains
 * both framings.
 */
const rewriteHeaderPaths = (lines, rewrite) => {
  let oldRemaining = 0;
  let newRemaining = 0;

  return lines.map(line => {
    if (oldRemaining > 0 || newRemaining > 0) {
      if (line.startsWith('\\')) return line; // "\ No newline at end of file"
      if (line.startsWith('-')) oldRemaining = Math.max(0, oldRemaining - 1);
      else if (line.startsWith('+')) newRemaining = Math.max(0, newRemaining - 1);
      else {
        oldRemaining = Math.max(0, oldRemaining - 1);
        newRemaining = Math.max(0, newRemaining - 1);
      }
      return line;
    }

    const hunk = line.match(HUNK_HEADER);
    if (hunk) {
      // An omitted count means one line, per the unified diff format.
      oldRemaining = hunk[1] === undefined ? 1 : parseInt(hunk[1], 10);
      newRemaining = hunk[2] === undefined ? 1 : parseInt(hunk[2], 10);
      return line;
    }

    let match = line.match(DIFF_GIT);
    if (match) {
      return match[1] + rewrite(match[2]) + match[3] + rewrite(match[4]) + match[5];
    }
    match = line.match(BINARY);
    if (match) {
      return match[1] + rewrite(match[2]) + match[3] + rewrite(match[4]) + match[5];
    }
    match = line.match(FILE_MARKER);
    if (match) {
      return match[1] + match[2] + rewrite(match[3]) + match[4];
    }
    match = line.match(RENAME_OR_COPY);
    if (match) {
      return match[1] + rewrite(match[2]);
    }
    return line;
  });
};

const translatePatch = (patchText, packageMap, direction, sourceRoots) => {
  if (direction !== 'to-vendor' && direction !== 'to-source') {
    throw new Error(`Unknown direction "${direction}", expected to-vendor or to-source`);
  }
  const {sourceToVendor, vendorToSource} = makeTranslators(packageMap, sourceRoots);
  const translate = direction === 'to-vendor' ? sourceToVendor : vendorToSource;

  const stats = {translated: 0, untranslated: [], dropped: []};

  // git apply rejects a patch that does not end in a newline. Dropping the last
  // section would otherwise take the trailing newline with it, and the isolated
  // patches put their install-only marker last.
  const endsWithNewline = patchText.endsWith('\n');

  // Sections are split on diff --git so a dropped file takes its hunks with it.
  const sections = [];
  for (const line of patchText.split('\n')) {
    if (line.startsWith('diff --git ') || sections.length === 0) sections.push([]);
    sections[sections.length - 1].push(line);
  }

  const kept = sections.filter(section => {
    const header = section[0].match(DIFF_GIT);
    if (!header) return true;
    // Either side, because a deletion can carry the real path on only one of
    // them depending on which tool wrote the diff.
    const target = [header[4], header[2]].find(isInstallOnly);
    if (direction === 'to-source' && target) {
      stats.dropped.push(bare(target));
      return false;
    }
    return true;
  });

  patchText = kept.map(section => section.join('\n')).join('\n');

  const rewrite = (path) => {
    if (path === '/dev/null') return path;
    // Git C-quotes a path containing spaces or specials, and the header
    // regexes split on whitespace, so what arrives here is a mangled fragment.
    // Refusing to translate keeps the line byte-identical and reports the
    // fragment as untranslated, instead of silently emitting a corrupt path.
    if (path.includes('"')) {
      stats.untranslated.push(bare(path));
      return path;
    }
    const out = withPrefix(path, translate);
    if (out === null) {
      // A section whose header named an install-only path is already gone. This
      // catches the same path in a diff -u run that has no header to drop.
      if (!(direction === 'to-source' && isInstallOnly(path))) {
        stats.untranslated.push(bare(path));
      }
      return path;
    }
    stats.translated++;
    return out;
  };

  const text = rewriteHeaderPaths(patchText.split('\n'), rewrite).join('\n');

  stats.untranslated = [...new Set(stats.untranslated)];
  stats.dropped = [...new Set(stats.dropped)];
  const output = endsWithNewline && !text.endsWith('\n') ? `${text}\n` : text;
  return {text: output, stats};
};

module.exports = {buildPackageMap, buildSourceRoots, translatePatch};
