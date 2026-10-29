/**
 * Dependencies that are not built here resolve to their latest tag, which is
 * wrong for a release on an older line: the newest add-on may require the
 * current major. A release refs file can pin them instead.
 */

// A pin is checked against the dependency's tags, so the versions the tests
// pin have to be among them.
jest.mock('../../src/repository', () => ({
  listTags: jest.fn().mockResolvedValue(['1.0.0', '1.4.1', '1.4.2', '2.0.0', '2.0.6', '3.0.0'])
}));

const {getAdditionalConfiguration} = require('../../src/package-modules');

const PACKAGE = 'mage-os/product-community-edition';
// A dependency the template resolves from a repository, so the mocked tags
// decide its version. A template entry that names a version instead, as
// elgentos/magento2-varnish-extended now does, is used as it stands.
const PINNED = 'element119/module-custom-admin-logo';

// A ref with no history file, as a new release always has: the generator is on
// its temporary work branch at this point.
const NEW_RELEASE_REF = 'prep-release/mage-os-3.4.1';

describe('getAdditionalConfiguration', () => {
  test('resolves to the latest tag when nothing is pinned', async () => {
    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF);

    expect(deps[PINNED]).toBe('3.0.0');
  });

  test('uses the pinned version instead', async () => {
    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {
      [PINNED]: '2.0.6'
    });

    expect(deps[PINNED]).toBe('2.0.6');
  });

  test('leaves unpinned dependencies on their latest tag', async () => {
    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {
      [PINNED]: '2.0.6'
    });

    expect(deps['mage-os/module-rma']).toBe('3.0.0');
  });
});

describe('getAdditionalConfiguration on an older line', () => {
  // 2.3.0 shipped aligent/magento2-pci-4-compatibility 1.4.1 and did not ship
  // element119/module-custom-admin-logo, which the current template lists.
  const BASELINE = '2.3.0';
  const SHIPPED = 'aligent/magento2-pci-4-compatibility';

  test('keeps the version the line last shipped', async () => {
    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {}, BASELINE);

    expect(deps[SHIPPED]).toBe('1.4.1');
  });

  test('leaves out dependencies the line never shipped', async () => {
    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {}, BASELINE);

    expect(deps).not.toHaveProperty(PINNED);
  });

  test('a pin overrides the shipped version', async () => {
    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {[SHIPPED]: '1.4.2'}, BASELINE);

    expect(deps[SHIPPED]).toBe('1.4.2');
  });

  test('a pin adds a dependency the line never shipped', async () => {
    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {[PINNED]: '2.0.6'}, BASELINE);

    expect(deps[PINNED]).toBe('2.0.6');
  });

  test('keeps what the line shipped even when the template no longer lists it', async () => {
    // laminas/laminas-mvc shipped in 2.3.0 and is not in the template
    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {}, BASELINE);

    expect(deps['laminas/laminas-mvc']).toBe('^3.6');
  });

  test('a pin of false removes a dependency the line shipped', async () => {
    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {[SHIPPED]: false}, BASELINE);

    expect(deps).not.toHaveProperty(SHIPPED);
  });

  test('refuses a baseline with no release history', async () => {
    await expect(getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {}, 'release/2.x'))
      .rejects.toThrow(/No mage-os\/product-community-edition history for release\/2.x/);
  });
});

describe('pin validation', () => {
  test('rejects a pinned version that is not a tag of the dependency', async () => {
    await expect(
      getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {[PINNED]: '9.9.9'})
    ).rejects.toThrow(/Pinned element119\/module-custom-admin-logo 9\.9\.9 is not a tag/);
  });

  test('accepts a pin that names a real tag', async () => {
    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {[PINNED]: '2.0.0'});

    expect(deps[PINNED]).toBe('2.0.0');
  });
});

/**
 * The product and the project metapackage are built from the same pins, so a
 * pin has to stay with the metapackage it was meant for. The project
 * metapackage becomes the store's root composer.json.
 */
describe('pin scoping', () => {
  const PROJECT = 'mage-os/project-community-edition';
  const BASELINE = '3.4.0';
  // In the project template, and shipped by every project release.
  const PROJECT_DEPENDENCY = 'mage-os/composer-root-update-plugin';

  test('leaves a product pin out of the project metapackage', async () => {
    const {require: deps} = await getAdditionalConfiguration(PROJECT, NEW_RELEASE_REF, {[PINNED]: '2.0.6'}, BASELINE);

    expect(deps).not.toHaveProperty(PINNED);
    expect(deps[PROJECT_DEPENDENCY]).toBe('3.4.0');
  });

  test('applies a pin the metapackage template lists', async () => {
    const {require: deps} = await getAdditionalConfiguration(PROJECT, NEW_RELEASE_REF, {
      [PROJECT_DEPENDENCY]: '2.0.0',
      [PINNED]: '2.0.6'
    }, BASELINE);

    expect(deps[PROJECT_DEPENDENCY]).toBe('2.0.0');
    expect(deps).not.toHaveProperty(PINNED);
  });

  test('applies a pin to a dependency the baseline shipped but the template no longer lists', async () => {
    // laminas/laminas-mvc shipped in product 2.3.0 and is not in the template
    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {
      'laminas/laminas-mvc': '^3.7'
    }, '2.3.0');

    expect(deps['laminas/laminas-mvc']).toBe('^3.7');
  });

  test('reports a pin it does not apply', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    await getAdditionalConfiguration(PROJECT, NEW_RELEASE_REF, {[PINNED]: '2.0.6'}, BASELINE);

    expect(log.mock.calls.flat().join('\n'))
      .toMatch(/Pins not applied to mage-os\/project-community-edition .*element119\/module-custom-admin-logo/);
    log.mockRestore();
  });

  test('keeps a pin out of a metapackage with no template of its own', async () => {
    const {require: deps} = await getAdditionalConfiguration('mage-os/product-minimal-edition', NEW_RELEASE_REF, {
      [PINNED]: '2.0.6'
    }, BASELINE);

    expect(deps).toEqual({});
  });
});
