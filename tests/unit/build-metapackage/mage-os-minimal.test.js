const { transformMageOSMinimalProduct } = require('../../../src/build-metapackage/mage-os-minimal');

/**
 * Helper to create standard test inputs with optional overrides
 */
const createInputs = (overrides = {}) => ({
  composerConfig: {
    version: '2.4.6',
    name: 'mage-os/product-minimal',
    require: {},
    ...overrides.composerConfig
  },
  instruction: {
    vendor: 'mage-os',
    ...overrides.instruction
  },
  metapackage: {
    name: 'product-minimal',
    ...overrides.metapackage
  },
  release: {
    version: '2.4.6',
    ...overrides.release
  }
});

/**
 * Complete list of all PHP extensions in the preserve list
 */
const PHP_EXTENSIONS = [
  'ext-bcmath',
  'ext-ctype',
  'ext-curl',
  'ext-dom',
  'ext-ftp',
  'ext-gd',
  'ext-hash',
  'ext-iconv',
  'ext-intl',
  'ext-mbstring',
  'ext-openssl',
  'ext-pdo_mysql',
  'ext-simplexml',
  'ext-soap',
  'ext-sodium',
  'ext-xsl',
  'ext-zip'
];

/**
 * Third-party packages in the preserve list
 */
const THIRD_PARTY_PACKAGES = [
  'aligent/magento2-pci-4-compatibility',
  'colinmollenhour/cache-backend-file',
  'colinmollenhour/cache-backend-redis',
  'colinmollenhour/credis',
  'colinmollenhour/php-redis-session-abstract',
  'creatuity/magento2-interceptors',
  'guzzlehttp/guzzle',
  'pelago/emogrifier',
  'phpseclib/mcrypt_compat',
  'phpseclib/phpseclib',
  'psr/log',
  'ramsey/uuid',
  'tedivm/jshrink',
  'tubalmartin/cssmin',
  'wikimedia/less.php',
  'monolog/monolog'
];

/**
 * Laminas packages in the preserve list
 */
const LAMINAS_PACKAGES = [
  'laminas/laminas-captcha',
  'laminas/laminas-code',
  'laminas/laminas-di',
  'laminas/laminas-escaper',
  'laminas/laminas-eventmanager',
  'laminas/laminas-feed',
  'laminas/laminas-filter',
  'laminas/laminas-http',
  'laminas/laminas-i18n',
  'laminas/laminas-modulemanager',
  'laminas/laminas-mvc',
  'laminas/laminas-permissions-acl',
  'laminas/laminas-servicemanager',
  'laminas/laminas-soap',
  'laminas/laminas-stdlib',
  'laminas/laminas-uri',
  'laminas/laminas-validator'
];

/**
 * Symfony packages in the preserve list
 */
const SYMFONY_PACKAGES = [
  'symfony/console',
  'symfony/intl',
  'symfony/mailer',
  'symfony/mime',
  'symfony/process',
  'symfony/string'
];

/**
 * Vendor-prefixed package names (without vendor prefix)
 */
const VENDOR_PACKAGE_NAMES = [
  'composer',
  'composer-dependency-version-audit-plugin',
  'framework',
  'framework-amqp',
  'framework-bulk',
  'framework-message-queue',
  'magento-composer-installer',
  'magento-zf-db',
  'magento2-base',
  'module-admin-notification',
  'module-advanced-search',
  'module-async-config',
  'module-asynchronous-operations',
  'module-authorization',
  'module-backend',
  'module-bundle',
  'module-cache-invalidate',
  'module-captcha',
  'module-catalog',
  'module-catalog-import-export',
  'module-catalog-rule',
  'module-catalog-rule-configurable',
  'module-catalog-search',
  'module-catalog-url-rewrite',
  'module-checkout',
  'module-cms',
  'module-cms-url-rewrite',
  'module-config',
  'module-configurable-import-export',
  'module-configurable-product',
  'module-configurable-product-sales',
  'module-contact',
  'module-cookie',
  'module-cron',
  'module-currency-symbol',
  'module-customer',
  'module-deploy',
  'module-developer',
  'module-directory',
  'module-downloadable',
  'module-eav',
  'module-email',
  'module-encryption-key',
  'module-gift-message',
  'module-grouped-product',
  'module-import-export',
  'module-indexer',
  'module-integration',
  'module-jwt-framework-adapter',
  'module-jwt-user-token',
  'module-layered-navigation',
  'module-media-storage',
  'module-message-queue',
  'module-mysql-mq',
  'module-newsletter',
  'module-open-search',
  'module-order-cancellation',
  'module-order-cancellation-ui',
  'module-page-cache',
  'module-payment',
  'module-product-alert',
  'module-quote',
  'module-quote-bundle-options',
  'module-quote-configurable-options',
  'module-quote-downloadable-links',
  'module-remote-storage',
  'module-reports',
  'module-require-js',
  'module-review',
  'module-rule',
  'module-sales',
  'module-sales-rule',
  'module-sales-sequence',
  'module-search',
  'module-security',
  'module-shipping',
  'module-store',
  'module-swatches',
  'module-swatches-layered-navigation',
  'module-tax',
  'module-theme',
  'module-translation',
  'module-ui',
  'module-url-rewrite',
  'module-user',
  'module-variable',
  'module-webapi',
  'module-webapi-async',
  'module-webapi-security',
  'module-widget',
  'module-wishlist',
  'theme-adminhtml-backend',
  'theme-adminhtml-m137',
  'theme-frontend-blank',
  'theme-frontend-luma',
  'zend-cache',
  'zend-db',
  'zend-pdf'
];

/**
 * Generate vendor-prefixed packages for a given vendor
 */
const getVendorPackages = (vendor) =>
  VENDOR_PACKAGE_NAMES.map(name => `${vendor}/${name}`);

describe('mage-os-minimal', () => {
  describe('transformMageOSMinimalProduct', () => {

    // =====================================================
    // VERSION CHECKING TESTS
    // =====================================================
    describe('version checking', () => {
      test('should return composerConfig unchanged when version does not match release.version (historical release)', async () => {
        const originalRequire = { 'unknown/package': '1.0', 'another/package': '2.0' };
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.5', require: { ...originalRequire } },
          release: { version: '2.4.6' }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result).toEqual(composerConfig);
        expect(result.require['unknown/package']).toBe('1.0');
        expect(result.require['another/package']).toBe('2.0');
      });

      test('should process when version exactly matches', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: {
            version: '2.4.6',
            require: {
              'php': '~8.2.0',
              'some/unrelated-package': '1.0'
            }
          },
          release: { version: '2.4.6' }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require['php']).toBe('~8.2.0');
        expect(result.require['some/unrelated-package']).toBeUndefined();
      });

      test('should NOT process when versions are similar but not equal (patch version)', async () => {
        const originalRequire = { 'unknown/package': '1.0' };
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6-p1', require: { ...originalRequire } },
          release: { version: '2.4.6' }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result).toEqual(composerConfig);
        expect(result.require['unknown/package']).toBe('1.0');
      });

      test('should handle composerConfig with no version property', async () => {
        const originalRequire = { 'unknown/package': '1.0' };
        const composerConfig = { require: { ...originalRequire } };
        const { instruction, metapackage, release } = createInputs({
          release: { version: '2.4.6' }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        // undefined !== '2.4.6', so returns unchanged
        expect(result).toEqual(composerConfig);
        expect(result.require['unknown/package']).toBe('1.0');
      });
    });

    // =====================================================
    // PACKAGE PRESERVATION TESTS
    // =====================================================
    describe('package preservation', () => {
      test('should preserve PHP requirement', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: {
            version: '2.4.6',
            require: {
              'php': '~8.1.0||~8.2.0||~8.3.0',
              'some/unrelated-package': '1.0'
            }
          }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require['php']).toBe('~8.1.0||~8.2.0||~8.3.0');
        expect(result.require['some/unrelated-package']).toBeUndefined();
      });

      test('should preserve all required PHP extensions', async () => {
        const require = {};
        PHP_EXTENSIONS.forEach(ext => {
          require[ext] = '*';
        });
        require['ext-unknown'] = '*'; // This should be filtered out

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        // All PHP extensions should be preserved
        PHP_EXTENSIONS.forEach(ext => {
          expect(result.require[ext]).toBe('*');
        });
        // Unknown extension should be filtered out
        expect(result.require['ext-unknown']).toBeUndefined();
      });

      test('should preserve lib-libxml', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: {
            version: '2.4.6',
            require: {
              'lib-libxml': '^2.0',
              'lib-unknown': '^1.0'
            }
          }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require['lib-libxml']).toBe('^2.0');
        expect(result.require['lib-unknown']).toBeUndefined();
      });

      test('should preserve third-party libraries', async () => {
        const require = {};
        THIRD_PARTY_PACKAGES.forEach(pkg => {
          require[pkg] = '^1.0';
        });
        require['unknown/third-party'] = '^2.0';

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        THIRD_PARTY_PACKAGES.forEach(pkg => {
          expect(result.require[pkg]).toBe('^1.0');
        });
        expect(result.require['unknown/third-party']).toBeUndefined();
      });

      test('should preserve all Laminas packages in the list', async () => {
        const require = {};
        LAMINAS_PACKAGES.forEach(pkg => {
          require[pkg] = '^3.0';
        });
        require['laminas/laminas-unknown'] = '^1.0';

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        LAMINAS_PACKAGES.forEach(pkg => {
          expect(result.require[pkg]).toBe('^3.0');
        });
        expect(result.require['laminas/laminas-unknown']).toBeUndefined();
      });

      test('should preserve all Symfony packages in the list', async () => {
        const require = {};
        SYMFONY_PACKAGES.forEach(pkg => {
          require[pkg] = '^6.0';
        });
        require['symfony/unknown-component'] = '^5.0';

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        SYMFONY_PACKAGES.forEach(pkg => {
          expect(result.require[pkg]).toBe('^6.0');
        });
        expect(result.require['symfony/unknown-component']).toBeUndefined();
      });

      test('should preserve vendor-specific framework packages', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: {
            version: '2.4.6',
            require: {
              'mage-os/framework': '1.0.0',
              'mage-os/module-backend': '1.0.0',
              'mage-os/module-catalog': '1.0.0'
            }
          }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require['mage-os/framework']).toBe('1.0.0');
        expect(result.require['mage-os/module-backend']).toBe('1.0.0');
        expect(result.require['mage-os/module-catalog']).toBe('1.0.0');
      });

      test('should preserve all core modules in the preserve list', async () => {
        const vendor = 'mage-os';
        const vendorPackages = getVendorPackages(vendor);
        const require = {};
        vendorPackages.forEach(pkg => {
          require[pkg] = '1.0.0';
        });

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require },
          instruction: { vendor }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        // All vendor packages should be preserved
        vendorPackages.forEach(pkg => {
          expect(result.require[pkg]).toBe('1.0.0');
        });
      });
    });

    // =====================================================
    // PACKAGE FILTERING TESTS
    // =====================================================
    describe('package filtering', () => {
      test('should filter out packages NOT in preserve list', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: {
            version: '2.4.6',
            require: {
              'php': '~8.2.0',
              'mage-os/module-backend': '1.0',
              'mage-os/module-adobe-ims': '1.0',  // NOT in preserve list
              'some-vendor/some-package': '2.0'   // NOT in preserve list
            }
          }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require['php']).toBe('~8.2.0');
        expect(result.require['mage-os/module-backend']).toBe('1.0');
        expect(result.require['mage-os/module-adobe-ims']).toBeUndefined();
        expect(result.require['some-vendor/some-package']).toBeUndefined();
      });

      test('should work with different vendor names', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: {
            version: '2.4.6',
            require: {
              'custom-vendor/framework': '1.0',
              'custom-vendor/module-backend': '1.0',
              'custom-vendor/module-adobe-ims': '1.0'  // NOT in preserve list
            }
          },
          instruction: { vendor: 'custom-vendor' }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require['custom-vendor/framework']).toBe('1.0');
        expect(result.require['custom-vendor/module-backend']).toBe('1.0');
        expect(result.require['custom-vendor/module-adobe-ims']).toBeUndefined();
      });

      test('should not include packages from other vendors when using mage-os', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: {
            version: '2.4.6',
            require: {
              'mage-os/framework': '1.0',
              'magento/framework': '1.0',  // Different vendor, should be filtered
              'other-vendor/framework': '1.0'  // Different vendor, should be filtered
            }
          },
          instruction: { vendor: 'mage-os' }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require['mage-os/framework']).toBe('1.0');
        expect(result.require['magento/framework']).toBeUndefined();
        expect(result.require['other-vendor/framework']).toBeUndefined();
      });
    });

    // =====================================================
    // EDGE CASES
    // =====================================================
    describe('edge cases', () => {
      test('should handle empty require section', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require: {} }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require).toEqual({});
      });

      test('should handle undefined require section', async () => {
        const composerConfig = { version: '2.4.6' };
        delete composerConfig.require;
        const { instruction, metapackage, release } = createInputs();

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require).toEqual({});
      });

      test('should handle null require section', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require: null }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.require).toEqual({});
      });

      test('should not modify other composerConfig properties', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: {
            version: '2.4.6',
            name: 'mage-os/product-minimal',
            description: 'Minimal Edition',
            type: 'metapackage',
            license: 'OSL-3.0',
            extra: { someKey: 'someValue' },
            require: {
              'php': '~8.2.0',
              'unknown/package': '1.0'
            }
          }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result.name).toBe('mage-os/product-minimal');
        expect(result.description).toBe('Minimal Edition');
        expect(result.type).toBe('metapackage');
        expect(result.license).toBe('OSL-3.0');
        expect(result.extra).toEqual({ someKey: 'someValue' });
        expect(result.require['php']).toBe('~8.2.0');
        expect(result.require['unknown/package']).toBeUndefined();
      });

      test('should handle case sensitivity correctly (package names are case-sensitive)', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: {
            version: '2.4.6',
            require: {
              'PHP': '~8.2.0',        // wrong case
              'Php': '~8.2.0',        // wrong case
              'php': '~8.2.0',        // correct case
              'EXT-BCMATH': '*',      // wrong case
              'ext-bcmath': '*'       // correct case
            }
          }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        // Correct case should be preserved
        expect(result.require['php']).toBe('~8.2.0');
        expect(result.require['ext-bcmath']).toBe('*');
        // Wrong case should be filtered out
        expect(result.require['PHP']).toBeUndefined();
        expect(result.require['Php']).toBeUndefined();
        expect(result.require['EXT-BCMATH']).toBeUndefined();
      });
    });

    // =====================================================
    // BOUNDARY TESTS
    // =====================================================
    describe('boundary tests', () => {
      test('should preserve exactly the packages in the preserve list, no more, no less', async () => {
        const vendor = 'mage-os';

        // Build a require object with ALL packages from preserve list plus extras
        const allPreservedPackages = [
          'php',
          ...PHP_EXTENSIONS,
          'lib-libxml',
          ...THIRD_PARTY_PACKAGES,
          ...LAMINAS_PACKAGES,
          ...SYMFONY_PACKAGES,
          ...getVendorPackages(vendor)
        ];

        const extraPackages = [
          'unknown/package-1',
          'unknown/package-2',
          `${vendor}/module-adobe-ims`,
          `${vendor}/module-google-optimizer`,
          `${vendor}/module-inventory`,
          'laminas/laminas-unknown',
          'symfony/unknown-bundle'
        ];

        const require = {};
        allPreservedPackages.forEach(pkg => {
          require[pkg] = '1.0.0';
        });
        extraPackages.forEach(pkg => {
          require[pkg] = '2.0.0';
        });

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require },
          instruction: { vendor }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        // All preserved packages should be present
        allPreservedPackages.forEach(pkg => {
          expect(result.require[pkg]).toBe('1.0.0');
        });

        // Extra packages should be filtered out
        extraPackages.forEach(pkg => {
          expect(result.require[pkg]).toBeUndefined();
        });

        // Verify the exact count
        expect(Object.keys(result.require).length).toBe(allPreservedPackages.length);
      });

      test('should handle large require sections efficiently', async () => {
        const require = {};

        // Add 1000 random packages
        for (let i = 0; i < 1000; i++) {
          require[`vendor-${i}/package-${i}`] = `${i}.0.0`;
        }

        // Add some preserved packages
        require['php'] = '~8.2.0';
        require['mage-os/framework'] = '1.0.0';
        require['guzzlehttp/guzzle'] = '^7.0';

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require }
        });

        const startTime = Date.now();
        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );
        const endTime = Date.now();

        // Should complete quickly (under 100ms for 1000 packages)
        expect(endTime - startTime).toBeLessThan(100);

        // Preserved packages should be present
        expect(result.require['php']).toBe('~8.2.0');
        expect(result.require['mage-os/framework']).toBe('1.0.0');
        expect(result.require['guzzlehttp/guzzle']).toBe('^7.0');

        // Random packages should be filtered
        expect(result.require['vendor-0/package-0']).toBeUndefined();
        expect(result.require['vendor-999/package-999']).toBeUndefined();
      });
    });

    // =====================================================
    // SPECIFIC MODULE PRESERVATION TESTS
    // =====================================================
    describe('specific module preservation', () => {
      test('should preserve core commerce modules', async () => {
        const coreModules = [
          'mage-os/module-catalog',
          'mage-os/module-checkout',
          'mage-os/module-customer',
          'mage-os/module-sales',
          'mage-os/module-payment',
          'mage-os/module-shipping',
          'mage-os/module-quote'
        ];

        const require = {};
        coreModules.forEach(mod => {
          require[mod] = '1.0.0';
        });

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        coreModules.forEach(mod => {
          expect(result.require[mod]).toBe('1.0.0');
        });
      });

      test('should preserve theme packages', async () => {
        const themes = [
          'mage-os/theme-adminhtml-backend',
          'mage-os/theme-adminhtml-m137',
          'mage-os/theme-frontend-blank',
          'mage-os/theme-frontend-luma'
        ];

        const require = {};
        themes.forEach(theme => {
          require[theme] = '1.0.0';
        });
        // Add a theme NOT in preserve list
        require['mage-os/theme-custom'] = '1.0.0';

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        themes.forEach(theme => {
          expect(result.require[theme]).toBe('1.0.0');
        });
        expect(result.require['mage-os/theme-custom']).toBeUndefined();
      });

      test('should preserve zend packages', async () => {
        const zendPackages = [
          'mage-os/zend-cache',
          'mage-os/zend-db',
          'mage-os/zend-pdf'
        ];

        const require = {};
        zendPackages.forEach(pkg => {
          require[pkg] = '1.0.0';
        });

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        zendPackages.forEach(pkg => {
          expect(result.require[pkg]).toBe('1.0.0');
        });
      });

      test('should preserve framework packages', async () => {
        const frameworkPackages = [
          'mage-os/framework',
          'mage-os/framework-amqp',
          'mage-os/framework-bulk',
          'mage-os/framework-message-queue'
        ];

        const require = {};
        frameworkPackages.forEach(pkg => {
          require[pkg] = '1.0.0';
        });

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: { version: '2.4.6', require }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        frameworkPackages.forEach(pkg => {
          expect(result.require[pkg]).toBe('1.0.0');
        });
      });
    });

    // =====================================================
    // RETURN VALUE TESTS
    // =====================================================
    describe('return value', () => {
      test('should return the same composerConfig object (mutated)', async () => {
        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: {
            version: '2.4.6',
            require: {
              'php': '~8.2.0',
              'unknown/package': '1.0'
            }
          }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        // The function returns the same object reference (mutated)
        expect(result).toBe(composerConfig);
      });

      test('should return a Promise', () => {
        const { composerConfig, instruction, metapackage, release } = createInputs();

        const result = transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        expect(result).toBeInstanceOf(Promise);
      });
    });

    // =====================================================
    // INTEGRATION-LIKE TESTS
    // =====================================================
    describe('realistic scenarios', () => {
      test('should filter a realistic product-community-edition require list', async () => {
        // Simulate a realistic Magento/Mage-OS product-community-edition composer.json
        const require = {
          'php': '~8.1.0||~8.2.0||~8.3.0',
          'ext-bcmath': '*',
          'ext-ctype': '*',
          'ext-curl': '*',
          'ext-dom': '*',
          'ext-gd': '*',
          'ext-hash': '*',
          'ext-iconv': '*',
          'ext-intl': '*',
          'ext-mbstring': '*',
          'ext-openssl': '*',
          'ext-pdo_mysql': '*',
          'ext-simplexml': '*',
          'ext-soap': '*',
          'ext-sodium': '*',
          'ext-xsl': '*',
          'ext-zip': '*',
          'lib-libxml': '*',
          // Third-party (preserved)
          'guzzlehttp/guzzle': '^7.0',
          'monolog/monolog': '^2.0',
          'symfony/console': '^6.0',
          // Vendor modules (preserved)
          'mage-os/framework': '103.0.0',
          'mage-os/module-backend': '102.0.0',
          'mage-os/module-catalog': '104.0.0',
          'mage-os/module-checkout': '100.4.0',
          'mage-os/module-customer': '103.0.0',
          'mage-os/module-sales': '103.0.0',
          // Vendor modules (NOT preserved - should be filtered)
          'mage-os/module-adobe-ims': '2.0.0',
          'mage-os/module-adobe-ims-api': '2.0.0',
          'mage-os/module-google-optimizer': '100.0.0',
          'mage-os/module-inventory': '1.0.0',
          'mage-os/module-two-factor-auth': '1.0.0',
          'mage-os/module-page-builder': '1.0.0',
          // Other non-preserved
          'klarna/module-core': '1.0.0',
          'paypal/module-braintree': '1.0.0'
        };

        const { composerConfig, instruction, metapackage, release } = createInputs({
          composerConfig: {
            version: '2.4.6',
            name: 'mage-os/product-community-edition',
            type: 'metapackage',
            require
          }
        });

        const result = await transformMageOSMinimalProduct(
          composerConfig, instruction, metapackage, release
        );

        // Preserved packages
        expect(result.require['php']).toBe('~8.1.0||~8.2.0||~8.3.0');
        expect(result.require['ext-bcmath']).toBe('*');
        expect(result.require['guzzlehttp/guzzle']).toBe('^7.0');
        expect(result.require['mage-os/framework']).toBe('103.0.0');
        expect(result.require['mage-os/module-catalog']).toBe('104.0.0');

        // Filtered packages
        expect(result.require['mage-os/module-adobe-ims']).toBeUndefined();
        expect(result.require['mage-os/module-adobe-ims-api']).toBeUndefined();
        expect(result.require['mage-os/module-google-optimizer']).toBeUndefined();
        expect(result.require['mage-os/module-inventory']).toBeUndefined();
        expect(result.require['mage-os/module-two-factor-auth']).toBeUndefined();
        expect(result.require['mage-os/module-page-builder']).toBeUndefined();
        expect(result.require['klarna/module-core']).toBeUndefined();
        expect(result.require['paypal/module-braintree']).toBeUndefined();
      });
    });
  });
});
