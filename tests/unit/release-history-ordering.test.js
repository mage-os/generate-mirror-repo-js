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

function latestVersionFile(dir) {
  const files = versionFiles(dir);
  const versions = files.map(f => f.replace(/\.json$/, ''));
  versions.sort(compareVersions);
  return path.join(dir, `${versions[versions.length - 1]}.json`);
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
  // started sorting them, so we guard the latest release of each (the one a new release
  // is compared against) rather than the legacy unsorted files.
  for (const pkg of ['product-community-edition', 'project-community-edition']) {
    describe(`mage-os/${pkg}`, () => {
      const dir = path.join(historyRoot, pkg);

      test('latest release has require sorted by package name', () => {
        const file = latestVersionFile(dir);
        const keys = requireKeys(file);
        expect(keys).toEqual([...keys].sort());
      });
    });
  }
});
