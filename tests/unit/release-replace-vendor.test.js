/**
 * A package replaces the upstream package it was built from, never itself.
 *
 * A release tag carries the composer.json this build already rewrote for that
 * release, so building an older line from its last tag hands the rename a tree
 * that is already renamed. Left alone the replace section ends up naming
 * mage-os/*, no magento/* alias is generated for the package, and the breakage
 * only surfaces when someone installs the release.
 */

jest.mock('../../src/packagist', () => ({
  fetchPackagistList: jest.fn().mockResolvedValue(new Set()),
  isOnPackagist: jest.fn().mockReturnValue(false)
}));

const {updateComposerConfigFromMagentoToMageOs} = require('../../src/release-build-tools');

const instruction = {vendor: 'mage-os', repoUrl: 'https://github.com/mage-os/mageos-inventory.git'};

const release = {
  version: '3.4.1',
  ref: 'prep-release/mage-os-3.4.1',
  dependencyVersions: {'*': '3.4.1'},
  replaceVersions: {'magento/module-inventory': '1.2.7'}
};

describe('replace section', () => {
  test('names the upstream package when building from upstream sources', () => {
    const composerConfig = {
      name: 'magento/module-inventory',
      replace: {'magento/module-inventory': '1.2.7'}
    };

    updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

    expect(composerConfig.name).toBe('mage-os/module-inventory');
    expect(composerConfig.replace).toEqual({'magento/module-inventory': '1.2.7'});
  });

  // The same package as it appears at a release tag: already renamed.
  test('names the upstream package when building from a release tag', () => {
    const composerConfig = {
      name: 'mage-os/module-inventory',
      replace: {'mage-os/module-inventory': '1.2.7'}
    };

    updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

    expect(composerConfig.name).toBe('mage-os/module-inventory');
    expect(composerConfig.replace).toEqual({'magento/module-inventory': '1.2.7'});
  });

  test('restores the vendor even when the upstream version map has no entry', () => {
    const composerConfig = {
      name: 'mage-os/module-unknown',
      replace: {'mage-os/module-unknown': '1.0.0'}
    };

    updateComposerConfigFromMagentoToMageOs(instruction, {...release, replaceVersions: {}}, composerConfig);

    expect(composerConfig.replace).toEqual({'magento/module-unknown': '1.0.0'});
  });

  test('leaves entries for other packages alone', () => {
    const composerConfig = {
      name: 'magento/magento2-base',
      replace: {'magento/module-cms': '104.0.9', 'magento/module-catalog': '104.0.9'}
    };

    updateComposerConfigFromMagentoToMageOs(instruction, {...release, replaceVersions: {}}, composerConfig);

    expect(composerConfig.replace).toEqual({
      'mage-os/module-cms': '104.0.9',
      'mage-os/module-catalog': '104.0.9'
    });
  });
});
