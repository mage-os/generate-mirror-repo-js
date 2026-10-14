/**
 * Run with
 *
 * node bin/translate-patch.js --repoDir=/path/to/mageos-magento2 --ref=main --direction=to-source --patch=adobe.patch
 */

const fs = require('fs');
const parseOptions = require('parse-options');
const {buildPackageMap, buildSourceRoots, translatePatch} = require('../src/patch-translate');

const options = parseOptions(
  `$repoDir $ref $direction $patch $out $gitRepoDir @help|h`,
  process.argv
);

if (options.help || !options.repoDir || !options.patch) {
  console.log(`Rewrite patch file paths between the Magento source tree layout and the
installed Composer vendor layout.

Adobe ships isolated security patches against an installed tree
(vendor/magento/module-cms/...). This rewrites them to source tree paths
(app/code/Magento/Cms/...) so they can be applied to this repository.

The package mapping is read from each package's own composer.json at the given
ref, so it cannot drift from what the build produces.

Usage:
  node bin/translate-patch.js [OPTIONS]

Options:
  --repoDir=   Path to a mageos-magento2 checkout (required)
  --gitRepoDir= Dir holding several checkouts, to map packages that live in
               their own repositories (inventory, page builder, security)
  --ref=       Git ref to read the package mapping from (default: main)
  --direction= to-source (vendor -> app/code) or to-vendor (default: to-source)
  --patch=     Patch file to translate, or - for STDIN (required)
  --out=       Write to this file instead of STDOUT
`);
  process.exit(1);
}

const ref = options.ref || 'main';
const direction = options.direction || 'to-source';

const patchText = options.patch === '-'
  ? fs.readFileSync(0, 'utf8')
  : fs.readFileSync(options.patch, 'utf8');

const packageMap = buildPackageMap({repoDir: options.repoDir, ref, gitRepoDir: options.gitRepoDir});
const sourceRoots = buildSourceRoots({repoDir: options.repoDir, ref, gitRepoDir: options.gitRepoDir});
if (packageMap.size === 0) {
  console.error(`No packages found at ref "${ref}" in ${options.repoDir}`);
  process.exit(1);
}

const {text, stats} = translatePatch(patchText, packageMap, direction, sourceRoots);

if (options.out) {
  fs.writeFileSync(options.out, text);
} else {
  process.stdout.write(text);
}

console.error(`${packageMap.size} packages mapped from ${ref}`);
console.error(`${stats.translated} path references translated`);

// Dropped hunks change what the patch does, so they are always reported even
// though they are not an error.
if (stats.dropped && stats.dropped.length) {
  console.error(`${stats.dropped.length} install-only path(s) dropped:`);
  stats.dropped.forEach(path => console.error(`  ${path}`));
}

// Anything left untranslated is a path the build does not own: a third party
// package, or a file outside the packaged tree. Applying such a patch would
// silently drop those hunks, so fail rather than emit a partial result.
if (stats.untranslated.length) {
  console.error(`${stats.untranslated.length} could not be translated:`);
  stats.untranslated.forEach(path => console.error(`  ${path}`));
  process.exit(2);
}
