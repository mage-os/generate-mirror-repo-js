const fs = require('fs');
const path = require('path');

// Mock fs module before requiring the module under test
jest.mock('fs');

const {
  getComposerPackagesConfig,
  comparePackages,
  displayDiffs
} = require('../../../src/integrity-test/validate-package-versions-match');

describe('validate-package-versions-match', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // getComposerPackagesConfig Tests
  // ============================================================================
  describe('getComposerPackagesConfig', () => {
    describe('happy path', () => {
      it('should return package info for valid vendor directory', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);

        // Mock composer.lock
        const composerLock = {
          packages: [
            { name: 'vendor/package-a', version: '1.0.0' }
          ],
          'packages-dev': []
        };

        // Mock directory structure
        fs.readdirSync.mockImplementation((dir, options) => {
          if (dir === vendorDir) {
            return [{ name: 'vendor', isDirectory: () => true }];
          }
          if (dir === path.join(vendorDir, 'vendor')) {
            return [{ name: 'package-a', isDirectory: () => true }];
          }
          return [];
        });

        // Mock file reading
        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return JSON.stringify(composerLock);
          }
          if (filePath.includes('composer.json')) {
            return JSON.stringify({
              name: 'vendor/package-a',
              require: { 'php': '^7.4' },
              'require-dev': { 'phpunit/phpunit': '^9.0' },
              suggest: { 'ext-json': 'For JSON support' },
              replace: { 'vendor/old-package': 'self.version' },
              conflict: { 'vendor/bad-package': '<1.0.0' }
            });
          }
          return '{}';
        });

        const result = getComposerPackagesConfig(vendorDir);

        expect(result['vendor/package-a@1.0.0']).toBeDefined();
        expect(result['vendor/package-a@1.0.0']).toMatchObject({
          version: '1.0.0',
          name: 'vendor/package-a',
          require: { 'php': '^7.4' },
          'require-dev': { 'phpunit/phpunit': '^9.0' },
          suggest: { 'ext-json': 'For JSON support' },
          replace: { 'vendor/old-package': 'self.version' },
          conflict: { 'vendor/bad-package': '<1.0.0' }
        });
      });

      it('should extract version from composer.lock packages', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);

        const composerLock = {
          packages: [
            { name: 'vendor/package-a', version: '2.5.3' }
          ],
          'packages-dev': []
        };

        fs.readdirSync.mockImplementation((dir, options) => {
          if (dir === vendorDir) {
            return [{ name: 'vendor', isDirectory: () => true }];
          }
          if (dir === path.join(vendorDir, 'vendor')) {
            return [{ name: 'package-a', isDirectory: () => true }];
          }
          return [];
        });

        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return JSON.stringify(composerLock);
          }
          if (filePath.includes('composer.json')) {
            return JSON.stringify({ name: 'vendor/package-a' });
          }
          return '{}';
        });

        const result = getComposerPackagesConfig(vendorDir);

        expect(result['vendor/package-a@2.5.3'].version).toBe('2.5.3');
      });

      it('should extract version from composer.lock packages-dev', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);

        const composerLock = {
          packages: [],
          'packages-dev': [
            { name: 'vendor/dev-package', version: '1.2.0' }
          ]
        };

        fs.readdirSync.mockImplementation((dir, options) => {
          if (dir === vendorDir) {
            return [{ name: 'vendor', isDirectory: () => true }];
          }
          if (dir === path.join(vendorDir, 'vendor')) {
            return [{ name: 'dev-package', isDirectory: () => true }];
          }
          return [];
        });

        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return JSON.stringify(composerLock);
          }
          if (filePath.includes('composer.json')) {
            return JSON.stringify({ name: 'vendor/dev-package' });
          }
          return '{}';
        });

        const result = getComposerPackagesConfig(vendorDir);

        expect(result['vendor/dev-package@1.2.0'].version).toBe('1.2.0');
      });

      it('should include all composer.json sections in result', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);

        const composerLock = {
          packages: [{ name: 'vendor/full-package', version: '1.0.0' }],
          'packages-dev': []
        };

        fs.readdirSync.mockImplementation((dir, options) => {
          if (dir === vendorDir) {
            return [{ name: 'vendor', isDirectory: () => true }];
          }
          if (dir === path.join(vendorDir, 'vendor')) {
            return [{ name: 'full-package', isDirectory: () => true }];
          }
          return [];
        });

        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return JSON.stringify(composerLock);
          }
          if (filePath.includes('composer.json')) {
            return JSON.stringify({
              name: 'vendor/full-package',
              require: { 'php': '^8.0' },
              'require-dev': { 'phpunit/phpunit': '^10.0' },
              suggest: { 'ext-redis': 'For Redis caching' },
              replace: { 'vendor/legacy': '*' },
              conflict: { 'vendor/incompatible': '<2.0' }
            });
          }
          return '{}';
        });

        const result = getComposerPackagesConfig(vendorDir);
        const pkg = result['vendor/full-package@1.0.0'];

        expect(pkg).toHaveProperty('path');
        expect(pkg).toHaveProperty('version');
        expect(pkg).toHaveProperty('name');
        expect(pkg).toHaveProperty('require');
        expect(pkg).toHaveProperty('require-dev');
        expect(pkg).toHaveProperty('suggest');
        expect(pkg).toHaveProperty('replace');
        expect(pkg).toHaveProperty('conflict');
      });
    });

    describe('edge cases', () => {
      it('should return empty object for empty vendor directory', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue([]);
        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return JSON.stringify({ packages: [], 'packages-dev': [] });
          }
          return '{}';
        });

        const result = getComposerPackagesConfig(vendorDir);

        expect(result).toEqual({});
      });

      it('should skip non-directory entries', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);

        const composerLock = {
          packages: [],
          'packages-dev': []
        };

        fs.readdirSync.mockImplementation((dir, options) => {
          if (dir === vendorDir) {
            return [
              { name: 'autoload.php', isDirectory: () => false },
              { name: 'composer', isDirectory: () => true }
            ];
          }
          if (dir === path.join(vendorDir, 'composer')) {
            return [{ name: 'installed.json', isDirectory: () => false }];
          }
          return [];
        });

        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return JSON.stringify(composerLock);
          }
          return '{}';
        });

        const result = getComposerPackagesConfig(vendorDir);

        expect(result).toEqual({});
      });

      it('should skip directories without composer.json', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockImplementation((checkPath) => {
          if (checkPath === vendorDir) return true;
          if (checkPath.includes('composer.json')) return false;
          return true;
        });

        const composerLock = {
          packages: [],
          'packages-dev': []
        };

        fs.readdirSync.mockImplementation((dir, options) => {
          if (dir === vendorDir) {
            return [{ name: 'vendor', isDirectory: () => true }];
          }
          if (dir === path.join(vendorDir, 'vendor')) {
            return [{ name: 'no-composer', isDirectory: () => true }];
          }
          return [];
        });

        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return JSON.stringify(composerLock);
          }
          return '{}';
        });

        const result = getComposerPackagesConfig(vendorDir);

        expect(result).toEqual({});
      });

      it('should handle packages with missing optional fields', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);

        const composerLock = {
          packages: [{ name: 'vendor/minimal-package', version: '1.0.0' }],
          'packages-dev': []
        };

        fs.readdirSync.mockImplementation((dir, options) => {
          if (dir === vendorDir) {
            return [{ name: 'vendor', isDirectory: () => true }];
          }
          if (dir === path.join(vendorDir, 'vendor')) {
            return [{ name: 'minimal-package', isDirectory: () => true }];
          }
          return [];
        });

        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return JSON.stringify(composerLock);
          }
          if (filePath.includes('composer.json')) {
            return JSON.stringify({
              name: 'vendor/minimal-package'
              // No require, require-dev, suggest, replace, conflict
            });
          }
          return '{}';
        });

        const result = getComposerPackagesConfig(vendorDir);
        const pkg = result['vendor/minimal-package@1.0.0'];

        expect(pkg.name).toBe('vendor/minimal-package');
        expect(pkg.version).toBe('1.0.0');
        expect(pkg.require).toBeUndefined();
        expect(pkg['require-dev']).toBeUndefined();
        expect(pkg.suggest).toBeUndefined();
        expect(pkg.replace).toBeUndefined();
        expect(pkg.conflict).toBeUndefined();
      });

      it('should handle package names with special characters', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);

        const composerLock = {
          packages: [{ name: 'vendor-name/package_with-special.chars', version: '1.0.0' }],
          'packages-dev': []
        };

        fs.readdirSync.mockImplementation((dir, options) => {
          if (dir === vendorDir) {
            return [{ name: 'vendor-name', isDirectory: () => true }];
          }
          if (dir === path.join(vendorDir, 'vendor-name')) {
            return [{ name: 'package_with-special.chars', isDirectory: () => true }];
          }
          return [];
        });

        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return JSON.stringify(composerLock);
          }
          if (filePath.includes('composer.json')) {
            return JSON.stringify({ name: 'vendor-name/package_with-special.chars' });
          }
          return '{}';
        });

        const result = getComposerPackagesConfig(vendorDir);

        expect(result['vendor-name/package_with-special.chars@1.0.0']).toBeDefined();
      });
    });

    describe('error handling', () => {
      it('should throw when vendor directory does not exist', () => {
        fs.existsSync.mockReturnValue(false);

        expect(() => getComposerPackagesConfig('/nonexistent/vendor'))
          .toThrow('Vendor directory not found');
      });

      it('should throw when composer.lock is missing', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockImplementation(() => {
          const error = new Error('ENOENT: no such file or directory');
          error.code = 'ENOENT';
          throw error;
        });

        expect(() => getComposerPackagesConfig(vendorDir))
          .toThrow(/Failed to read or parse composer.lock file/);
      });

      it('should throw when composer.lock is invalid JSON', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return 'invalid json {';
          }
          return '{}';
        });

        expect(() => getComposerPackagesConfig(vendorDir))
          .toThrow(/Failed to read or parse composer.lock file/);
      });

      it('should throw when composer.json is invalid JSON', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);

        const composerLock = {
          packages: [],
          'packages-dev': []
        };

        fs.readdirSync.mockImplementation((dir, options) => {
          if (dir === vendorDir) {
            return [{ name: 'vendor', isDirectory: () => true }];
          }
          if (dir === path.join(vendorDir, 'vendor')) {
            return [{ name: 'bad-json', isDirectory: () => true }];
          }
          return [];
        });

        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return JSON.stringify(composerLock);
          }
          if (filePath.includes('composer.json')) {
            return 'not valid json {{{';
          }
          return '{}';
        });

        expect(() => getComposerPackagesConfig(vendorDir))
          .toThrow(/Failed to read or parse/);
      });

      it('should throw when package not found in composer.lock', () => {
        const vendorDir = '/project/vendor';

        fs.existsSync.mockReturnValue(true);

        // Composer.lock has no packages
        const composerLock = {
          packages: [],
          'packages-dev': []
        };

        fs.readdirSync.mockImplementation((dir, options) => {
          if (dir === vendorDir) {
            return [{ name: 'vendor', isDirectory: () => true }];
          }
          if (dir === path.join(vendorDir, 'vendor')) {
            return [{ name: 'orphan-package', isDirectory: () => true }];
          }
          return [];
        });

        fs.readFileSync.mockImplementation((filePath) => {
          if (filePath.includes('composer.lock')) {
            return JSON.stringify(composerLock);
          }
          if (filePath.includes('composer.json')) {
            return JSON.stringify({ name: 'vendor/orphan-package' });
          }
          return '{}';
        });

        expect(() => getComposerPackagesConfig(vendorDir))
          .toThrow(/Package vendor\/orphan-package not found in composer.lock/);
      });
    });
  });

  // ============================================================================
  // comparePackages Tests
  // ============================================================================
  describe('comparePackages', () => {
    describe('happy path', () => {
      it('should return empty object when packages are identical', () => {
        const obj1 = {
          'vendor/package-a@1.0.0': {
            name: 'vendor/package-a',
            version: '1.0.0',
            require: { 'php': '^7.4' },
            'require-dev': { 'phpunit/phpunit': '^9.0' },
            suggest: { 'ext-json': 'For JSON support' },
            replace: { 'vendor/old': '*' }
          }
        };

        const obj2 = {
          'vendor/package-a@1.0.0': {
            name: 'vendor/package-a',
            version: '1.0.0',
            require: { 'php': '^7.4' },
            'require-dev': { 'phpunit/phpunit': '^9.0' },
            suggest: { 'ext-json': 'For JSON support' },
            replace: { 'vendor/old': '*' }
          }
        };

        const result = comparePackages(obj1, obj2);

        expect(result).toEqual({});
      });

      it('should detect differences in require section', () => {
        const obj1 = {
          'vendor/package@1.0.0': {
            require: { 'php': '^7.4' }
          }
        };

        const obj2 = {
          'vendor/package@1.0.0': {
            require: { 'php': '^8.0' }
          }
        };

        const result = comparePackages(obj1, obj2);

        expect(result['vendor/package@1.0.0']).toContainEqual({
          section: 'require',
          key: 'php',
          value1: '^7.4',
          value2: '^8.0'
        });
      });

      it('should detect differences in require-dev section', () => {
        const obj1 = {
          'vendor/package@1.0.0': {
            'require-dev': { 'phpunit/phpunit': '^9.0' }
          }
        };

        const obj2 = {
          'vendor/package@1.0.0': {
            'require-dev': { 'phpunit/phpunit': '^10.0' }
          }
        };

        const result = comparePackages(obj1, obj2);

        expect(result['vendor/package@1.0.0']).toContainEqual({
          section: 'require-dev',
          key: 'phpunit/phpunit',
          value1: '^9.0',
          value2: '^10.0'
        });
      });

      it('should detect differences in suggest section', () => {
        const obj1 = {
          'vendor/package@1.0.0': {
            suggest: { 'ext-redis': 'For caching' }
          }
        };

        const obj2 = {
          'vendor/package@1.0.0': {
            suggest: { 'ext-redis': 'For improved caching' }
          }
        };

        const result = comparePackages(obj1, obj2);

        expect(result['vendor/package@1.0.0']).toContainEqual({
          section: 'suggest',
          key: 'ext-redis',
          value1: 'For caching',
          value2: 'For improved caching'
        });
      });

      it('should detect differences in replace section', () => {
        const obj1 = {
          'vendor/package@1.0.0': {
            replace: { 'vendor/legacy': '1.0.0' }
          }
        };

        const obj2 = {
          'vendor/package@1.0.0': {
            replace: { 'vendor/legacy': '2.0.0' }
          }
        };

        const result = comparePackages(obj1, obj2);

        expect(result['vendor/package@1.0.0']).toContainEqual({
          section: 'replace',
          key: 'vendor/legacy',
          value1: '1.0.0',
          value2: '2.0.0'
        });
      });

      it('should only compare common packages', () => {
        const obj1 = {
          'vendor/package-a@1.0.0': {
            require: { 'php': '^7.4' }
          },
          'vendor/package-only-in-obj1@1.0.0': {
            require: { 'php': '^7.4' }
          }
        };

        const obj2 = {
          'vendor/package-a@1.0.0': {
            require: { 'php': '^7.4' }
          },
          'vendor/package-only-in-obj2@1.0.0': {
            require: { 'php': '^8.0' }
          }
        };

        const result = comparePackages(obj1, obj2);

        expect(result).toEqual({});
        expect(result).not.toHaveProperty('vendor/package-only-in-obj1@1.0.0');
        expect(result).not.toHaveProperty('vendor/package-only-in-obj2@1.0.0');
      });
    });

    describe('edge cases', () => {
      it('should return empty object when both inputs are empty', () => {
        const result = comparePackages({}, {});

        expect(result).toEqual({});
      });

      it('should return empty object when no common packages exist', () => {
        const obj1 = {
          'vendor/package-a@1.0.0': { require: { 'php': '^7.4' } }
        };

        const obj2 = {
          'vendor/package-b@1.0.0': { require: { 'php': '^8.0' } }
        };

        const result = comparePackages(obj1, obj2);

        expect(result).toEqual({});
      });

      it('should handle undefined section values', () => {
        const obj1 = {
          'vendor/package@1.0.0': {
            require: undefined,
            'require-dev': { 'phpunit/phpunit': '^9.0' }
          }
        };

        const obj2 = {
          'vendor/package@1.0.0': {
            require: { 'php': '^8.0' },
            'require-dev': undefined
          }
        };

        const result = comparePackages(obj1, obj2);

        expect(result['vendor/package@1.0.0']).toContainEqual({
          section: 'require',
          key: 'php',
          value1: undefined,
          value2: '^8.0'
        });

        expect(result['vendor/package@1.0.0']).toContainEqual({
          section: 'require-dev',
          key: 'phpunit/phpunit',
          value1: '^9.0',
          value2: undefined
        });
      });

      it('should detect when dependency is added (undefined to value)', () => {
        const obj1 = {
          'vendor/package@1.0.0': {
            require: {}
          }
        };

        const obj2 = {
          'vendor/package@1.0.0': {
            require: { 'new-dep/package': '^1.0' }
          }
        };

        const result = comparePackages(obj1, obj2);

        expect(result['vendor/package@1.0.0']).toContainEqual({
          section: 'require',
          key: 'new-dep/package',
          value1: undefined,
          value2: '^1.0'
        });
      });

      it('should detect when dependency is removed (value to undefined)', () => {
        const obj1 = {
          'vendor/package@1.0.0': {
            require: { 'old-dep/package': '^1.0' }
          }
        };

        const obj2 = {
          'vendor/package@1.0.0': {
            require: {}
          }
        };

        const result = comparePackages(obj1, obj2);

        expect(result['vendor/package@1.0.0']).toContainEqual({
          section: 'require',
          key: 'old-dep/package',
          value1: '^1.0',
          value2: undefined
        });
      });

      it('should detect multiple differences in same package', () => {
        const obj1 = {
          'vendor/package@1.0.0': {
            require: { 'php': '^7.4', 'ext-json': '*' },
            'require-dev': { 'phpunit/phpunit': '^9.0' },
            suggest: { 'ext-redis': 'For caching' }
          }
        };

        const obj2 = {
          'vendor/package@1.0.0': {
            require: { 'php': '^8.0', 'ext-mbstring': '*' },
            'require-dev': { 'phpunit/phpunit': '^10.0' },
            suggest: { 'ext-redis': 'For Redis caching' }
          }
        };

        const result = comparePackages(obj1, obj2);
        const diffs = result['vendor/package@1.0.0'];

        expect(diffs.length).toBeGreaterThan(1);

        // Check for php version diff
        expect(diffs).toContainEqual({
          section: 'require',
          key: 'php',
          value1: '^7.4',
          value2: '^8.0'
        });

        // Check for phpunit version diff
        expect(diffs).toContainEqual({
          section: 'require-dev',
          key: 'phpunit/phpunit',
          value1: '^9.0',
          value2: '^10.0'
        });
      });

      it('should handle packages with same name but different versions as different keys', () => {
        const obj1 = {
          'vendor/package@1.0.0': {
            require: { 'php': '^7.4' }
          }
        };

        const obj2 = {
          'vendor/package@2.0.0': {
            require: { 'php': '^8.0' }
          }
        };

        const result = comparePackages(obj1, obj2);

        // Different version keys means no common packages
        expect(result).toEqual({});
      });
    });
  });

  // ============================================================================
  // displayDiffs Tests
  // ============================================================================
  describe('displayDiffs', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should output formatted package differences', () => {
      const diffs = {
        'vendor/package@1.0.0': [
          { section: 'require', key: 'php', value1: '^7.4', value2: '^8.0' }
        ]
      };

      displayDiffs(diffs, 'mage-os', 'magento');

      expect(consoleSpy).toHaveBeenCalled();

      // Check that package name is output
      const allCalls = consoleSpy.mock.calls.flat().join('');
      expect(allCalls).toContain('vendor/package@1.0.0');
    });

    it('should handle empty diffs object', () => {
      const diffs = {};

      displayDiffs(diffs, 'origin', 'target');

      // No output for empty diffs (forEach on empty object keys)
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should display undefined values appropriately', () => {
      const diffs = {
        'vendor/package@1.0.0': [
          { section: 'require', key: 'new-dep', value1: undefined, value2: '^1.0' },
          { section: 'require', key: 'old-dep', value1: '^1.0', value2: undefined }
        ]
      };

      displayDiffs(diffs, 'origin', 'target');

      expect(consoleSpy).toHaveBeenCalled();

      const allCalls = consoleSpy.mock.calls.flat().join('');
      expect(allCalls).toContain('undefined');
    });

    it('should include origin and target names in output', () => {
      const diffs = {
        'vendor/package@1.0.0': [
          { section: 'require', key: 'php', value1: '^7.4', value2: '^8.0' }
        ]
      };

      displayDiffs(diffs, 'my-origin', 'my-target');

      const allCalls = consoleSpy.mock.calls.flat().join('');
      expect(allCalls).toContain('my-origin');
      expect(allCalls).toContain('my-target');
    });

    it('should output multiple packages with differences', () => {
      const diffs = {
        'vendor/package-a@1.0.0': [
          { section: 'require', key: 'php', value1: '^7.4', value2: '^8.0' }
        ],
        'vendor/package-b@2.0.0': [
          { section: 'suggest', key: 'ext-redis', value1: 'For caching', value2: 'Redis' }
        ]
      };

      displayDiffs(diffs, 'origin', 'target');

      const allCalls = consoleSpy.mock.calls.flat().join('');
      expect(allCalls).toContain('vendor/package-a@1.0.0');
      expect(allCalls).toContain('vendor/package-b@2.0.0');
    });
  });
});
