/**
 * Dependencies that are not built here resolve to their latest tag, which is
 * wrong for a release on an older line: the newest add-on may require the
 * current major. A release refs file can pin them instead.
 */

jest.mock('../../src/repository', () => ({
  listTags: jest.fn().mockResolvedValue(['1.0.0', '2.0.0', '3.0.0'])
}));

const {getAdditionalConfiguration} = require('../../src/package-modules');

const PACKAGE = 'mage-os/product-community-edition';
const PINNED = 'elgentos/magento2-varnish-extended';

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
  // the varnish module, which the current template lists.
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

  test('refuses a baseline with no release history', async () => {
    await expect(getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF, {}, 'release/2.x'))
      .rejects.toThrow(/No mage-os\/product-community-edition history for release\/2.x/);
  });
});
