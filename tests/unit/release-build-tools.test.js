/**
 * Unit tests for release-build-tools.js
 *
 * Tests the version validation and composer.json transformation utilities
 * used in building Mage-OS release packages from Magento source.
 */

// Mock the packagist module before requiring the SUT
jest.mock('../../src/packagist', () => ({
  fetchPackagistList: jest.fn().mockResolvedValue(new Set()),
  isOnPackagist: jest.fn().mockReturnValue(false)
}));

const sut = require('../../src/release-build-tools');
const { isOnPackagist } = require('../../src/packagist');

// ============================================================================
// Test Factories
// ============================================================================

/**
 * Create a mock instruction object for testing
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock instruction
 */
const createInstruction = (overrides = {}) => ({
  vendor: 'mage-os',
  repoUrl: 'https://github.com/mage-os/mageos-magento2',
  ref: 'main',
  ...overrides
});

/**
 * Create a mock release object for testing
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock release
 */
const createRelease = (overrides = {}) => ({
  version: '1.0.0',
  ref: 'v1.0.0',
  fallbackVersion: '1.0.0',
  dependencyVersions: { '*': '1.0.0' },
  replaceVersions: {},
  composerRepoUrl: 'https://repo.mage-os.org/',
  ...overrides
});

/**
 * Create a mock composer.json config for testing
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock composer config
 */
const createComposerConfig = (overrides = {}) => ({
  name: 'magento/module-catalog',
  version: '103.0.0',
  require: {
    'magento/framework': '*',
    'magento/module-store': '*'
  },
  ...overrides
});

// ============================================================================
// Tests for validateVersionString
// ============================================================================

describe('validateVersionString', () => {
  describe('valid versions - two part', () => {
    it.each([
      ['1.0', 'basic two-part'],
      ['2.4', 'two-part with higher numbers'],
      ['10.20', 'two-part with double digits'],
      ['0.1', 'two-part starting with zero'],
      ['999.999', 'two-part with large numbers']
    ])('should accept %s (%s)', (version) => {
      expect(() => sut.validateVersionString(version)).not.toThrow();
    });
  });

  describe('valid versions - three part', () => {
    it.each([
      ['1.0.0', 'basic three-part'],
      ['2.4.6', 'three-part with higher numbers'],
      ['10.20.30', 'three-part with double digits'],
      ['0.0.1', 'three-part starting with zeros'],
      ['999.999.999', 'three-part with large numbers']
    ])('should accept %s (%s)', (version) => {
      expect(() => sut.validateVersionString(version)).not.toThrow();
    });
  });

  describe('valid versions - with suffix', () => {
    it.each([
      ['1.0-beta', 'two-part with beta suffix'],
      ['2.4-p2', 'two-part with patch suffix'],
      ['1.0-alpha', 'two-part with alpha suffix'],
      ['1.0.0-alpha', 'three-part with alpha suffix'],
      ['2.4.6-patch2', 'three-part with patch suffix'],
      ['1.0.0-beta', 'three-part with beta suffix'],
      ['2.4.6-p2', 'three-part with p2 suffix'],
      ['1.0-beta.1', 'two-part with complex beta suffix'],
      ['2.4-p2.1', 'two-part with complex patch suffix'],
      ['1.0.0-rc.1', 'three-part with release candidate suffix'],
      ['2.4.6-dev', 'three-part with dev suffix']
    ])('should accept %s (%s)', (version) => {
      expect(() => sut.validateVersionString(version)).not.toThrow();
    });
  });

  describe('edge cases - leading zeros', () => {
    it.each([
      ['01.0', 'leading zero in major'],
      ['1.01', 'leading zero in minor'],
      ['1.0.01', 'leading zero in patch']
    ])('should accept %s (%s) - regex allows leading zeros', (version) => {
      // Based on the regex, leading zeros are allowed
      expect(() => sut.validateVersionString(version)).not.toThrow();
    });
  });

  describe('invalid versions - empty or missing parts', () => {
    it.each([
      ['', 'empty string'],
      ['1', 'single number only'],
      ['.1', 'missing major version'],
      ['1.', 'missing minor version'],
      ['1..0', 'double dots']
    ])('should reject %s (%s)', (version, description) => {
      expect(() => sut.validateVersionString(version)).toThrow();
    });
  });

  describe('invalid versions - too many parts', () => {
    it.each([
      ['1.2.3.4', 'four parts'],
      ['1.2.3.4.5', 'five parts']
    ])('should reject %s (%s)', (version, description) => {
      expect(() => sut.validateVersionString(version)).toThrow();
    });
  });

  describe('invalid versions - non-numeric', () => {
    it.each([
      ['a.b', 'letters only'],
      ['a.b.c', 'three-part letters'],
      ['1.a', 'letter in minor'],
      ['a.1', 'letter in major'],
      ['1.2.a', 'letter in patch']
    ])('should reject %s (%s)', (version, description) => {
      expect(() => sut.validateVersionString(version)).toThrow();
    });
  });

  describe('invalid versions - bad suffix format', () => {
    it.each([
      ['1.0-1beta', 'suffix starts with number'],
      ['1.0-', 'empty suffix after dash'],
      ['1.0--beta', 'double dash'],
      ['1.0-BETA', 'uppercase suffix (regex uses lowercase)']
    ])('should reject %s (%s)', (version, description) => {
      expect(() => sut.validateVersionString(version)).toThrow();
    });
  });

  describe('invalid versions - null/undefined', () => {
    it('should throw for null input', () => {
      expect(() => sut.validateVersionString(null)).toThrow();
    });

    it('should throw for undefined input', () => {
      expect(() => sut.validateVersionString(undefined)).toThrow();
    });
  });

  describe('error message includes name parameter', () => {
    it('should include provided name in error message', () => {
      expect(() => sut.validateVersionString('bad', 'MyVersion'))
        .toThrow(/MyVersion/);
    });

    it('should include "Version" as default name in error message', () => {
      expect(() => sut.validateVersionString('bad'))
        .toThrow(/Version/);
    });

    it('should include the invalid version in error message', () => {
      expect(() => sut.validateVersionString('invalid-version', 'TestVersion'))
        .toThrow(/invalid-version/);
    });
  });
});

// ============================================================================
// Tests for updateComposerConfigFromMagentoToMageOs
// ============================================================================

describe('updateComposerConfigFromMagentoToMageOs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isOnPackagist.mockReturnValue(false);
  });

  describe('package name transformation', () => {
    it('should update package name from magento to mage-os vendor', () => {
      const composerConfig = createComposerConfig();
      const instruction = createInstruction();
      const release = createRelease();

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.name).toBe('mage-os/module-catalog');
    });

    it('should use custom vendor from instruction', () => {
      const composerConfig = createComposerConfig();
      const instruction = createInstruction({ vendor: 'custom-vendor' });
      const release = createRelease();

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.name).toBe('custom-vendor/module-catalog');
    });

    it('should not modify non-magento package names', () => {
      const composerConfig = createComposerConfig({ name: 'other/package' });
      const instruction = createInstruction();
      const release = createRelease();

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.name).toBe('other/package');
    });
  });

  describe('version setting', () => {
    it('should set version from release.version', () => {
      const composerConfig = createComposerConfig();
      const instruction = createInstruction();
      const release = createRelease({ version: '2.0.0' });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.version).toBe('2.0.0');
    });

    it('should fall back to release.ref when version is not set', () => {
      const composerConfig = createComposerConfig();
      const instruction = createInstruction();
      const release = createRelease({ version: null, ref: 'v1.2.3' });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.version).toBe('v1.2.3');
    });
  });

  describe('require section transformation', () => {
    it('should transform magento dependencies to mage-os vendor', () => {
      const composerConfig = createComposerConfig({
        require: {
          'magento/framework': '^103.0',
          'magento/module-store': '^101.0',
          'php': '^7.4|^8.0'
        }
      });
      const instruction = createInstruction();
      const release = createRelease();

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.require).toHaveProperty('mage-os/framework');
      expect(composerConfig.require).toHaveProperty('mage-os/module-store');
      expect(composerConfig.require).toHaveProperty('php');
      expect(composerConfig.require).not.toHaveProperty('magento/framework');
      expect(composerConfig.require).not.toHaveProperty('magento/module-store');
    });

    it('should set mage-os dependency versions from release.version', () => {
      const composerConfig = createComposerConfig({
        require: {
          'magento/framework': '^103.0'
        }
      });
      const instruction = createInstruction();
      const release = createRelease({ version: '1.5.0' });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.require['mage-os/framework']).toBe('1.5.0');
    });
  });

  describe('require-dev section transformation', () => {
    it('should transform require-dev magento dependencies', () => {
      const composerConfig = createComposerConfig({
        'require-dev': {
          'magento/module-developer': '^100.4'
        }
      });
      const instruction = createInstruction();
      const release = createRelease();

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig['require-dev']).toHaveProperty('mage-os/module-developer');
      expect(composerConfig['require-dev']).not.toHaveProperty('magento/module-developer');
    });

    it('should handle missing require-dev section', () => {
      const composerConfig = createComposerConfig();
      delete composerConfig['require-dev'];
      const instruction = createInstruction();
      const release = createRelease();

      expect(() => {
        sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);
      }).not.toThrow();
    });
  });

  describe('suggest section transformation', () => {
    it('should transform suggest magento dependencies', () => {
      const composerConfig = createComposerConfig({
        suggest: {
          'magento/module-catalog-sample-data': 'Sample Data version: 100.4.*'
        }
      });
      const instruction = createInstruction();
      const release = createRelease();

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.suggest).toHaveProperty('mage-os/module-catalog-sample-data');
      expect(composerConfig.suggest).not.toHaveProperty('magento/module-catalog-sample-data');
    });

    it('should format sample-data packages with special text in suggest', () => {
      const composerConfig = createComposerConfig({
        suggest: {
          'magento/module-catalog-sample-data': '*'
        }
      });
      const instruction = createInstruction();
      const release = createRelease({ version: '2.0.0' });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.suggest['mage-os/module-catalog-sample-data'])
        .toBe('Sample Data version: 2.0.0');
    });

    it('should handle missing suggest section', () => {
      const composerConfig = createComposerConfig();
      delete composerConfig.suggest;
      const instruction = createInstruction();
      const release = createRelease();

      expect(() => {
        sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);
      }).not.toThrow();
    });
  });

  describe('replace section transformation', () => {
    it('should add replace section for original package when in replaceVersions', () => {
      const composerConfig = createComposerConfig({ name: 'magento/module-catalog' });
      const instruction = createInstruction();
      const release = createRelease({
        replaceVersions: { 'magento/module-catalog': '103.0.0' }
      });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.replace).toEqual({ 'magento/module-catalog': '103.0.0' });
    });

    it('should not add replace section when package not in replaceVersions', () => {
      const composerConfig = createComposerConfig({ name: 'magento/module-catalog' });
      delete composerConfig.replace;
      const instruction = createInstruction();
      const release = createRelease({ replaceVersions: {} });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.replace).toBeUndefined();
    });

    it('should transform existing replace section keys', () => {
      const composerConfig = createComposerConfig({
        name: 'magento/module-catalog',
        replace: {
          'magento/module-old': '100.0.0'
        }
      });
      const instruction = createInstruction();
      const release = createRelease({
        replaceVersions: { 'magento/module-catalog': '103.0.0' }
      });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      // The original replace section gets transformed, then overwritten
      expect(composerConfig.replace).toEqual({ 'magento/module-catalog': '103.0.0' });
    });
  });

  describe('allow-plugins config transformation', () => {
    it('should transform magento plugins in allow-plugins config', () => {
      const composerConfig = createComposerConfig({
        config: {
          'allow-plugins': {
            'magento/composer-dependency-version-audit-plugin': true,
            'magento/magento-composer-installer': true,
            'laminas/laminas-dependency-plugin': false
          }
        }
      });
      const instruction = createInstruction();
      const release = createRelease();

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.config['allow-plugins']).toHaveProperty('mage-os/composer-dependency-version-audit-plugin');
      expect(composerConfig.config['allow-plugins']).toHaveProperty('mage-os/magento-composer-installer');
      expect(composerConfig.config['allow-plugins']).toHaveProperty('laminas/laminas-dependency-plugin');
      expect(composerConfig.config['allow-plugins']).not.toHaveProperty('magento/composer-dependency-version-audit-plugin');
      expect(composerConfig.config['allow-plugins']).not.toHaveProperty('magento/magento-composer-installer');
    });

    it('should preserve plugin boolean values', () => {
      const composerConfig = createComposerConfig({
        config: {
          'allow-plugins': {
            'magento/composer-dependency-version-audit-plugin': true,
            'magento/magento-composer-installer': false
          }
        }
      });
      const instruction = createInstruction();
      const release = createRelease();

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.config['allow-plugins']['mage-os/composer-dependency-version-audit-plugin']).toBe(true);
      expect(composerConfig.config['allow-plugins']['mage-os/magento-composer-installer']).toBe(false);
    });

    it('should handle missing config section', () => {
      const composerConfig = createComposerConfig();
      delete composerConfig.config;
      const instruction = createInstruction();
      const release = createRelease();

      expect(() => {
        sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);
      }).not.toThrow();
    });

    it('should handle missing allow-plugins section', () => {
      const composerConfig = createComposerConfig({
        config: {
          'sort-packages': true
        }
      });
      const instruction = createInstruction();
      const release = createRelease();

      expect(() => {
        sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);
      }).not.toThrow();
    });

    it('should handle empty allow-plugins section', () => {
      const composerConfig = createComposerConfig({
        config: {
          'allow-plugins': {}
        }
      });
      const instruction = createInstruction();
      const release = createRelease();

      expect(() => {
        sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);
      }).not.toThrow();

      expect(composerConfig.config['allow-plugins']).toEqual({});
    });
  });

  describe('packagist integration', () => {
    it('should not set version for packages on packagist', () => {
      isOnPackagist.mockReturnValue(true);

      const composerConfig = createComposerConfig({
        require: {
          'magento/framework': '^103.0'
        }
      });
      const instruction = createInstruction();
      const release = createRelease({ version: '1.5.0' });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      // The original version constraint should be preserved (after key transformation)
      expect(composerConfig.require['mage-os/framework']).toBe('^103.0');
    });

    it('should set version for packages not on packagist', () => {
      isOnPackagist.mockReturnValue(false);

      const composerConfig = createComposerConfig({
        require: {
          'magento/framework': '^103.0'
        }
      });
      const instruction = createInstruction();
      const release = createRelease({ version: '1.5.0' });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.require['mage-os/framework']).toBe('1.5.0');
    });
  });

  describe('full transformation - integration scenarios', () => {
    it('should transform a complete magento module composer.json', () => {
      const composerConfig = {
        name: 'magento/module-catalog',
        description: 'Magento Catalog Module',
        version: '103.0.4',
        require: {
          'php': '^7.4|^8.0',
          'magento/framework': '^103.0',
          'magento/module-store': '^101.0',
          'magento/module-eav': '^102.0'
        },
        'require-dev': {
          'magento/module-developer': '^100.4'
        },
        suggest: {
          'magento/module-catalog-sample-data': 'Sample Data version: 100.4.*'
        },
        config: {
          'sort-packages': true,
          'allow-plugins': {
            'magento/magento-composer-installer': true
          }
        }
      };
      const instruction = createInstruction();
      const release = createRelease({
        version: '1.0.0',
        replaceVersions: { 'magento/module-catalog': '103.0.4' }
      });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      // Verify name transformation
      expect(composerConfig.name).toBe('mage-os/module-catalog');

      // Verify version set
      expect(composerConfig.version).toBe('1.0.0');

      // Verify require transformation
      expect(composerConfig.require).toHaveProperty('mage-os/framework');
      expect(composerConfig.require).toHaveProperty('mage-os/module-store');
      expect(composerConfig.require).toHaveProperty('mage-os/module-eav');
      expect(composerConfig.require).toHaveProperty('php'); // Non-magento preserved

      // Verify require-dev transformation
      expect(composerConfig['require-dev']).toHaveProperty('mage-os/module-developer');

      // Verify suggest transformation
      expect(composerConfig.suggest).toHaveProperty('mage-os/module-catalog-sample-data');
      expect(composerConfig.suggest['mage-os/module-catalog-sample-data']).toBe('Sample Data version: 1.0.0');

      // Verify replace section added
      expect(composerConfig.replace).toEqual({ 'magento/module-catalog': '103.0.4' });

      // Verify allow-plugins transformation
      expect(composerConfig.config['allow-plugins']).toHaveProperty('mage-os/magento-composer-installer');
    });

    it('should handle minimal composer.json with only name', () => {
      const composerConfig = {
        name: 'magento/module-simple'
      };
      const instruction = createInstruction();
      const release = createRelease({ version: '1.0.0' });

      expect(() => {
        sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);
      }).not.toThrow();

      expect(composerConfig.name).toBe('mage-os/module-simple');
      expect(composerConfig.version).toBe('1.0.0');
    });

    it('should handle metapackage composer.json', () => {
      const composerConfig = {
        name: 'magento/product-community-edition',
        description: 'Magento Community Edition',
        type: 'metapackage',
        version: '2.4.6',
        require: {
          'magento/magento2-base': '2.4.6',
          'magento/module-catalog': '*',
          'magento/module-customer': '*'
        }
      };
      const instruction = createInstruction();
      const release = createRelease({
        version: '1.0.0',
        replaceVersions: { 'magento/product-community-edition': '2.4.6' }
      });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.name).toBe('mage-os/product-community-edition');
      expect(composerConfig.type).toBe('metapackage');
      expect(composerConfig.require).toHaveProperty('mage-os/magento2-base');
      expect(composerConfig.require).toHaveProperty('mage-os/module-catalog');
      expect(composerConfig.require).toHaveProperty('mage-os/module-customer');
      expect(composerConfig.replace).toEqual({ 'magento/product-community-edition': '2.4.6' });
    });
  });

  describe('dependency version fallback chain', () => {
    it('should use release.version when available', () => {
      const composerConfig = createComposerConfig({
        require: { 'magento/framework': '*' }
      });
      const instruction = createInstruction();
      const release = createRelease({
        version: '1.0.0',
        fallbackVersion: '0.9.0',
        dependencyVersions: { '*': '0.8.0' }
      });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.require['mage-os/framework']).toBe('1.0.0');
    });

    it('should use fallbackVersion when version is not set', () => {
      const composerConfig = createComposerConfig({
        require: { 'magento/framework': '*' }
      });
      const instruction = createInstruction();
      const release = createRelease({
        version: null,
        ref: 'main',
        fallbackVersion: '0.9.0',
        dependencyVersions: { '*': '0.8.0' }
      });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.require['mage-os/framework']).toBe('0.9.0');
    });

    it('should use dependencyVersions[packageName] when version and fallbackVersion are not set', () => {
      const composerConfig = createComposerConfig({
        require: { 'magento/framework': '*' }
      });
      const instruction = createInstruction();
      const release = createRelease({
        version: null,
        ref: 'main',
        fallbackVersion: null,
        dependencyVersions: {
          'mage-os/framework': '0.7.0',
          '*': '0.8.0'
        }
      });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.require['mage-os/framework']).toBe('0.7.0');
    });

    it('should use dependencyVersions["*"] wildcard when version, fallbackVersion, and specific package version are not set', () => {
      const composerConfig = createComposerConfig({
        require: { 'magento/framework': '*' }
      });
      const instruction = createInstruction();
      const release = createRelease({
        version: null,
        ref: 'main',
        fallbackVersion: null,
        dependencyVersions: { '*': '0.8.0' }
      });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.require['mage-os/framework']).toBe('0.8.0');
    });
  });
});

// ============================================================================
// Additional Edge Case Tests
// ============================================================================

describe('edge cases and error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isOnPackagist.mockReturnValue(false);
  });

  describe('empty sections', () => {
    it('should handle empty require section', () => {
      const composerConfig = createComposerConfig({ require: {} });
      const instruction = createInstruction();
      const release = createRelease();

      expect(() => {
        sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);
      }).not.toThrow();

      expect(composerConfig.require).toEqual({});
    });

    it('should handle empty require-dev section', () => {
      const composerConfig = createComposerConfig({ 'require-dev': {} });
      const instruction = createInstruction();
      const release = createRelease();

      expect(() => {
        sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);
      }).not.toThrow();
    });

    it('should handle empty suggest section', () => {
      const composerConfig = createComposerConfig({ suggest: {} });
      const instruction = createInstruction();
      const release = createRelease();

      expect(() => {
        sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);
      }).not.toThrow();
    });
  });

  describe('mixed vendor packages', () => {
    it('should only transform magento packages, not other vendors', () => {
      const composerConfig = createComposerConfig({
        require: {
          'magento/framework': '*',
          'laminas/laminas-mvc': '^3.0',
          'symfony/console': '^5.0',
          'php': '^7.4'
        }
      });
      const instruction = createInstruction();
      const release = createRelease({ version: '1.0.0' });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.require).toHaveProperty('mage-os/framework');
      expect(composerConfig.require).toHaveProperty('laminas/laminas-mvc');
      expect(composerConfig.require).toHaveProperty('symfony/console');
      expect(composerConfig.require).toHaveProperty('php');
      expect(composerConfig.require['laminas/laminas-mvc']).toBe('^3.0');
      expect(composerConfig.require['symfony/console']).toBe('^5.0');
    });
  });

  describe('package name edge cases', () => {
    it('should handle package with magento in name but different vendor', () => {
      const composerConfig = createComposerConfig({
        name: 'other/magento-extension'
      });
      const instruction = createInstruction();
      const release = createRelease();

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      // Only replaces if it starts with magento/
      expect(composerConfig.name).toBe('other/magento-extension');
    });

    it('should handle magento package that contains magento twice', () => {
      const composerConfig = createComposerConfig({
        name: 'magento/magento-composer-installer'
      });
      const instruction = createInstruction();
      const release = createRelease();

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      // Only the first magento/ should be replaced
      expect(composerConfig.name).toBe('mage-os/magento-composer-installer');
    });
  });

  describe('special version handling', () => {
    it('should handle version with dev suffix', () => {
      const composerConfig = createComposerConfig();
      const instruction = createInstruction();
      const release = createRelease({ version: '1.0.0-dev' });

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      expect(composerConfig.version).toBe('1.0.0-dev');
    });

    it('should handle complex version constraints in dependencies', () => {
      isOnPackagist.mockReturnValue(true); // Preserve version when on packagist

      const composerConfig = createComposerConfig({
        require: {
          'magento/framework': '^102.0 || ^103.0'
        }
      });
      const instruction = createInstruction();
      const release = createRelease();

      sut.updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

      // Complex version constraint should be preserved if on packagist
      expect(composerConfig.require['mage-os/framework']).toBe('^102.0 || ^103.0');
    });
  });
});
