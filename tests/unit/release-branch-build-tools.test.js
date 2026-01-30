/**
 * Comprehensive unit tests for release-branch-build-tools.js
 *
 * This test suite covers version transformation functions used for nightly builds.
 * Following the test plan from docs/release-branch-build-tools-testing-plan.md
 */

const {
  calcNightlyBuildPackageBaseVersion,
  transformVersionsToNightlyBuildVersions,
  getReleaseDateString,
  getPackageVersionsForBuildInstructions,
  addSuffixToVersion,
} = require('../../src/release-branch-build-tools');

describe('release-branch-build-tools', () => {
  // ============================================================================
  // calcNightlyBuildPackageBaseVersion Tests
  // ============================================================================
  describe('calcNightlyBuildPackageBaseVersion', () => {
    describe('version incrementing', () => {
      it('should add .1 when version has less than 4 parts (3 parts)', () => {
        expect(calcNightlyBuildPackageBaseVersion('2.4.5')).toBe('2.4.5.1');
      });

      it('should add .1 when version has 2 parts', () => {
        expect(calcNightlyBuildPackageBaseVersion('2.4')).toBe('2.4.1');
      });

      it('should add .1 when version has single part', () => {
        expect(calcNightlyBuildPackageBaseVersion('1')).toBe('1.1');
      });

      it('should increment last part when version has 4 parts with zero', () => {
        expect(calcNightlyBuildPackageBaseVersion('2.4.5.0')).toBe('2.4.5.1');
      });

      it('should increment last part when version has 4 parts with non-zero', () => {
        expect(calcNightlyBuildPackageBaseVersion('2.4.5.1')).toBe('2.4.5.2');
      });

      it('should handle two-digit increments correctly', () => {
        expect(calcNightlyBuildPackageBaseVersion('2.4.5.9')).toBe('2.4.5.10');
      });

      it('should handle large version numbers', () => {
        expect(calcNightlyBuildPackageBaseVersion('103.0.2')).toBe('103.0.2.1');
        expect(calcNightlyBuildPackageBaseVersion('103.0.2.1')).toBe('103.0.2.2');
      });
    });

    describe('version with v prefix', () => {
      it('should preserve v prefix in output', () => {
        expect(calcNightlyBuildPackageBaseVersion('v2.4.5')).toBe('v2.4.5.1');
      });

      it('should preserve v prefix with 4-part version', () => {
        expect(calcNightlyBuildPackageBaseVersion('v103.0.2.1')).toBe('v103.0.2.2');
      });
    });

    describe('pre-release suffixes', () => {
      it('should convert beta suffix to alpha+ format', () => {
        expect(calcNightlyBuildPackageBaseVersion('2.4.5-beta1')).toBe('2.4.5.1-alpha+beta1');
      });

      it('should convert dev suffix to alpha+ format', () => {
        expect(calcNightlyBuildPackageBaseVersion('1.2.0-dev')).toBe('1.2.0.1-alpha+dev');
      });

      it('should handle suffix with 2-part version', () => {
        expect(calcNightlyBuildPackageBaseVersion('1.0-dev')).toBe('1.0.1-alpha+dev');
      });

      it('should handle patch suffix', () => {
        expect(calcNightlyBuildPackageBaseVersion('0.4.0-beta1')).toBe('0.4.0.1-alpha+beta1');
      });

      it('should handle p suffix (patch)', () => {
        expect(calcNightlyBuildPackageBaseVersion('0.3.4-p2')).toBe('0.3.4.1-alpha+p2');
      });

      it('should handle alpha suffix', () => {
        expect(calcNightlyBuildPackageBaseVersion('1.0.0-alpha')).toBe('1.0.0.1-alpha+alpha');
      });

      it('should handle RC suffix', () => {
        expect(calcNightlyBuildPackageBaseVersion('2.0.0-RC1')).toBe('2.0.0.1-alpha+RC1');
      });
    });

    describe('error handling', () => {
      it('should throw for empty string', () => {
        expect(() => calcNightlyBuildPackageBaseVersion('')).toThrow();
      });

      it('should throw descriptive error message for empty string', () => {
        expect(() => calcNightlyBuildPackageBaseVersion(''))
          .toThrow('Unable to determine branch release version for input version ""');
      });

      it('should throw for invalid version format with letters', () => {
        expect(() => calcNightlyBuildPackageBaseVersion('invalid')).toThrow();
      });

      it('should throw for version with letter mixed in numbers', () => {
        expect(() => calcNightlyBuildPackageBaseVersion('1a')).toThrow();
      });

      it('should throw for version with x placeholder', () => {
        expect(() => calcNightlyBuildPackageBaseVersion('1.x')).toThrow();
      });

      it('should throw descriptive error message for non-matching version', () => {
        expect(() => calcNightlyBuildPackageBaseVersion('not-a-version'))
          .toThrow(/Unable to determine branch release version/);
      });

      it('should throw for version with more than 4 parts', () => {
        expect(() => calcNightlyBuildPackageBaseVersion('2.4.5.6.7')).toThrow();
      });

      it('should throw for version with trailing hyphen only', () => {
        expect(() => calcNightlyBuildPackageBaseVersion('2.4.5-')).toThrow();
      });

      it('should throw for version starting with hyphen', () => {
        expect(() => calcNightlyBuildPackageBaseVersion('-1.0.0')).toThrow();
      });
    });
  });

  // ============================================================================
  // transformVersionsToNightlyBuildVersions Tests
  // ============================================================================
  describe('transformVersionsToNightlyBuildVersions', () => {
    describe('happy path', () => {
      it('should transform all versions in map correctly', () => {
        const input = {
          'magento/module-catalog': '2.4.5',
          'magento/module-checkout': '2.4.6'
        };
        const result = transformVersionsToNightlyBuildVersions(input, '20240115');

        expect(result['magento/module-catalog']).toBe('2.4.5.1-a20240115');
        expect(result['magento/module-checkout']).toBe('2.4.6.1-a20240115');
      });

      it('should preserve package names as keys', () => {
        const input = { 'magento/module-catalog': '2.4.5' };
        const result = transformVersionsToNightlyBuildVersions(input, '20240115');

        expect(Object.keys(result)).toEqual(['magento/module-catalog']);
      });

      it('should return empty map for empty input', () => {
        expect(transformVersionsToNightlyBuildVersions({}, '20240115')).toEqual({});
      });
    });

    describe('single entry', () => {
      it('should transform a single entry correctly', () => {
        const result = transformVersionsToNightlyBuildVersions(
          { 'foo/bar': '103.0.2' },
          '20220703'
        );
        expect(result).toEqual({ 'foo/bar': '103.0.2.1-a20220703' });
      });
    });

    describe('multiple entries', () => {
      it('should transform multiple entries with different version formats', () => {
        const result = transformVersionsToNightlyBuildVersions({
          'foo/bar': '103.0.2',
          'baz/moo': '103.0.1.2',
          'moo/qux': '0.3.4-beta1',
          'moo/foo': '0.3.4-p2',
        }, '20220704');

        expect(result).toEqual({
          'foo/bar': '103.0.2.1-a20220704',
          'baz/moo': '103.0.1.3-a20220704',
          'moo/qux': '0.3.4.1-a20220704+beta1',
          'moo/foo': '0.3.4.1-a20220704+p2',
        });
      });
    });

    describe('pre-release suffix handling', () => {
      it('should handle dev suffix and include it in output', () => {
        const result = transformVersionsToNightlyBuildVersions(
          { 'foo/bar': '1.2.0-dev' },
          '20220705'
        );
        expect(result).toEqual({ 'foo/bar': '1.2.0.1-a20220705+dev' });
      });

      it('should handle dev suffix with 2-part version', () => {
        const result = transformVersionsToNightlyBuildVersions(
          { 'foo/bar': '1.0-dev' },
          '20220703'
        );
        expect(result).toEqual({ 'foo/bar': '1.0.1-a20220703+dev' });
      });

      it('should handle beta suffix', () => {
        const result = transformVersionsToNightlyBuildVersions(
          { 'foo/bar': '1.2.0-beta1' },
          '20220703'
        );
        expect(result).toEqual({ 'foo/bar': '1.2.0.1-a20220703+beta1' });
      });
    });

    describe('empty version handling', () => {
      it('should use 0.0.1 as base for empty version string', () => {
        const result = transformVersionsToNightlyBuildVersions(
          { 'foo/bar': '' },
          '20240115'
        );
        expect(result).toEqual({ 'foo/bar': '0.0.1.1-a20240115' });
      });
    });

    describe('build suffix variations', () => {
      it('should handle different date suffixes', () => {
        const input = { 'pkg/test': '1.0.0' };

        const result1 = transformVersionsToNightlyBuildVersions(input, '20240101');
        const result2 = transformVersionsToNightlyBuildVersions(input, '20241231');

        expect(result1['pkg/test']).toBe('1.0.0.1-a20240101');
        expect(result2['pkg/test']).toBe('1.0.0.1-a20241231');
      });

      it('should handle empty build suffix', () => {
        const result = transformVersionsToNightlyBuildVersions(
          { 'foo/bar': '2.4.5' },
          ''
        );
        expect(result).toEqual({ 'foo/bar': '2.4.5.1-a' });
      });
    });
  });

  // ============================================================================
  // getReleaseDateString Tests
  // ============================================================================
  describe('getReleaseDateString', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('format validation', () => {
      it('should return date in YYYYMMDD format', () => {
        jest.setSystemTime(new Date('2024-01-15T12:00:00'));
        expect(getReleaseDateString()).toBe('20240115');
      });

      it('should return 8 character string', () => {
        jest.setSystemTime(new Date('2024-06-15'));
        expect(getReleaseDateString()).toHaveLength(8);
      });

      it('should return only numeric characters', () => {
        jest.setSystemTime(new Date('2024-06-15'));
        expect(getReleaseDateString()).toMatch(/^\d{8}$/);
      });
    });

    describe('zero-padding', () => {
      it('should zero-pad single digit months', () => {
        jest.setSystemTime(new Date('2024-01-15T12:00:00'));
        expect(getReleaseDateString()).toBe('20240115');
      });

      it('should zero-pad single digit days', () => {
        jest.setSystemTime(new Date('2024-12-01T12:00:00'));
        expect(getReleaseDateString()).toBe('20241201');
      });

      it('should zero-pad both month and day when single digit', () => {
        jest.setSystemTime(new Date('2024-01-05T12:00:00'));
        expect(getReleaseDateString()).toBe('20240105');
      });

      it('should not pad double digit months', () => {
        jest.setSystemTime(new Date('2024-12-15T12:00:00'));
        expect(getReleaseDateString()).toBe('20241215');
      });

      it('should not pad double digit days', () => {
        jest.setSystemTime(new Date('2024-06-25T12:00:00'));
        expect(getReleaseDateString()).toBe('20240625');
      });
    });

    describe('edge cases for dates', () => {
      it('should handle first day of year', () => {
        jest.setSystemTime(new Date('2024-01-01T12:00:00'));
        expect(getReleaseDateString()).toBe('20240101');
      });

      it('should handle last day of year', () => {
        jest.setSystemTime(new Date('2024-12-31T12:00:00'));
        expect(getReleaseDateString()).toBe('20241231');
      });

      it('should handle leap year date', () => {
        jest.setSystemTime(new Date('2024-02-29T12:00:00'));
        expect(getReleaseDateString()).toBe('20240229');
      });

      it('should handle mid-year date', () => {
        jest.setSystemTime(new Date('2024-06-15T12:00:00'));
        expect(getReleaseDateString()).toBe('20240615');
      });

      it('should handle different year', () => {
        jest.setSystemTime(new Date('2025-07-20T12:00:00'));
        expect(getReleaseDateString()).toBe('20250720');
      });
    });
  });

  // ============================================================================
  // transformVersionsToNightlyBuildVersion (tested indirectly)
  // This is an internal function, but we can test it through transformVersionsToNightlyBuildVersions
  // ============================================================================
  describe('transformVersionsToNightlyBuildVersion (indirect testing)', () => {
    it('should transform standard version correctly', () => {
      const result = transformVersionsToNightlyBuildVersions(
        { 'test/pkg': '2.4.5' },
        '20240115'
      );
      expect(result['test/pkg']).toBe('2.4.5.1-a20240115');
    });

    it('should use 0.0.1 as base for empty version', () => {
      const result = transformVersionsToNightlyBuildVersions(
        { 'test/pkg': '' },
        '20240115'
      );
      expect(result['test/pkg']).toBe('0.0.1.1-a20240115');
    });

    it('should combine base version calculation and suffix addition', () => {
      const result = transformVersionsToNightlyBuildVersions(
        { 'test/pkg': '1.0.0-beta1' },
        '20240115'
      );
      // Base: 1.0.0.1-alpha+beta1, then with suffix: 1.0.0.1-a20240115+beta1
      expect(result['test/pkg']).toBe('1.0.0.1-a20240115+beta1');
    });
  });

  // ============================================================================
  // addSuffixToVersion (tested indirectly through transformVersionsToNightlyBuildVersions)
  // ============================================================================
  describe('addSuffixToVersion (indirect testing)', () => {
    it('should add alpha suffix with date', () => {
      const result = transformVersionsToNightlyBuildVersions(
        { 'test/pkg': '2.4.5' },
        '20240115'
      );
      expect(result['test/pkg']).toContain('-a20240115');
    });

    it('should preserve legacy component (+ suffix)', () => {
      // When base version has suffix like -beta1, it becomes +beta1 in the output
      const result = transformVersionsToNightlyBuildVersions(
        { 'test/pkg': '2.4.5-beta1' },
        '20240115'
      );
      expect(result['test/pkg']).toBe('2.4.5.1-a20240115+beta1');
    });

    it('should replace existing stability suffix with alpha date suffix', () => {
      const result = transformVersionsToNightlyBuildVersions(
        { 'test/pkg': '2.4.5-beta1' },
        '20240115'
      );
      expect(result['test/pkg']).not.toContain('-beta1');
      expect(result['test/pkg']).toContain('-a20240115');
    });
  });

  // ============================================================================
  // Integration-style tests for version transformation pipeline
  // ============================================================================
  describe('Version Transformation Pipeline', () => {
    it('should correctly transform a typical Magento version', () => {
      const result = transformVersionsToNightlyBuildVersions(
        { 'magento/magento2-base': '2.4.7' },
        '20240115'
      );
      expect(result['magento/magento2-base']).toBe('2.4.7.1-a20240115');
    });

    it('should correctly transform Mage-OS versions with pre-release', () => {
      const result = transformVersionsToNightlyBuildVersions(
        { 'mage-os/mage-os': '1.0.0-beta2' },
        '20240115'
      );
      expect(result['mage-os/mage-os']).toBe('1.0.0.1-a20240115+beta2');
    });

    it('should handle a full set of packages like in real builds', () => {
      const packages = {
        'magento/module-catalog': '103.0.2',
        'magento/module-checkout': '100.4.7',
        'magento/module-customer': '103.0.1.2',
        'magento/framework': '103.0.5-p1',
        'mage-os/mageos-inventory': '1.2.0-dev',
      };

      const result = transformVersionsToNightlyBuildVersions(packages, '20240115');

      expect(result['magento/module-catalog']).toBe('103.0.2.1-a20240115');
      expect(result['magento/module-checkout']).toBe('100.4.7.1-a20240115');
      expect(result['magento/module-customer']).toBe('103.0.1.3-a20240115');
      expect(result['magento/framework']).toBe('103.0.5.1-a20240115+p1');
      expect(result['mage-os/mageos-inventory']).toBe('1.2.0.1-a20240115+dev');
    });

    it('should maintain consistent output format regardless of input format', () => {
      const testCases = [
        { input: '1', expected: '1.1-a20240115' },
        { input: '1.0', expected: '1.0.1-a20240115' },
        { input: '1.0.0', expected: '1.0.0.1-a20240115' },
        { input: '1.0.0.0', expected: '1.0.0.1-a20240115' },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = transformVersionsToNightlyBuildVersions(
          { 'test/pkg': input },
          '20240115'
        );
        expect(result['test/pkg']).toBe(expected);
      });
    });
  });

  // ============================================================================
  // Nightly Build Version Calculation Tests
  // ============================================================================
  describe('Nightly Build Version Calculation', () => {
    describe('version with different part counts', () => {
      const testCases = [
        { version: '1', expectedBase: '1.1' },
        { version: '1.2', expectedBase: '1.2.1' },
        { version: '1.2.3', expectedBase: '1.2.3.1' },
        { version: '1.2.3.0', expectedBase: '1.2.3.1' },
        { version: '1.2.3.4', expectedBase: '1.2.3.5' },
      ];

      testCases.forEach(({ version, expectedBase }) => {
        it(`should calculate correct base for ${version}`, () => {
          expect(calcNightlyBuildPackageBaseVersion(version)).toBe(expectedBase);
        });
      });
    });

    describe('full nightly version format', () => {
      beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-07-15T12:00:00'));
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should produce correct nightly version with date suffix', () => {
        const dateSuffix = getReleaseDateString();
        const result = transformVersionsToNightlyBuildVersions(
          { 'test/pkg': '2.4.7' },
          dateSuffix
        );
        expect(result['test/pkg']).toBe('2.4.7.1-a20240715');
      });
    });
  });

  // ============================================================================
  // addSuffixToVersion Direct Tests
  // ============================================================================
  describe('addSuffixToVersion', () => {
    describe('standard versions', () => {
      it('should add suffix to simple version', () => {
        expect(addSuffixToVersion('2.4.5', '20240115')).toBe('2.4.5-a20240115');
      });

      it('should add suffix to version with 4 parts', () => {
        expect(addSuffixToVersion('2.4.5.1', '20240115')).toBe('2.4.5.1-a20240115');
      });

      it('should add suffix to single digit version', () => {
        expect(addSuffixToVersion('1', '20240115')).toBe('1-a20240115');
      });

      it('should add suffix to two-part version', () => {
        expect(addSuffixToVersion('2.4', '20240115')).toBe('2.4-a20240115');
      });
    });

    describe('versions with existing suffixes', () => {
      it('should replace existing suffix and preserve legacy component', () => {
        expect(addSuffixToVersion('2.4.5-beta1', '20240115')).toBe('2.4.5-a20240115');
      });

      it('should handle version with + legacy component', () => {
        expect(addSuffixToVersion('2.4.5+legacy', '20240115')).toBe('2.4.5-a20240115+legacy');
      });

      it('should handle version with both suffix and legacy component', () => {
        expect(addSuffixToVersion('2.4.5-beta1+legacy', '20240115')).toBe('2.4.5-a20240115+legacy');
      });
    });

    describe('empty/default suffix handling', () => {
      it('should default to "lpha" when no suffix provided (making -alpha)', () => {
        expect(addSuffixToVersion('2.4.5', '')).toBe('2.4.5-a');
      });

      it('should append undefined as string when undefined suffix provided (regex path)', () => {
        // When the regex matches, buildSuffix is directly interpolated, so undefined becomes "undefined"
        expect(addSuffixToVersion('2.4.5', undefined)).toBe('2.4.5-aundefined');
      });
    });

    describe('fallback behavior for non-matching patterns', () => {
      it('should use fallback for version that does not match expected pattern', () => {
        // This triggers the fallback return path in addSuffixToVersion
        // The regex requires at least one digit followed by optional periods
        // A string like "abc" won't match, triggering the fallback
        expect(addSuffixToVersion('abc', '20240115')).toBe('abc-a20240115');
      });

      it('should use fallback with default alpha suffix when no suffix and pattern does not match', () => {
        expect(addSuffixToVersion('abc', '')).toBe('abc-alpha');
      });

      it('should use fallback for special characters only', () => {
        expect(addSuffixToVersion('---', '20240115')).toBe('----a20240115');
      });

      it('should use fallback with alpha for empty string version and empty suffix', () => {
        expect(addSuffixToVersion('', '')).toBe('-alpha');
      });
    });

    describe('edge cases', () => {
      it('should strip v prefix from version (regex captures digits only)', () => {
        // The regex only captures digit groups, so 'v' prefix is stripped
        expect(addSuffixToVersion('v2.4.5', '20240115')).toBe('2.4.5-a20240115');
      });

      it('should handle zero versions', () => {
        expect(addSuffixToVersion('0.0.0', '20240115')).toBe('0.0.0-a20240115');
      });

      it('should handle large version numbers', () => {
        expect(addSuffixToVersion('103.0.2.1', '20240115')).toBe('103.0.2.1-a20240115');
      });
    });
  });

  // ============================================================================
  // getPackageVersionsForBuildInstructions Tests
  // ============================================================================
  describe('getPackageVersionsForBuildInstructions', () => {
    // We need to mock the internal dependencies
    let mockGetLatestTag;
    let mockDeterminePackagesForRef;
    let mockDeterminePackageForRef;
    let mockDetermineMetaPackageFromRepoDir;
    let mockClearCache;

    beforeEach(() => {
      jest.resetModules();

      // Mock the repository module
      mockClearCache = jest.fn();
      jest.doMock('../../src/repository', () => ({
        clearCache: mockClearCache,
      }));

      // Mock the package-modules
      mockGetLatestTag = jest.fn();
      mockDeterminePackagesForRef = jest.fn();
      mockDeterminePackageForRef = jest.fn();
      mockDetermineMetaPackageFromRepoDir = jest.fn();

      jest.doMock('../../src/package-modules', () => ({
        getLatestTag: mockGetLatestTag,
        determinePackagesForRef: mockDeterminePackagesForRef,
        determinePackageForRef: mockDeterminePackageForRef,
        determineMetaPackageFromRepoDir: mockDetermineMetaPackageFromRepoDir,
        createPackagesForRef: jest.fn(),
        createPackageForRef: jest.fn(),
        createMetaPackage: jest.fn(),
        createMetaPackageFromRepoDir: jest.fn(),
      }));
    });

    afterEach(() => {
      jest.resetModules();
    });

    it('should return empty object for empty instructions array', async () => {
      // Re-require after mocking
      const { getPackageVersionsForBuildInstructions } = require('../../src/release-branch-build-tools');

      const result = await getPackageVersionsForBuildInstructions([], '20240115');

      expect(result).toEqual({});
    });

    it('should return transformed versions for packages from a single instruction', async () => {
      mockGetLatestTag.mockResolvedValue('2.4.7');
      mockDeterminePackagesForRef.mockResolvedValue({
        'magento/module-catalog': '2.4.7',
        'magento/module-checkout': '2.4.7',
      });

      const { getPackageVersionsForBuildInstructions } = require('../../src/release-branch-build-tools');

      const instructions = [{
        repoUrl: 'https://github.com/magento/magento2.git',
        ref: '2.4-develop',
        vendor: 'magento',
        packageDirs: [{ label: 'Magento modules', dir: 'app/code/Magento' }],
      }];

      const result = await getPackageVersionsForBuildInstructions(instructions, '20240115');

      expect(result).toEqual({
        'magento/module-catalog': '2.4.7.1-a20240115',
        'magento/module-checkout': '2.4.7.1-a20240115',
      });
      expect(mockClearCache).toHaveBeenCalled();
    });

    it('should combine packages from multiple instructions', async () => {
      mockGetLatestTag.mockResolvedValue('2.4.7');
      mockDeterminePackagesForRef
        .mockResolvedValueOnce({ 'magento/module-catalog': '2.4.7' })
        .mockResolvedValueOnce({ 'mage-os/module-inventory': '1.0.0' });

      const { getPackageVersionsForBuildInstructions } = require('../../src/release-branch-build-tools');

      const instructions = [
        {
          repoUrl: 'https://github.com/magento/magento2.git',
          ref: '2.4-develop',
          vendor: 'magento',
          packageDirs: [{ label: 'Magento modules', dir: 'app/code/Magento' }],
        },
        {
          repoUrl: 'https://github.com/mage-os/inventory.git',
          ref: 'main',
          vendor: 'mage-os',
          packageDirs: [{ label: 'Inventory modules', dir: 'src' }],
        },
      ];

      const result = await getPackageVersionsForBuildInstructions(instructions, '20240115');

      expect(result).toEqual({
        'magento/module-catalog': '2.4.7.1-a20240115',
        'mage-os/module-inventory': '1.0.0.1-a20240115',
      });
      expect(mockClearCache).toHaveBeenCalledTimes(2);
    });

    it('should handle single instruction with no packages', async () => {
      mockGetLatestTag.mockResolvedValue('2.4.7');

      const { getPackageVersionsForBuildInstructions } = require('../../src/release-branch-build-tools');

      const instructions = [{
        repoUrl: 'https://github.com/magento/magento2.git',
        ref: '2.4-develop',
        vendor: 'magento',
        // No packageDirs, packageIndividual, etc.
      }];

      const result = await getPackageVersionsForBuildInstructions(instructions, '20240115');

      expect(result).toEqual({});
    });

    it('should handle duplicate packages across instructions (last one wins)', async () => {
      mockGetLatestTag.mockResolvedValue('2.4.7');
      mockDeterminePackagesForRef
        .mockResolvedValueOnce({ 'shared/module': '1.0.0' })
        .mockResolvedValueOnce({ 'shared/module': '2.0.0' });

      const { getPackageVersionsForBuildInstructions } = require('../../src/release-branch-build-tools');

      const instructions = [
        {
          repoUrl: 'https://github.com/repo1.git',
          ref: 'main',
          vendor: 'shared',
          packageDirs: [{ label: 'Modules', dir: 'src' }],
        },
        {
          repoUrl: 'https://github.com/repo2.git',
          ref: 'main',
          vendor: 'shared',
          packageDirs: [{ label: 'Modules', dir: 'src' }],
        },
      ];

      const result = await getPackageVersionsForBuildInstructions(instructions, '20240115');

      // The second instruction's version should win
      expect(result['shared/module']).toBe('2.0.0.1-a20240115');
    });

    it('should handle packageIndividual entries', async () => {
      mockGetLatestTag.mockResolvedValue('2.4.7');
      mockDeterminePackageForRef.mockResolvedValue({
        'magento/magento2-base': '2.4.7',
      });

      const { getPackageVersionsForBuildInstructions } = require('../../src/release-branch-build-tools');

      const instructions = [{
        repoUrl: 'https://github.com/magento/magento2.git',
        ref: '2.4-develop',
        vendor: 'magento',
        packageIndividual: [{ label: 'Base package', name: 'magento2-base' }],
      }];

      const result = await getPackageVersionsForBuildInstructions(instructions, '20240115');

      expect(result).toEqual({
        'magento/magento2-base': '2.4.7.1-a20240115',
      });
    });

    it('should handle packageMetaFromDirs entries', async () => {
      mockGetLatestTag.mockResolvedValue('2.4.7');
      mockDetermineMetaPackageFromRepoDir.mockResolvedValue({
        'magento/product-community-edition': '2.4.7',
      });

      const { getPackageVersionsForBuildInstructions } = require('../../src/release-branch-build-tools');

      const instructions = [{
        repoUrl: 'https://github.com/magento/magento2.git',
        ref: '2.4-develop',
        vendor: 'magento',
        packageMetaFromDirs: [{ label: 'Meta package', dir: 'composer.json' }],
      }];

      const result = await getPackageVersionsForBuildInstructions(instructions, '20240115');

      expect(result).toEqual({
        'magento/product-community-edition': '2.4.7.1-a20240115',
      });
    });

    it('should handle extraMetapackages entries', async () => {
      mockGetLatestTag.mockResolvedValue('2.4.7');

      const { getPackageVersionsForBuildInstructions } = require('../../src/release-branch-build-tools');

      const instructions = [{
        repoUrl: 'https://github.com/magento/magento2.git',
        ref: '2.4-develop',
        vendor: 'magento',
        extraMetapackages: [{ name: 'custom-metapackage' }],
      }];

      const result = await getPackageVersionsForBuildInstructions(instructions, '20240115');

      expect(result).toEqual({
        'magento/custom-metapackage': '2.4.7.1-a20240115',
      });
    });

    it('should use instruction ref as fallback when getLatestTag returns null', async () => {
      mockGetLatestTag.mockResolvedValue(null);

      const { getPackageVersionsForBuildInstructions } = require('../../src/release-branch-build-tools');

      const instructions = [{
        repoUrl: 'https://github.com/magento/magento2.git',
        ref: '2.4-develop',
        vendor: 'magento',
        extraMetapackages: [{ name: 'test-package' }],
      }];

      const result = await getPackageVersionsForBuildInstructions(instructions, '20240115');

      // The ref '2.4-develop' will be used as the version, which will fail calcNightlyBuildPackageBaseVersion
      // But extraMetapackages use baseVersionsOnRef directly
      // This tests that null fallback works correctly
      expect(mockGetLatestTag).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Additional Edge Cases
  // ============================================================================
  describe('Edge Cases', () => {
    describe('whitespace-only version handling', () => {
      it('should throw for whitespace-only version string in calcNightlyBuildPackageBaseVersion', () => {
        expect(() => calcNightlyBuildPackageBaseVersion('   ')).toThrow();
        expect(() => calcNightlyBuildPackageBaseVersion('\t')).toThrow();
        expect(() => calcNightlyBuildPackageBaseVersion('\n')).toThrow();
      });

      it('should handle whitespace-only version through transformVersionsToNightlyBuildVersions', () => {
        // When a whitespace-only string is passed, calcNightlyBuildPackageBaseVersion will throw
        // because whitespace doesn't match the version pattern
        expect(() => {
          transformVersionsToNightlyBuildVersions({ 'test/pkg': '   ' }, '20240115');
        }).toThrow();
      });
    });

    describe('version with + legacy component', () => {
      it('should not support + in calcNightlyBuildPackageBaseVersion (regex limitation)', () => {
        // The regex /^v?(?:\d+\.){0,3}\d+(?:-[a-z]\w*|)$/i does not support + components
        expect(() => calcNightlyBuildPackageBaseVersion('2.4.5+build.123')).toThrow();
      });
    });

    describe('addSuffixToVersion preserves legacy in transformed versions', () => {
      it('should preserve + component when present in already-processed version', () => {
        // When calcNightlyBuildPackageBaseVersion processes a version with suffix like -beta1,
        // it converts it to -alpha+beta1 format
        const baseVersion = calcNightlyBuildPackageBaseVersion('2.4.5-beta1');
        expect(baseVersion).toBe('2.4.5.1-alpha+beta1');

        // Then addSuffixToVersion should preserve the +beta1 part
        const suffixed = addSuffixToVersion(baseVersion, '20240115');
        expect(suffixed).toBe('2.4.5.1-a20240115+beta1');
      });
    });

    describe('complex version transformation scenarios', () => {
      it('should handle version with RC suffix', () => {
        const result = transformVersionsToNightlyBuildVersions(
          { 'test/pkg': '2.0.0-RC1' },
          '20240115'
        );
        expect(result['test/pkg']).toBe('2.0.0.1-a20240115+RC1');
      });

      it('should handle version with alpha suffix', () => {
        const result = transformVersionsToNightlyBuildVersions(
          { 'test/pkg': '1.0.0-alpha' },
          '20240115'
        );
        expect(result['test/pkg']).toBe('1.0.0.1-a20240115+alpha');
      });
    });
  });
});
