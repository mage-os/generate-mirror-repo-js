/**
 * Tests for mage-os-community-edition.js
 *
 * This file tests the two transform functions used during the build process
 * to modify composer.json configurations for Mage-OS Community Edition packages.
 */

const {
  transformMageOSCommunityEditionProject,
  transformMageOSCommunityEditionProduct,
} = require('../../../src/build-metapackage/mage-os-community-edition');

// Mock the release-build-tools module
jest.mock('../../../src/release-build-tools', () => ({
  updateComposerConfigFromMagentoToMageOs: jest.fn(),
}));

const { updateComposerConfigFromMagentoToMageOs } = require('../../../src/release-build-tools');

// Test fixtures
const createSampleComposerConfig = (overrides = {}) => ({
  name: 'magento/project-community-edition',
  version: '2.4.6',
  description: 'Magento Community Edition Project',
  type: 'project',
  require: {
    'magento/product-community-edition': '2.4.6',
  },
  ...overrides,
});

const createLegacyComposerConfig = (version = '2.0.0', overrides = {}) => ({
  name: 'magento/project-community-edition',
  version,
  description: 'Original Description',
  type: 'project',
  ...overrides,
});

const createSampleInstruction = (overrides = {}) => ({
  vendor: 'mage-os',
  repoUrl: 'https://github.com/mage-os/mirror-magento2.git',
  ...overrides,
});

const createSampleMetapackage = (overrides = {}) => ({
  name: 'project-community-edition',
  description: 'Mage-OS Community Edition Project',
  ...overrides,
});

const createSampleRelease = (overrides = {}) => ({
  version: '2.4.6',
  replaceVersions: {
    'magento/product-community-edition': '2.4.6',
  },
  ...overrides,
});

const createReleaseWithoutReplace = (overrides = {}) => ({
  version: '2.4.6',
  replaceVersions: {},
  ...overrides,
});

describe('mage-os-community-edition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('transformMageOSCommunityEditionProject', () => {
    describe('vendor transformation', () => {
      it('calls updateComposerConfigFromMagentoToMageOs with correct parameters', async () => {
        const composerConfig = createSampleComposerConfig();
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease();

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(updateComposerConfigFromMagentoToMageOs).toHaveBeenCalledTimes(1);
        expect(updateComposerConfigFromMagentoToMageOs).toHaveBeenCalledWith(
          instruction,
          release,
          composerConfig
        );
      });

      it('returns the transformed composerConfig', async () => {
        const composerConfig = createSampleComposerConfig();
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease();

        const result = await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(result).toBe(composerConfig);
      });
    });

    describe('description handling for legacy versions', () => {
      const expectedDescription = 'eCommerce Platform for Growth (Community Edition)';

      it('sets description for version 2.0.0', async () => {
        const composerConfig = createLegacyComposerConfig('2.0.0');
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({ version: '2.0.0' });

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.description).toBe(expectedDescription);
      });

      it('sets description for version 1.0.0', async () => {
        const composerConfig = createLegacyComposerConfig('1.0.0');
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({ version: '1.0.0' });

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.description).toBe(expectedDescription);
      });

      it('sets description for version 0.5.0', async () => {
        const composerConfig = createLegacyComposerConfig('0.5.0');
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({ version: '0.5.0' });

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.description).toBe(expectedDescription);
      });

      it('sets description for version 1.9.0', async () => {
        const composerConfig = createLegacyComposerConfig('1.9.0');
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({ version: '1.9.0' });

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.description).toBe(expectedDescription);
      });

      it('does not modify description for version 2.0.1', async () => {
        const originalDescription = 'Original Description';
        const composerConfig = createLegacyComposerConfig('2.0.1', {
          description: originalDescription,
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({ version: '2.0.1' });

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.description).toBe(originalDescription);
      });

      it('does not modify description for version 2.1.0', async () => {
        const originalDescription = 'Original Description';
        const composerConfig = createLegacyComposerConfig('2.1.0', {
          description: originalDescription,
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({ version: '2.1.0' });

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.description).toBe(originalDescription);
      });

      it('does not modify description for version 3.0.0', async () => {
        const originalDescription = 'Original Description';
        const composerConfig = createLegacyComposerConfig('3.0.0', {
          description: originalDescription,
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({ version: '3.0.0' });

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.description).toBe(originalDescription);
      });

      it('does not modify description for version 2.4.6', async () => {
        const originalDescription = 'Magento Community Edition Project';
        const composerConfig = createSampleComposerConfig({
          description: originalDescription,
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease();

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.description).toBe(originalDescription);
      });

      it('handles patch versions correctly - 2.0.0-p1 should NOT update description', async () => {
        const originalDescription = 'Original Description';
        const composerConfig = createLegacyComposerConfig('2.0.0-p1', {
          description: originalDescription,
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({ version: '2.0.0-p1' });

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        // According to Adobe's versioning, 2.0.0-p1 > 2.0.0, so description should NOT be modified
        expect(composerConfig.description).toBe(originalDescription);
      });
    });

    describe('async behavior', () => {
      it('returns a promise', () => {
        const composerConfig = createSampleComposerConfig();
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease();

        const result = transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(result).toBeInstanceOf(Promise);
      });

      it('resolves with composerConfig', async () => {
        const composerConfig = createSampleComposerConfig();
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease();

        const result = await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(result).toBe(composerConfig);
      });
    });
  });

  describe('transformMageOSCommunityEditionProduct', () => {
    describe('vendor transformation', () => {
      it('calls updateComposerConfigFromMagentoToMageOs with correct parameters', async () => {
        const composerConfig = createSampleComposerConfig({
          name: 'magento/product-community-edition',
          type: 'metapackage',
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease();

        await transformMageOSCommunityEditionProduct(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(updateComposerConfigFromMagentoToMageOs).toHaveBeenCalledTimes(1);
        expect(updateComposerConfigFromMagentoToMageOs).toHaveBeenCalledWith(
          instruction,
          release,
          composerConfig
        );
      });

      it('returns the transformed composerConfig', async () => {
        const composerConfig = createSampleComposerConfig({
          name: 'magento/product-community-edition',
          type: 'metapackage',
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease();

        const result = await transformMageOSCommunityEditionProduct(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(result).toBe(composerConfig);
      });
    });

    describe('extra.magento_version handling', () => {
      it('adds magento_version when replaceVersions contains product-community-edition', async () => {
        const composerConfig = createSampleComposerConfig({
          name: 'magento/product-community-edition',
          type: 'metapackage',
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({
          replaceVersions: {
            'magento/product-community-edition': '2.4.6',
          },
        });

        await transformMageOSCommunityEditionProduct(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.extra).toBeDefined();
        expect(composerConfig.extra.magento_version).toBe('2.4.6');
      });

      it('creates extra object when it does not exist', async () => {
        const composerConfig = createSampleComposerConfig({
          name: 'magento/product-community-edition',
          type: 'metapackage',
        });
        // Ensure extra is not present
        delete composerConfig.extra;

        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({
          replaceVersions: {
            'magento/product-community-edition': '2.4.6',
          },
        });

        expect(composerConfig.extra).toBeUndefined();

        await transformMageOSCommunityEditionProduct(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.extra).toBeDefined();
        expect(composerConfig.extra).toEqual({ magento_version: '2.4.6' });
      });

      it('preserves existing extra properties', async () => {
        const composerConfig = createSampleComposerConfig({
          name: 'magento/product-community-edition',
          type: 'metapackage',
          extra: {
            'existing-property': 'existing-value',
            'another-property': { nested: true },
          },
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({
          replaceVersions: {
            'magento/product-community-edition': '2.4.6',
          },
        });

        await transformMageOSCommunityEditionProduct(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.extra['existing-property']).toBe('existing-value');
        expect(composerConfig.extra['another-property']).toEqual({ nested: true });
        expect(composerConfig.extra.magento_version).toBe('2.4.6');
      });

      it('does not add magento_version when replaceVersions is empty', async () => {
        const composerConfig = createSampleComposerConfig({
          name: 'magento/product-community-edition',
          type: 'metapackage',
        });
        delete composerConfig.extra;

        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createReleaseWithoutReplace();

        await transformMageOSCommunityEditionProduct(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.extra).toBeUndefined();
      });

      it('does not add magento_version when product-community-edition not in replaceVersions', async () => {
        const composerConfig = createSampleComposerConfig({
          name: 'magento/product-community-edition',
          type: 'metapackage',
        });
        delete composerConfig.extra;

        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({
          replaceVersions: {
            'magento/some-other-package': '2.4.6',
          },
        });

        await transformMageOSCommunityEditionProduct(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.extra).toBeUndefined();
      });

      it('handles different version strings in replaceVersions', async () => {
        const composerConfig = createSampleComposerConfig({
          name: 'magento/product-community-edition',
          type: 'metapackage',
        });

        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({
          replaceVersions: {
            'magento/product-community-edition': '2.4.6-p3',
          },
        });

        await transformMageOSCommunityEditionProduct(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.extra.magento_version).toBe('2.4.6-p3');
      });
    });

    describe('async behavior', () => {
      it('returns a promise', () => {
        const composerConfig = createSampleComposerConfig({
          name: 'magento/product-community-edition',
          type: 'metapackage',
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease();

        const result = transformMageOSCommunityEditionProduct(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(result).toBeInstanceOf(Promise);
      });

      it('resolves with composerConfig', async () => {
        const composerConfig = createSampleComposerConfig({
          name: 'magento/product-community-edition',
          type: 'metapackage',
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease();

        const result = await transformMageOSCommunityEditionProduct(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(result).toBe(composerConfig);
      });
    });
  });

  describe('integration with real compareVersions', () => {
    /**
     * These tests use the real compareVersions function (not mocked)
     * to verify version comparison edge cases are handled correctly.
     */

    beforeEach(() => {
      jest.clearAllMocks();
      // Reset mocks to use real implementation for compareVersions
      // Note: compareVersions is used internally, not mocked at module level
    });

    describe('version boundary tests for description update', () => {
      const expectedDescription = 'eCommerce Platform for Growth (Community Edition)';

      it('version 2.0.0 is exactly at the boundary (should update)', async () => {
        const composerConfig = createLegacyComposerConfig('2.0.0');
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({ version: '2.0.0' });

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.description).toBe(expectedDescription);
      });

      it('version 1.9.9 is below boundary (should update)', async () => {
        const composerConfig = createLegacyComposerConfig('1.9.9');
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({ version: '1.9.9' });

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        expect(composerConfig.description).toBe(expectedDescription);
      });

      it('version 2.0.0-p1 is above boundary using Adobe versioning (should NOT update)', async () => {
        const originalDescription = 'Original Description';
        const composerConfig = createLegacyComposerConfig('2.0.0-p1', {
          description: originalDescription,
        });
        const instruction = createSampleInstruction();
        const metapackage = createSampleMetapackage();
        const release = createSampleRelease({ version: '2.0.0-p1' });

        await transformMageOSCommunityEditionProject(
          composerConfig,
          instruction,
          metapackage,
          release
        );

        // According to Adobe's versioning, 2.0.0-p1 > 2.0.0
        expect(composerConfig.description).toBe(originalDescription);
      });
    });
  });
});
