/**
 * Issue #325 guard: pinned history files must stay byte-compatible with the sorted
 * order the generator emits, so a checksum doesn't change at the latest->historic
 * transition. Catches a future unsorted snapshot or a generator regression.
 */

const fs = require('fs');
const path = require('path');
const {compareVersions} = require('../../src/utils');
const {BASE_LINKS_SORTED_SINCE} = require('../../src/build-package/mage-os-base');

const historyRoot = path.join(__dirname, '../../resource/history/mage-os');

function versionFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
}

function requireKeys(file) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.keys(config.require || {});
}

function replaceKeys(file) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.keys(config.replace || {});
}

describe('release history require ordering (issue #325)', () => {
  describe('mage-os/magento2-base', () => {
    const dir = path.join(historyRoot, 'magento2-base');

    // The base build always sorts, so every file must be sorted.
    for (const file of versionFiles(dir)) {
      test(`${file} has require sorted by package name`, () => {
        const keys = requireKeys(path.join(dir, file));
        expect(keys).toEqual([...keys].sort());
      });
    }
  });

  // Keep in sync with PRODUCT/PROJECT_REQUIRE_SORTED_SINCE in the generator.
  // The minimal editions are stored as full composer.json snapshots (used verbatim
  // for historic rebuilds), but their require is still emitted sorted, so the same
  // byte-compatibility guard applies from their first release (3.0.0).
  const sortedSince = {
    'product-community-edition': '2.0.0',
    'project-community-edition': '2.2.1',
    'product-minimal-edition': '3.0.0',
    'project-minimal-edition': '3.0.0',
  };

  for (const [pkg, threshold] of Object.entries(sortedSince)) {
    describe(`mage-os/${pkg}`, () => {
      const dir = path.join(historyRoot, pkg);

      // Releases at/above the boundary must be sorted, matching the gated generator.
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

  describe('mage-os/magento2-base replace ordering', () => {
    const dir = path.join(historyRoot, 'magento2-base');

    const TEMPLATE_ORDER = [
      'trentrichardson/jquery-timepicker-addon',
      'components/jquery',
      'components/jqueryui',
      'twbs/bootstrap',
    ];
    const SORTED_ORDER = [
      'components/jquery',
      'components/jqueryui',
      'trentrichardson/jquery-timepicker-addon',
      'twbs/bootstrap',
    ];

    const frozen = {
      '3.0.0': SORTED_ORDER,
      '3.1.0': TEMPLATE_ORDER,
      '3.2.0': TEMPLATE_ORDER,
    };

    for (const [version, expected] of Object.entries(frozen)) {
      const file = path.join(dir, `${version}.json`);
      if (!fs.existsSync(file)) continue;
      test(`${version} keeps its published replace order`, () => {
        expect(replaceKeys(file)).toEqual(expected);
      });
    }

    for (const file of versionFiles(dir)) {
      const version = file.replace(/\.json$/, '');
      if (compareVersions(version, BASE_LINKS_SORTED_SINCE) < 0) continue;
      test(`${file} (>= ${BASE_LINKS_SORTED_SINCE}) has replace sorted by package name`, () => {
        const keys = replaceKeys(path.join(dir, file));
        expect(keys).toEqual([...keys].sort());
      });
    }
  });
});
