/**
 * Guard tests for issue #325: a release package's checksum must not change when it
 * transitions from a freshly-built "latest" release to a pinned historic one.
 *
 * The generator emits the composer "require" section with keys sorted alphabetically
 * (mage-os/magento2-base via determineSourceDependencies + sort, and the
 * community-edition metapackages via sortObjectKeys in their transforms). The pinned
 * history files in resource/history are produced by snapshotting the published
 * package and sorting (PHP ksort). These tests assert that the committed history files
 * for the latest mage-os release stay byte-compatible with that sorted ordering, so a
 * future unsorted snapshot (or a regression in the generator) is caught here rather
 * than as a checksum failure in the field.
 */

const fs = require('fs');
const path = require('path');
const {compareVersions} = require('../../src/utils');

const historyRoot = path.join(__dirname, '../../resource/history/mage-os');

function versionFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
}

function requireKeys(file) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.keys(config.require || {});
}

describe('release history require ordering (issue #325)', () => {
  describe('mage-os/magento2-base', () => {
    const dir = path.join(historyRoot, 'magento2-base');

    // Every mage-os base history file is produced by the sorted generator, so all of
    // them must be sorted by final (mage-os/) package name.
    for (const file of versionFiles(dir)) {
      test(`${file} has require sorted by package name`, () => {
        const keys = requireKeys(path.join(dir, file));
        expect(keys).toEqual([...keys].sort());
      });
    }
  });

  // The community-edition metapackages only adopted sorted ordering once the generator
  // started sorting them. The generator gates its sort on these same boundaries (see
  // PRODUCT_REQUIRE_SORTED_SINCE / PROJECT_REQUIRE_SORTED_SINCE in
  // src/build-metapackage/mage-os-community-edition.js); keep these values in sync.
  const sortedSince = {
    'product-community-edition': '2.0.0',
    'project-community-edition': '2.2.1',
  };

  for (const [pkg, threshold] of Object.entries(sortedSince)) {
    describe(`mage-os/${pkg}`, () => {
      const dir = path.join(historyRoot, pkg);

      // Every release at or above the boundary must be sorted, matching what the
      // (gated) generator now emits, so a freshly built release stays byte-identical
      // to its pinned historic counterpart.
      for (const file of versionFiles(dir)) {
        const version = file.replace(/\.json$/, '');
        if (compareVersions(version, threshold) < 0) continue;
        test(`${file} (>= ${threshold}) has require sorted by package name`, () => {
          const keys = requireKeys(path.join(dir, file));
          expect(keys).toEqual([...keys].sort());
        });
      }
    });
  }
});
