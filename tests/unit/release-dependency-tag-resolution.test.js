/**
 * A dependency the metapackage does not build is required at its repository's
 * newest tag. Repositories that tag with a v prefix used to resolve to nothing
 * at all, and a dependency without a version is dropped from the generated
 * composer.json silently, because JSON.stringify omits an undefined value.
 */

jest.mock('../../src/repository', () => ({
  listTags: jest.fn()
}));

const repo = require('../../src/repository');
const {getAdditionalConfiguration} = require('../../src/package-modules');

const PACKAGE = 'mage-os/product-community-edition';
// A dependency the template resolves from a repository, so the mocked tags
// decide its version.
const FROM_REPOSITORY = 'mage-os/module-shopping-feed';
// A dependency the template names a version for, which is used as it stands.
const FROM_TEMPLATE = 'elgentos/magento2-varnish-extended';

// A ref with no history file, as a new release always has.
const NEW_RELEASE_REF = 'prep-release/mage-os-4.0.0';

describe('resolving a dependency to its newest tag', () => {
  test('ignores a v prefixed tag when the repository also tags without one', async () => {
    repo.listTags.mockResolvedValue(['1.0.0', 'v3.0.0']);

    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF);

    expect(deps[FROM_REPOSITORY]).toBe('1.0.0');
  });

  test('uses the v prefixed tag, without the prefix, when that is all there is', async () => {
    repo.listTags.mockResolvedValue(['v1.2.3', 'v1.2.5']);

    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF);

    expect(deps[FROM_REPOSITORY]).toBe('1.2.5');
  });

  test('leaves a version named by the template alone', async () => {
    repo.listTags.mockResolvedValue(['v1.2.5']);

    const {require: deps} = await getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF);

    expect(deps[FROM_TEMPLATE]).toBe('2.0.7');
  });

  test('fails the build when a dependency has no tag to resolve to', async () => {
    repo.listTags.mockResolvedValue([]);

    await expect(getAdditionalConfiguration(PACKAGE, NEW_RELEASE_REF))
      .rejects.toThrow(/No tag found to require these dependencies at: /);
  });
});
