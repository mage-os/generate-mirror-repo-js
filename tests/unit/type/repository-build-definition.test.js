'use strict';

const repositoryBuildDefinition = require('../../../src/type/repository-build-definition');
const packageDefinition = require('../../../src/type/package-definition');
const packageReplacement = require('../../../src/type/package-replacement');
const extraRefToRelease = require('../../../src/type/extra-ref-to-release');
const metapackageDefinition = require('../../../src/type/metapackage-definition');

describe('repositoryBuildDefinition', () => {
  describe('constructor', () => {
    describe('default values', () => {
      it('should use default vendor when not provided', () => {
        const def = new repositoryBuildDefinition({});
        expect(def.vendor).toBe('magento');
      });

      it('should use null for repoUrl when not provided', () => {
        const def = new repositoryBuildDefinition({});
        expect(def.repoUrl).toBeNull();
      });

      it('should use null for ref when not provided', () => {
        const def = new repositoryBuildDefinition({});
        expect(def.ref).toBeNull();
      });

      it('should use null for fromTag when not provided', () => {
        const def = new repositoryBuildDefinition({});
        expect(def.fromTag).toBeNull();
      });

      it('should initialize empty arrays for package properties', () => {
        const def = new repositoryBuildDefinition({});
        expect(def.packageDirs).toEqual([]);
        expect(def.packageIndividual).toEqual([]);
        expect(def.packageMetaFromDirs).toEqual([]);
        expect(def.extraMetapackages).toEqual([]);
        expect(def.packageReplacements).toEqual([]);
        expect(def.extraRefToRelease).toEqual([]);
      });

      it('should initialize empty objects for map properties', () => {
        const def = new repositoryBuildDefinition({});
        expect(def.skipTags).toEqual({});
        expect(def.transform).toEqual({});
        expect(def.fixVersions).toEqual({});
      });
    });

    describe('provided values', () => {
      it('should use provided repoUrl', () => {
        const def = new repositoryBuildDefinition({ repoUrl: 'https://github.com/test/repo' });
        expect(def.repoUrl).toBe('https://github.com/test/repo');
      });

      it('should use provided vendor', () => {
        const def = new repositoryBuildDefinition({ vendor: 'mage-os' });
        expect(def.vendor).toBe('mage-os');
      });

      it('should use provided ref', () => {
        const def = new repositoryBuildDefinition({ ref: '2.4-develop' });
        expect(def.ref).toBe('2.4-develop');
      });

      it('should use provided fromTag', () => {
        const def = new repositoryBuildDefinition({ fromTag: '2.4.0' });
        expect(def.fromTag).toBe('2.4.0');
      });

      it('should use provided skipTags', () => {
        const skipTags = { '2.4.0-alpha': true, '2.4.0-beta': true };
        const def = new repositoryBuildDefinition({ skipTags });
        expect(def.skipTags).toEqual(skipTags);
      });

      it('should use provided transform', () => {
        const transformFn = jest.fn();
        const transform = { 'magento/product-community-edition': [transformFn] };
        const def = new repositoryBuildDefinition({ transform });
        expect(def.transform).toEqual(transform);
      });

      it('should preserve transform functions correctly', () => {
        const transformFn = jest.fn(() => 'transformed');
        const transform = { 'test/package': [transformFn] };
        const def = new repositoryBuildDefinition({ transform });

        expect(def.transform['test/package'][0]).toBe(transformFn);
        expect(def.transform['test/package'][0]()).toBe('transformed');
      });

      it('should use provided fixVersions', () => {
        const fixVersions = { '2.4.0': { 'magento/module-bundle': '100.4.0' } };
        const def = new repositoryBuildDefinition({ fixVersions });
        expect(def.fixVersions).toEqual(fixVersions);
      });

      it('should initialize packageDirs as packageDefinition instances', () => {
        const def = new repositoryBuildDefinition({
          packageDirs: [{ dir: 'app/code' }]
        });
        expect(def.packageDirs).toHaveLength(1);
        expect(def.packageDirs[0]).toBeInstanceOf(packageDefinition);
      });

      it('should initialize packageIndividual as packageDefinition instances', () => {
        const def = new repositoryBuildDefinition({
          packageIndividual: [{ dir: 'lib/internal/Magento/Framework' }]
        });
        expect(def.packageIndividual).toHaveLength(1);
        expect(def.packageIndividual[0]).toBeInstanceOf(packageDefinition);
      });

      it('should initialize packageMetaFromDirs as packageDefinition instances', () => {
        const def = new repositoryBuildDefinition({
          packageMetaFromDirs: [{ dir: 'app/code/Magento/Bundle' }]
        });
        expect(def.packageMetaFromDirs).toHaveLength(1);
        expect(def.packageMetaFromDirs[0]).toBeInstanceOf(packageDefinition);
      });

      it('should initialize packageReplacements as packageReplacement instances', () => {
        const def = new repositoryBuildDefinition({
          packageReplacements: [{ name: 'old/package', version: '1.0.0', files: ['composer.json'] }]
        });
        expect(def.packageReplacements).toHaveLength(1);
        expect(def.packageReplacements[0]).toBeInstanceOf(packageReplacement);
      });

      it('should initialize extraRefToRelease as extraRefToRelease instances', () => {
        const def = new repositoryBuildDefinition({
          extraRefToRelease: [{ ref: 'feature-branch', release: '1.0.0' }]
        });
        expect(def.extraRefToRelease).toHaveLength(1);
        expect(def.extraRefToRelease[0]).toBeInstanceOf(extraRefToRelease);
      });

      it('should initialize extraMetapackages as metapackageDefinition instances', () => {
        const def = new repositoryBuildDefinition({
          extraMetapackages: [{ name: 'product-community-edition', type: 'metapackage' }]
        });
        expect(def.extraMetapackages).toHaveLength(1);
        expect(def.extraMetapackages[0]).toBeInstanceOf(metapackageDefinition);
      });
    });

    describe('partial options (mix of provided and default values)', () => {
      it('should use provided values and defaults for missing properties', () => {
        const def = new repositoryBuildDefinition({
          repoUrl: 'https://github.com/test/repo',
          vendor: 'mage-os'
        });

        expect(def.repoUrl).toBe('https://github.com/test/repo');
        expect(def.vendor).toBe('mage-os');
        expect(def.ref).toBeNull();
        expect(def.fromTag).toBeNull();
        expect(def.skipTags).toEqual({});
        expect(def.packageDirs).toEqual([]);
      });
    });

    describe('edge cases', () => {
      it('should ignore extra properties in options that are not part of the class', () => {
        const def = new repositoryBuildDefinition({
          repoUrl: 'https://github.com/test/repo',
          unknownProperty: 'should be ignored',
          anotherUnknown: { nested: true }
        });

        expect(def.repoUrl).toBe('https://github.com/test/repo');
        expect(def.unknownProperty).toBeUndefined();
        expect(def.anotherUnknown).toBeUndefined();
      });

      it('should not throw for missing options (uses defaults)', () => {
        expect(() => {
          new repositoryBuildDefinition({});
        }).not.toThrow();
      });
    });

    describe('fully populated options', () => {
      it('should correctly assign all properties when fully populated', () => {
        const transformFn = jest.fn();
        const options = {
          repoUrl: 'https://github.com/magento/magento2',
          vendor: 'mage-os',
          ref: '2.4-develop',
          fromTag: '2.4.0',
          skipTags: { '2.4.0-alpha': true },
          transform: { 'magento/product-community-edition': [transformFn] },
          fixVersions: { '2.4.0': { 'magento/module-bundle': '100.4.0' } },
          packageDirs: [{ dir: 'app/code/Magento', label: 'Modules' }],
          packageIndividual: [{ dir: 'lib/internal/Magento/Framework', label: 'Framework' }],
          packageMetaFromDirs: [{ dir: 'app/code/Magento/Bundle', label: 'Bundle' }],
          packageReplacements: [{ name: 'old/package', version: '1.0.0', files: ['composer.json'] }],
          extraRefToRelease: [{ ref: 'feature-branch', release: '1.0.0' }],
          extraMetapackages: [{ name: 'product-community-edition', type: 'metapackage' }]
        };

        const def = new repositoryBuildDefinition(options);

        expect(def.repoUrl).toBe('https://github.com/magento/magento2');
        expect(def.vendor).toBe('mage-os');
        expect(def.ref).toBe('2.4-develop');
        expect(def.fromTag).toBe('2.4.0');
        expect(def.skipTags).toEqual({ '2.4.0-alpha': true });
        expect(def.transform).toEqual({ 'magento/product-community-edition': [transformFn] });
        expect(def.fixVersions).toEqual({ '2.4.0': { 'magento/module-bundle': '100.4.0' } });
        expect(def.packageDirs).toHaveLength(1);
        expect(def.packageIndividual).toHaveLength(1);
        expect(def.packageMetaFromDirs).toHaveLength(1);
        expect(def.packageReplacements).toHaveLength(1);
        expect(def.extraRefToRelease).toHaveLength(1);
        expect(def.extraMetapackages).toHaveLength(1);
      });
    });
  });

  describe('initPackageDefinitions', () => {
    let def;

    beforeEach(() => {
      def = new repositoryBuildDefinition({});
    });

    it('should return empty array for empty input', () => {
      const result = def.initPackageDefinitions([]);
      expect(result).toEqual([]);
    });

    it('should create packageDefinition instances for each element', () => {
      const result = def.initPackageDefinitions([
        { dir: 'app/code/Module1' },
        { dir: 'app/code/Module2' }
      ]);

      expect(result).toHaveLength(2);
      result.forEach(item => {
        expect(item).toBeInstanceOf(packageDefinition);
      });
    });

    it('should preserve element order', () => {
      const result = def.initPackageDefinitions([
        { dir: 'first' },
        { dir: 'second' },
        { dir: 'third' }
      ]);

      expect(result[0].dir).toBe('first');
      expect(result[1].dir).toBe('second');
      expect(result[2].dir).toBe('third');
    });

    it('should handle single element array', () => {
      const result = def.initPackageDefinitions([
        { dir: 'only-one', label: 'Single Package' }
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(packageDefinition);
      expect(result[0].dir).toBe('only-one');
      expect(result[0].label).toBe('Single Package');
    });

    it('should handle large arrays', () => {
      const packages = [];
      for (let i = 0; i < 100; i++) {
        packages.push({ dir: `app/code/Module${i}` });
      }

      const result = def.initPackageDefinitions(packages);

      expect(result).toHaveLength(100);
      result.forEach((item, index) => {
        expect(item).toBeInstanceOf(packageDefinition);
        expect(item.dir).toBe(`app/code/Module${index}`);
      });
    });

    it('should preserve all packageDefinition properties', () => {
      const result = def.initPackageDefinitions([
        {
          dir: 'app/code/Test',
          label: 'Test Label',
          composerJsonPath: 'composer.json',
          emptyDirsToAdd: ['var', 'tmp'],
          excludes: ['test/', 'docs/']
        }
      ]);

      expect(result[0].dir).toBe('app/code/Test');
      expect(result[0].label).toBe('Test Label');
      expect(result[0].composerJsonPath).toBe('composer.json');
      expect(result[0].emptyDirsToAdd).toEqual(['var', 'tmp']);
      expect(result[0].excludes).toEqual(['test/', 'docs/']);
    });
  });

  describe('initPackageReplacements', () => {
    let def;

    beforeEach(() => {
      def = new repositoryBuildDefinition({});
    });

    it('should return empty array for empty input', () => {
      const result = def.initPackageReplacements([]);
      expect(result).toEqual([]);
    });

    it('should create packageReplacement instances', () => {
      const result = def.initPackageReplacements([
        { name: 'old/package', version: '1.0.0', files: ['composer.json'] }
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(packageReplacement);
    });

    it('should preserve element order', () => {
      const result = def.initPackageReplacements([
        { name: 'first/package', version: '1.0.0', files: [] },
        { name: 'second/package', version: '2.0.0', files: [] },
        { name: 'third/package', version: '3.0.0', files: [] }
      ]);

      expect(result[0].name).toBe('first/package');
      expect(result[1].name).toBe('second/package');
      expect(result[2].name).toBe('third/package');
    });

    it('should preserve all packageReplacement properties', () => {
      const result = def.initPackageReplacements([
        {
          name: 'vendor/package',
          version: '1.2.3',
          files: ['composer.json', 'registration.php']
        }
      ]);

      expect(result[0].name).toBe('vendor/package');
      expect(result[0].version).toBe('1.2.3');
      expect(result[0].files).toEqual(['composer.json', 'registration.php']);
    });

    it('should handle multiple replacements', () => {
      const result = def.initPackageReplacements([
        { name: 'package1', version: '1.0.0', files: ['file1.php'] },
        { name: 'package2', version: '2.0.0', files: ['file2.php', 'file3.php'] }
      ]);

      expect(result).toHaveLength(2);
      result.forEach(item => {
        expect(item).toBeInstanceOf(packageReplacement);
      });
    });
  });

  describe('initExtraRefsToRelease', () => {
    let def;

    beforeEach(() => {
      def = new repositoryBuildDefinition({});
    });

    it('should return empty array for empty input', () => {
      const result = def.initExtraRefsToRelease([]);
      expect(result).toEqual([]);
    });

    it('should create extraRefToRelease instances', () => {
      const result = def.initExtraRefsToRelease([
        { ref: 'feature-branch', release: '1.0.0' }
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(extraRefToRelease);
    });

    it('should preserve element order', () => {
      const result = def.initExtraRefsToRelease([
        { ref: 'first-ref', release: '1.0.0' },
        { ref: 'second-ref', release: '2.0.0' },
        { ref: 'third-ref', release: '3.0.0' }
      ]);

      expect(result[0].ref).toBe('first-ref');
      expect(result[1].ref).toBe('second-ref');
      expect(result[2].ref).toBe('third-ref');
    });

    it('should preserve all extraRefToRelease properties', () => {
      const result = def.initExtraRefsToRelease([
        {
          ref: 'abc123',
          release: '1.0.0-dev',
          details: 'Development build for testing'
        }
      ]);

      expect(result[0].ref).toBe('abc123');
      expect(result[0].release).toBe('1.0.0-dev');
      expect(result[0].details).toBe('Development build for testing');
    });

    it('should handle commit hashes as refs', () => {
      const result = def.initExtraRefsToRelease([
        { ref: 'a1b2c3d4e5f6', release: '1.0.0' }
      ]);

      expect(result[0].ref).toBe('a1b2c3d4e5f6');
    });

    it('should handle branch names as refs', () => {
      const result = def.initExtraRefsToRelease([
        { ref: '2.4-develop', release: '2.4.99' }
      ]);

      expect(result[0].ref).toBe('2.4-develop');
    });
  });

  describe('initMetapackageDefinitions', () => {
    let def;

    beforeEach(() => {
      def = new repositoryBuildDefinition({});
    });

    it('should return empty array for empty input', () => {
      const result = def.initMetapackageDefinitions([]);
      expect(result).toEqual([]);
    });

    it('should create metapackageDefinition instances', () => {
      const result = def.initMetapackageDefinitions([
        { name: 'product-community-edition', type: 'metapackage' }
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(metapackageDefinition);
    });

    it('should preserve element order', () => {
      const result = def.initMetapackageDefinitions([
        { name: 'first-meta' },
        { name: 'second-meta' },
        { name: 'third-meta' }
      ]);

      expect(result[0].name).toBe('first-meta');
      expect(result[1].name).toBe('second-meta');
      expect(result[2].name).toBe('third-meta');
    });

    it('should preserve all metapackageDefinition properties', () => {
      const transformFn = jest.fn();
      const result = def.initMetapackageDefinitions([
        {
          name: 'mage-os/product-community-edition',
          type: 'metapackage',
          description: 'Mage-OS Community Edition Product',
          transform: [transformFn],
          fromTag: '2.4.0'
        }
      ]);

      expect(result[0].name).toBe('mage-os/product-community-edition');
      expect(result[0].type).toBe('metapackage');
      expect(result[0].description).toBe('Mage-OS Community Edition Product');
      expect(result[0].transform).toContain(transformFn);
      expect(result[0].fromTag).toBe('2.4.0');
    });

    it('should handle metapackage with transform functions', () => {
      const transform1 = jest.fn(() => 'result1');
      const transform2 = jest.fn(() => 'result2');

      const result = def.initMetapackageDefinitions([
        { name: 'test-meta', transform: [transform1, transform2] }
      ]);

      expect(result[0].transform).toHaveLength(2);
      expect(result[0].transform[0]()).toBe('result1');
      expect(result[0].transform[1]()).toBe('result2');
    });
  });

  describe('integration tests', () => {
    it('should create a complete build definition with realistic data', () => {
      const transformFn = jest.fn();
      const def = new repositoryBuildDefinition({
        repoUrl: 'https://github.com/magento/magento2',
        vendor: 'magento',
        ref: '2.4-develop',
        fromTag: '2.4.0',
        skipTags: {
          '2.4.0-alpha': true,
          '2.4.0-beta1': true
        },
        transform: {
          'magento/product-community-edition': [transformFn]
        },
        fixVersions: {
          '2.4.0': { 'magento/module-bundle': '100.4.0' }
        },
        packageDirs: [
          { dir: 'app/code/Magento', label: 'Magento Modules' }
        ],
        packageIndividual: [
          { dir: 'lib/internal/Magento/Framework', label: 'Magento Framework' }
        ],
        packageMetaFromDirs: [
          { dir: 'app/code/Magento/Bundle', label: 'Bundle Metapackage' }
        ],
        packageReplacements: [
          { name: 'magento/module-catalog', version: '104.0.0', files: ['composer.json'] }
        ],
        extraRefToRelease: [
          { ref: 'hotfix-branch', release: '2.4.0-p1', details: 'Security patch' }
        ],
        extraMetapackages: [
          { name: 'magento/product-enterprise-edition', type: 'metapackage', description: 'Enterprise Edition' }
        ]
      });

      // Verify all properties are set correctly
      expect(def.repoUrl).toBe('https://github.com/magento/magento2');
      expect(def.vendor).toBe('magento');
      expect(def.ref).toBe('2.4-develop');
      expect(def.fromTag).toBe('2.4.0');

      // Verify arrays contain proper instances
      expect(def.packageDirs[0]).toBeInstanceOf(packageDefinition);
      expect(def.packageDirs[0].dir).toBe('app/code/Magento');

      expect(def.packageIndividual[0]).toBeInstanceOf(packageDefinition);
      expect(def.packageIndividual[0].label).toBe('Magento Framework');

      expect(def.packageMetaFromDirs[0]).toBeInstanceOf(packageDefinition);

      expect(def.packageReplacements[0]).toBeInstanceOf(packageReplacement);
      expect(def.packageReplacements[0].name).toBe('magento/module-catalog');

      expect(def.extraRefToRelease[0]).toBeInstanceOf(extraRefToRelease);
      expect(def.extraRefToRelease[0].details).toBe('Security patch');

      expect(def.extraMetapackages[0]).toBeInstanceOf(metapackageDefinition);
      expect(def.extraMetapackages[0].description).toBe('Enterprise Edition');
    });

    it('should work with mage-os vendor configuration', () => {
      const def = new repositoryBuildDefinition({
        repoUrl: 'https://github.com/mage-os/mageos-magento2',
        vendor: 'mage-os',
        ref: 'main',
        fromTag: '1.0.0',
        packageDirs: [
          { dir: 'app/code/MageOS' }
        ]
      });

      expect(def.vendor).toBe('mage-os');
      expect(def.packageDirs[0].dir).toBe('app/code/MageOS');
    });
  });
});
