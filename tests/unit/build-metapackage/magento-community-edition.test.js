const {
  transformMagentoCommunityEditionProject,
  transformMagentoCommunityEditionProduct
} = require('../../../src/build-metapackage/magento-community-edition');

const {
  getVersionStability,
  setDependencyVersions,
  getAdditionalConfiguration
} = require('../../../src/package-modules');

jest.mock('../../../src/package-modules');

describe('magento-community-edition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAdditionalConfiguration.mockResolvedValue({});
    setDependencyVersions.mockImplementation(() => {});
    getVersionStability.mockReturnValue('stable');
  });

  /**
   * Helper to create mock inputs with optional overrides
   */
  const createMockInputs = (overrides = {}) => {
    const defaults = {
      composerConfig: {
        version: '2.4.6',
        require: {},
        name: 'magento/magento2ce',
        description: 'Original description',
        type: 'project',
        license: ['OSL-3.0', 'AFL-3.0']
      },
      instruction: {
        vendor: 'mage-os'
      },
      metapackage: {
        name: 'project-community-edition'
      },
      release: {
        version: '2.4.6',
        ref: '2.4.6',
        dependencyVersions: {},
        composerRepoUrl: 'https://repo.mage-os.org'
      }
    };

    return {
      composerConfig: { ...defaults.composerConfig, ...(overrides.composerConfig || {}) },
      instruction: { ...defaults.instruction, ...(overrides.instruction || {}) },
      metapackage: { ...defaults.metapackage, ...(overrides.metapackage || {}) },
      release: { ...defaults.release, ...(overrides.release || {}) }
    };
  };

  describe('transformMagentoCommunityEditionProject', () => {
    describe('Happy Path Tests', () => {
      test('should return full additionalConfig when not a new release and additionalConfig has prefer-stable', async () => {
        const additionalConfig = {
          'prefer-stable': true,
          name: 'mage-os/project-community-edition',
          version: '2.4.5',
          require: { 'mage-os/product-community-edition': '2.4.5' }
        };
        getAdditionalConfiguration.mockResolvedValue(additionalConfig);

        const { composerConfig, instruction, metapackage, release } = createMockInputs({
          release: {
            version: '2.4.5',
            ref: '2.4.5',
            dependencyVersions: { 'mage-os/project-community-edition': '2.4.5' },
            composerRepoUrl: 'https://repo.mage-os.org'
          }
        });

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        expect(result).toBe(additionalConfig);
        expect(setDependencyVersions).not.toHaveBeenCalled();
      });

      test('should correctly construct package name from vendor and metapackage name', async () => {
        const { composerConfig, instruction, metapackage, release } = createMockInputs();

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        expect(result.name).toBe('mage-os/project-community-edition');
      });

      test('should derive product name by replacing project- with product-', async () => {
        const { composerConfig, instruction, metapackage, release } = createMockInputs();

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require).toHaveProperty('mage-os/product-community-edition');
      });

      test('should use release.version when available', async () => {
        const { composerConfig, instruction, metapackage, release } = createMockInputs({
          release: {
            version: '2.4.6',
            ref: '2.4.5',
            dependencyVersions: {},
            composerRepoUrl: 'https://repo.mage-os.org'
          }
        });

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require['mage-os/product-community-edition']).toBe('2.4.6');
      });

      test('should fallback to dependencyVersions[packageName] when release.version is undefined', async () => {
        const { composerConfig, instruction, metapackage, release } = createMockInputs({
          release: {
            version: undefined,
            ref: '2.4.4',
            dependencyVersions: { 'mage-os/project-community-edition': '2.4.5' },
            composerRepoUrl: 'https://repo.mage-os.org'
          }
        });

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require['mage-os/product-community-edition']).toBe('2.4.5');
      });

      test('should fallback to release.ref when no other version source available', async () => {
        const { composerConfig, instruction, metapackage, release } = createMockInputs({
          release: {
            version: undefined,
            ref: '2.4.4',
            dependencyVersions: {},
            composerRepoUrl: 'https://repo.mage-os.org'
          }
        });

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require['mage-os/product-community-edition']).toBe('2.4.4');
      });

      test('should set correct composer repositories', async () => {
        const { composerConfig, instruction, metapackage, release } = createMockInputs({
          release: {
            version: '2.4.6',
            ref: '2.4.6',
            dependencyVersions: {},
            composerRepoUrl: 'https://repo.mage-os.org'
          }
        });

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        expect(result.repositories).toEqual([
          { type: 'composer', url: 'https://repo.mage-os.org' }
        ]);
      });

      test('should remove replace and suggest keys from output', async () => {
        const { composerConfig, instruction, metapackage, release } = createMockInputs({
          composerConfig: {
            version: '2.4.6',
            require: {},
            replace: { 'magento/module-catalog': '*' },
            suggest: { 'ext-redis': 'For improved caching' }
          }
        });

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        expect(result).not.toHaveProperty('replace');
        expect(result).not.toHaveProperty('suggest');
      });

      test('should merge additionalConfig.require with base require', async () => {
        const additionalConfig = {
          require: {
            'ext-bcmath': '*',
            'ext-ctype': '*'
          }
        };
        getAdditionalConfiguration.mockResolvedValue(additionalConfig);

        const { composerConfig, instruction, metapackage, release } = createMockInputs();

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require).toHaveProperty('mage-os/product-community-edition');
        expect(result.require).toHaveProperty('ext-bcmath', '*');
        expect(result.require).toHaveProperty('ext-ctype', '*');
      });
    });

    describe('Edge Cases', () => {
      test('should handle empty composerConfig', async () => {
        const { instruction, metapackage, release } = createMockInputs();
        const composerConfig = {};

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        expect(result.name).toBe('mage-os/project-community-edition');
        expect(result.require).toHaveProperty('mage-os/product-community-edition');
        expect(result.description).toBe('Community-built eCommerce Platform for Growth');
      });

      test('should handle empty additionalConfig', async () => {
        getAdditionalConfiguration.mockResolvedValue({});

        const { composerConfig, instruction, metapackage, release } = createMockInputs();

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        expect(result.name).toBe('mage-os/project-community-edition');
        expect(result.require).toHaveProperty('mage-os/product-community-edition');
      });

      test('should handle when dependencyVersions[*] is defined (new release)', async () => {
        const additionalConfig = {
          'prefer-stable': true,
          name: 'mage-os/project-community-edition',
          require: { 'mage-os/product-community-edition': '2.4.5' }
        };
        getAdditionalConfiguration.mockResolvedValue(additionalConfig);

        const { composerConfig, instruction, metapackage, release } = createMockInputs({
          release: {
            version: '2.4.6',
            ref: '2.4.6',
            dependencyVersions: { '*': '2.4.6' },
            composerRepoUrl: 'https://repo.mage-os.org'
          }
        });

        const result = await transformMagentoCommunityEditionProject(
          composerConfig, instruction, metapackage, release
        );

        // Should NOT return additionalConfig early, should process normally
        expect(result).not.toBe(additionalConfig);
        expect(result.name).toBe('mage-os/project-community-edition');
        expect(setDependencyVersions).toHaveBeenCalled();
      });
    });

    describe('Error Cases', () => {
      test('should handle getAdditionalConfiguration rejection gracefully', async () => {
        const error = new Error('Configuration fetch failed');
        getAdditionalConfiguration.mockRejectedValue(error);

        const { composerConfig, instruction, metapackage, release } = createMockInputs();

        await expect(
          transformMagentoCommunityEditionProject(composerConfig, instruction, metapackage, release)
        ).rejects.toThrow('Configuration fetch failed');
      });
    });
  });

  describe('transformMagentoCommunityEditionProduct', () => {
    /**
     * Helper to create mock inputs for product tests
     */
    const createProductMockInputs = (overrides = {}) => {
      const defaults = {
        composerConfig: {
          version: '2.4.6',
          require: { 'php': '^8.1' },
          name: 'magento/magento2ce',
          description: 'Original description',
          type: 'project',
          license: ['OSL-3.0', 'AFL-3.0'],
          extra: { 'some-key': 'some-value' },
          replace: {
            'magento/module-catalog': '*',
            'magento/module-sales': '*',
            'other/package': '*'
          }
        },
        instruction: {
          vendor: 'mage-os'
        },
        metapackage: {
          name: 'product-community-edition'
        },
        release: {
          version: '2.4.6',
          ref: '2.4.6',
          dependencyVersions: {},
          composerRepoUrl: 'https://repo.mage-os.org'
        }
      };

      return {
        composerConfig: { ...defaults.composerConfig, ...(overrides.composerConfig || {}) },
        instruction: { ...defaults.instruction, ...(overrides.instruction || {}) },
        metapackage: { ...defaults.metapackage, ...(overrides.metapackage || {}) },
        release: { ...defaults.release, ...(overrides.release || {}) }
      };
    };

    describe('Happy Path Tests', () => {
      test('should return full additionalConfig when not a new release and additionalConfig has prefer-stable', async () => {
        const additionalConfig = {
          'prefer-stable': true,
          name: 'mage-os/product-community-edition',
          version: '2.4.5',
          require: { 'mage-os/magento2-base': '2.4.5' }
        };
        getAdditionalConfiguration.mockResolvedValue(additionalConfig);

        const { composerConfig, instruction, metapackage, release } = createProductMockInputs({
          release: {
            version: '2.4.5',
            ref: '2.4.5',
            dependencyVersions: { 'mage-os/product-community-edition': '2.4.5' },
            composerRepoUrl: 'https://repo.mage-os.org'
          }
        });

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result).toBe(additionalConfig);
        expect(setDependencyVersions).not.toHaveBeenCalled();
      });

      test('should correctly construct package name', async () => {
        const { composerConfig, instruction, metapackage, release } = createProductMockInputs();

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.name).toBe('mage-os/product-community-edition');
      });

      test('should delete extra from composerConfig', async () => {
        const { composerConfig, instruction, metapackage, release } = createProductMockInputs({
          composerConfig: {
            version: '2.4.6',
            require: {},
            extra: { 'magento-root-dir': '.' }
          }
        });

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result).not.toHaveProperty('extra');
      });

      test('should extract magento/ vendor replacements from replace section', async () => {
        const { composerConfig, instruction, metapackage, release } = createProductMockInputs({
          composerConfig: {
            version: '2.4.6',
            require: {},
            replace: {
              'magento/module-catalog': '*',
              'other/pkg': '2.0.0'
            }
          }
        });

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require).toHaveProperty('magento/module-catalog', '*');
        expect(result.require).not.toHaveProperty('other/pkg');
      });

      test('should extract instruction.vendor replacements from replace section', async () => {
        const { composerConfig, instruction, metapackage, release } = createProductMockInputs({
          composerConfig: {
            version: '2.4.6',
            require: {},
            replace: {
              'mage-os/module-custom': '1.0.0',
              'other/pkg': '2.0.0'
            }
          },
          instruction: { vendor: 'mage-os' }
        });

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require).toHaveProperty('mage-os/module-custom', '1.0.0');
        expect(result.require).not.toHaveProperty('other/pkg');
      });

      test('should set type to metapackage', async () => {
        const { composerConfig, instruction, metapackage, release } = createProductMockInputs();

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.type).toBe('metapackage');
      });

      test('should add magento2-base requirement with correct version', async () => {
        const { composerConfig, instruction, metapackage, release } = createProductMockInputs({
          release: {
            version: '2.4.6',
            ref: '2.4.6',
            dependencyVersions: {},
            composerRepoUrl: 'https://repo.mage-os.org'
          }
        });

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require).toHaveProperty('mage-os/magento2-base', '2.4.6');
      });

      test('should fallback to composerConfig.version for magento2-base when release.version is undefined', async () => {
        const { composerConfig, instruction, metapackage, release } = createProductMockInputs({
          composerConfig: {
            version: '2.4.5',
            require: {}
          },
          release: {
            version: undefined,
            ref: '2.4.4',
            dependencyVersions: {},
            composerRepoUrl: 'https://repo.mage-os.org'
          }
        });

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require).toHaveProperty('mage-os/magento2-base', '2.4.5');
      });

      test('should remove all specified keys from output', async () => {
        const { composerConfig, instruction, metapackage, release } = createProductMockInputs({
          composerConfig: {
            version: '2.4.6',
            require: {},
            autoload: { 'psr-4': {} },
            'autoload-dev': { 'psr-4': {} },
            config: { 'sort-packages': true },
            conflict: { 'gene/bluefoot': '*' },
            'minimum-stability': 'stable',
            replace: { 'magento/module-catalog': '*' },
            'require-dev': { 'phpunit/phpunit': '^9' },
            suggest: { 'ext-redis': '*' }
          }
        });

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result).not.toHaveProperty('autoload');
        expect(result).not.toHaveProperty('autoload-dev');
        expect(result).not.toHaveProperty('config');
        expect(result).not.toHaveProperty('conflict');
        expect(result).not.toHaveProperty('minimum-stability');
        expect(result).not.toHaveProperty('replace');
        expect(result).not.toHaveProperty('require-dev');
        expect(result).not.toHaveProperty('suggest');
      });

      test('should merge requirements in correct order (composerConfig.require, vendorReplacements, additionalConfig.require, magento2-base)', async () => {
        const additionalConfig = {
          require: {
            'mage-os/module-extra': '1.0.0',
            'magento/module-catalog': '200.0.0' // Should override vendorReplacement
          }
        };
        getAdditionalConfiguration.mockResolvedValue(additionalConfig);

        const { composerConfig, instruction, metapackage, release } = createProductMockInputs({
          composerConfig: {
            version: '2.4.6',
            require: {
              'php': '^8.1',
              'ext-intl': '*'
            },
            replace: {
              'magento/module-catalog': '100.0.0',
              'magento/module-sales': '*'
            }
          },
          release: {
            version: '2.4.6',
            ref: '2.4.6',
            dependencyVersions: {},
            composerRepoUrl: 'https://repo.mage-os.org'
          }
        });

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        // Base require
        expect(result.require).toHaveProperty('php', '^8.1');
        expect(result.require).toHaveProperty('ext-intl', '*');

        // Vendor replacements (magento/ from replace)
        expect(result.require).toHaveProperty('magento/module-sales', '*');

        // additionalConfig.require should override vendor replacement for module-catalog
        expect(result.require).toHaveProperty('magento/module-catalog', '200.0.0');

        // Additional config require
        expect(result.require).toHaveProperty('mage-os/module-extra', '1.0.0');

        // magento2-base should be last
        expect(result.require).toHaveProperty('mage-os/magento2-base', '2.4.6');
      });
    });

    describe('Edge Cases', () => {
      test('should handle missing replace section', async () => {
        const { composerConfig, instruction, metapackage, release } = createProductMockInputs({
          composerConfig: {
            version: '2.4.6',
            require: { 'php': '^8.1' }
            // No replace key
          }
        });

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.name).toBe('mage-os/product-community-edition');
        expect(result.require).toHaveProperty('php', '^8.1');
        expect(result.require).toHaveProperty('mage-os/magento2-base', '2.4.6');
      });

      test('should handle empty replace section', async () => {
        const { composerConfig, instruction, metapackage, release } = createProductMockInputs({
          composerConfig: {
            version: '2.4.6',
            require: { 'php': '^8.1' },
            replace: {}
          }
        });

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.name).toBe('mage-os/product-community-edition');
        expect(result.require).toHaveProperty('php', '^8.1');
        expect(result.require).toHaveProperty('mage-os/magento2-base', '2.4.6');
      });

      test('should handle composerConfig without require section', async () => {
        const { composerConfig, instruction, metapackage, release } = createProductMockInputs({
          composerConfig: {
            version: '2.4.6'
            // No require key
          }
        });

        const result = await transformMagentoCommunityEditionProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require).toHaveProperty('mage-os/magento2-base', '2.4.6');
      });
    });

    describe('Error Cases', () => {
      test('should handle getAdditionalConfiguration rejection gracefully', async () => {
        const error = new Error('Configuration fetch failed');
        getAdditionalConfiguration.mockRejectedValue(error);

        const { composerConfig, instruction, metapackage, release } = createProductMockInputs();

        await expect(
          transformMagentoCommunityEditionProduct(composerConfig, instruction, metapackage, release)
        ).rejects.toThrow('Configuration fetch failed');
      });
    });
  });

  describe('Version Stability Integration', () => {
    test('should call getVersionStability with resolved version for project', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs({
        release: {
          version: '2.4.6-beta1',
          ref: '2.4.6-beta1',
          dependencyVersions: {},
          composerRepoUrl: 'https://repo.mage-os.org'
        }
      });

      await transformMagentoCommunityEditionProject(
        composerConfig, instruction, metapackage, release
      );

      expect(getVersionStability).toHaveBeenCalledWith('2.4.6-beta1');
    });

    test('should set minimum-stability based on version stability for project', async () => {
      getVersionStability.mockReturnValue('beta');

      const { composerConfig, instruction, metapackage, release } = createMockInputs({
        release: {
          version: '2.4.6-beta1',
          ref: '2.4.6-beta1',
          dependencyVersions: {},
          composerRepoUrl: 'https://repo.mage-os.org'
        }
      });

      const result = await transformMagentoCommunityEditionProject(
        composerConfig, instruction, metapackage, release
      );

      expect(result['minimum-stability']).toBe('beta');
    });
  });

  describe('setDependencyVersions Integration', () => {
    test('should call setDependencyVersions with correct parameters for project', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs();

      await transformMagentoCommunityEditionProject(
        composerConfig, instruction, metapackage, release
      );

      expect(setDependencyVersions).toHaveBeenCalledWith(
        instruction,
        release,
        expect.objectContaining({ name: 'mage-os/project-community-edition' })
      );
    });

    test('should call setDependencyVersions with correct parameters for product', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs({
        metapackage: { name: 'product-community-edition' }
      });

      await transformMagentoCommunityEditionProduct(
        composerConfig, instruction, metapackage, release
      );

      expect(setDependencyVersions).toHaveBeenCalledWith(
        instruction,
        release,
        expect.objectContaining({ name: 'mage-os/product-community-edition' })
      );
    });
  });

  describe('getAdditionalConfiguration Integration', () => {
    test('should call getAdditionalConfiguration with correct packageName and ref for project', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs({
        release: {
          version: '2.4.6',
          ref: 'v2.4.6',
          dependencyVersions: {},
          composerRepoUrl: 'https://repo.mage-os.org'
        }
      });

      await transformMagentoCommunityEditionProject(
        composerConfig, instruction, metapackage, release
      );

      expect(getAdditionalConfiguration).toHaveBeenCalledWith(
        'mage-os/project-community-edition',
        'v2.4.6'
      );
    });

    test('should call getAdditionalConfiguration with correct packageName and ref for product', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs({
        metapackage: { name: 'product-community-edition' },
        release: {
          version: '2.4.6',
          ref: 'v2.4.6',
          dependencyVersions: {},
          composerRepoUrl: 'https://repo.mage-os.org'
        }
      });

      await transformMagentoCommunityEditionProduct(
        composerConfig, instruction, metapackage, release
      );

      expect(getAdditionalConfiguration).toHaveBeenCalledWith(
        'mage-os/product-community-edition',
        'v2.4.6'
      );
    });
  });

  describe('Description Override', () => {
    test('should override description for project packages', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs({
        composerConfig: {
          version: '2.4.6',
          require: {},
          description: 'Original description that should be overwritten'
        }
      });

      const result = await transformMagentoCommunityEditionProject(
        composerConfig, instruction, metapackage, release
      );

      expect(result.description).toBe('Community-built eCommerce Platform for Growth');
    });

    test('should override description for product packages', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs({
        composerConfig: {
          version: '2.4.6',
          require: {},
          description: 'Original description that should be overwritten'
        },
        metapackage: { name: 'product-community-edition' }
      });

      const result = await transformMagentoCommunityEditionProduct(
        composerConfig, instruction, metapackage, release
      );

      expect(result.description).toBe('eCommerce Platform for Growth (Community Edition)');
    });
  });

  describe('Extra Field Handling', () => {
    test('should set magento-force extra for project packages', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs();

      const result = await transformMagentoCommunityEditionProject(
        composerConfig, instruction, metapackage, release
      );

      expect(result.extra).toEqual({ 'magento-force': 'override' });
    });

    test('should remove extra from product packages', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs({
        composerConfig: {
          version: '2.4.6',
          require: {},
          extra: {
            'magento-force': 'override',
            'other-key': 'value'
          }
        },
        metapackage: { name: 'product-community-edition' }
      });

      const result = await transformMagentoCommunityEditionProduct(
        composerConfig, instruction, metapackage, release
      );

      expect(result).not.toHaveProperty('extra');
    });
  });

  describe('Different Vendor Names', () => {
    test('should use custom vendor name for project package name', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs({
        instruction: { vendor: 'custom-vendor' }
      });

      const result = await transformMagentoCommunityEditionProject(
        composerConfig, instruction, metapackage, release
      );

      expect(result.name).toBe('custom-vendor/project-community-edition');
      expect(result.require).toHaveProperty('custom-vendor/product-community-edition');
    });

    test('should use custom vendor name for product package name', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs({
        instruction: { vendor: 'custom-vendor' },
        metapackage: { name: 'product-community-edition' }
      });

      const result = await transformMagentoCommunityEditionProduct(
        composerConfig, instruction, metapackage, release
      );

      expect(result.name).toBe('custom-vendor/product-community-edition');
      expect(result.require).toHaveProperty('custom-vendor/magento2-base');
    });

    test('should extract custom vendor replacements from replace section', async () => {
      const { composerConfig, instruction, metapackage, release } = createMockInputs({
        instruction: { vendor: 'custom-vendor' },
        composerConfig: {
          version: '2.4.6',
          require: {},
          replace: {
            'custom-vendor/module-custom': '1.0.0',
            'other/package': '2.0.0'
          }
        },
        metapackage: { name: 'product-community-edition' }
      });

      const result = await transformMagentoCommunityEditionProduct(
        composerConfig, instruction, metapackage, release
      );

      expect(result.require).toHaveProperty('custom-vendor/module-custom', '1.0.0');
      expect(result.require).not.toHaveProperty('other/package');
    });
  });
});
