'use strict';

/**
 * Comprehensive Jest tests for src/utils.js
 * Following the test plan in docs/utils-testing-plan.md
 */

const {
  lastTwoDirs,
  compareVersions,
  isVersionGreaterOrEqual,
  isVersionLessOrEqual,
  isVersionEqual,
  httpSlurp,
  mergeBuildConfigs
} = require('../../src/utils');

// Mock the https module for httpSlurp tests
jest.mock('https', () => ({
  request: jest.fn()
}));

const https = require('https');

// ============================================================================
// 1. lastTwoDirs(dir, sep) Tests
// ============================================================================
describe('lastTwoDirs', () => {
  describe('happy path', () => {
    it('should return last two directory segments', () => {
      expect(lastTwoDirs('app/code/Magento/Catalog')).toBe('Magento/Catalog');
    });

    it('should use custom separator in output', () => {
      expect(lastTwoDirs('app/code/Magento/Catalog', '_')).toBe('Magento_Catalog');
    });

    it('should handle exactly two segments', () => {
      expect(lastTwoDirs('Magento/Catalog')).toBe('Magento/Catalog');
    });

    it('should work with three segments', () => {
      expect(lastTwoDirs('code/Magento/Catalog')).toBe('Magento/Catalog');
    });
  });

  describe('edge cases', () => {
    it('should handle single segment', () => {
      // 'Catalog'.split('/') = ['Catalog']
      // slice(-2) on single element array returns that element
      // join('/') = 'Catalog'
      expect(lastTwoDirs('Catalog')).toBe('Catalog');
    });

    it('should handle empty string', () => {
      // ''.split('/') returns [''], slice(-2) returns [''], join returns ''
      expect(lastTwoDirs('')).toBe('');
    });

    it('should handle deep paths', () => {
      expect(lastTwoDirs('a/b/c/d/e')).toBe('d/e');
    });

    it('should handle trailing slash', () => {
      // 'app/code/Magento/Catalog/'.split('/') = ['app','code','Magento','Catalog','']
      // slice(-2) = ['Catalog', '']
      // join('/') = 'Catalog/'
      expect(lastTwoDirs('app/code/Magento/Catalog/')).toBe('Catalog/');
    });

    it('should handle path with only slashes', () => {
      expect(lastTwoDirs('///')).toBe('/');
    });

    it('should use custom separator with deep path', () => {
      expect(lastTwoDirs('a/b/c/d/e', '-')).toBe('d-e');
    });

    it('should handle path starting with slash', () => {
      expect(lastTwoDirs('/app/code/Magento/Catalog')).toBe('Magento/Catalog');
    });
  });

  describe('error cases', () => {
    it('should throw when input is null', () => {
      expect(() => lastTwoDirs(null)).toThrow();
    });

    it('should throw when input is undefined', () => {
      expect(() => lastTwoDirs(undefined)).toThrow();
    });

    it('should throw when input is not a string', () => {
      expect(() => lastTwoDirs(123)).toThrow();
    });
  });
});

// ============================================================================
// 2. compareVersions(a, b) Tests (alias for compareTags)
// ============================================================================
describe('compareVersions', () => {
  describe('basic semver comparisons', () => {
    it('should return negative when a < b', () => {
      expect(compareVersions('1.0', '2.0')).toBeLessThan(0);
    });

    it('should return positive when a > b', () => {
      expect(compareVersions('2.0', '1.0')).toBeGreaterThan(0);
    });

    it('should return 0 when versions are equal', () => {
      expect(compareVersions('1.0', '1.0')).toBe(0);
    });

    it('should compare three-part versions correctly', () => {
      expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
      expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should compare major versions correctly', () => {
      expect(compareVersions('1.2.3', '2.2.3')).toBeLessThan(0);
      expect(compareVersions('2.2.3', '1.2.3')).toBeGreaterThan(0);
    });

    it('should compare minor versions correctly', () => {
      expect(compareVersions('1.2.3', '1.3.3')).toBeLessThan(0);
      expect(compareVersions('1.3.3', '1.2.3')).toBeGreaterThan(0);
    });
  });

  describe('Adobe patch version handling', () => {
    it('should treat patch versions as greater than base (Adobe-specific)', () => {
      // Adobe-specific: 2.4-p1 > 2.4 (unlike standard semver where 2.4 > 2.4-p1)
      expect(compareVersions('2.4-p1', '2.4')).toBeGreaterThan(0);
      expect(compareVersions('2.4', '2.4-p1')).toBeLessThan(0);
    });

    it('should compare patch numbers correctly', () => {
      expect(compareVersions('2.4-p1', '2.4-p2')).toBeLessThan(0);
      expect(compareVersions('2.4-p2', '2.4-p1')).toBeGreaterThan(0);
    });

    it('should return 0 for equal patch versions', () => {
      expect(compareVersions('2.4-p1', '2.4-p1')).toBe(0);
    });

    it('should handle multi-digit patch numbers', () => {
      expect(compareVersions('2.4-p10', '2.4-p9')).toBeGreaterThan(0);
      expect(compareVersions('2.4-p9', '2.4-p10')).toBeLessThan(0);
      expect(compareVersions('2.4-p10', '2.4-p2')).toBeGreaterThan(0);
    });

    it('should handle three-part versions with patches', () => {
      expect(compareVersions('2.4.6-p1', '2.4.6')).toBeGreaterThan(0);
      expect(compareVersions('2.4.6', '2.4.6-p1')).toBeLessThan(0);
      expect(compareVersions('2.4.6-p1', '2.4.6-p1')).toBe(0);
    });

    it('should compare base version before patch when bases differ', () => {
      // 2.4.7 > 2.4.6-p1 because base 2.4.7 > 2.4.6
      expect(compareVersions('2.4.6-p1', '2.4.7')).toBeLessThan(0);
      expect(compareVersions('2.4.7', '2.4.6-p1')).toBeGreaterThan(0);
    });

    it('should handle decimal patch versions', () => {
      expect(compareVersions('1.2.3-p1.1', '1.2.3-p1.2')).toBeLessThan(0);
      expect(compareVersions('1.2.3-p1.2', '1.2.3-p1.1')).toBeGreaterThan(0);
      expect(compareVersions('1.2.3-p1.1', '1.2.3-p1.1')).toBe(0);
    });

    it('should compare decimal patch vs integer patch', () => {
      expect(compareVersions('1.2.3-p1.1', '1.2.3-p2')).toBeLessThan(0);
      expect(compareVersions('1.2.3-p2', '1.2.3-p1.1')).toBeGreaterThan(0);
      expect(compareVersions('1.2.3-p2.1', '1.2.3-p1.1')).toBeGreaterThan(0);
    });

    it('should handle p0 patch versions', () => {
      expect(compareVersions('1.2.3-p0.1', '1.2.3')).toBeGreaterThan(0);
      expect(compareVersions('1.2.3-p0.1', '1.2.3-p1')).toBeLessThan(0);
      expect(compareVersions('1.2.3-p0.1', '1.2.3-p0')).toBeGreaterThan(0);
    });
  });

  describe('version prefix handling', () => {
    it('should handle v prefix', () => {
      expect(compareVersions('v1.0', '1.0')).toBe(0);
      expect(compareVersions('1.0', 'v1.0')).toBe(0);
    });

    it('should handle v prefix with patch versions', () => {
      expect(compareVersions('v2.4-p1', '2.4-p1')).toBe(0);
      expect(compareVersions('2.4-p1', 'v2.4-p1')).toBe(0);
    });

    it('should compare v-prefixed versions correctly', () => {
      expect(compareVersions('v1.0', 'v2.0')).toBeLessThan(0);
      expect(compareVersions('v2.0', 'v1.0')).toBeGreaterThan(0);
    });
  });

  describe('version comparison matrix (from test plan)', () => {
    // Comprehensive matrix from the test plan
    const testCases = [
      { a: '1.0', b: '2.0', expected: 'less' },
      { a: '2.0', b: '1.0', expected: 'greater' },
      { a: '1.0', b: '1.0', expected: 'equal' },
      { a: '2.4', b: '2.4-p1', expected: 'less' },
      { a: '2.4-p1', b: '2.4-p2', expected: 'less' },
      { a: '2.4-p10', b: '2.4-p9', expected: 'greater' },
      { a: 'v1.0', b: '1.0', expected: 'equal' },
      { a: '2.4.6-p1', b: '2.4.7', expected: 'less' },
    ];

    testCases.forEach(({ a, b, expected }) => {
      it(`should compare ${a} vs ${b} as ${expected}`, () => {
        const result = compareVersions(a, b);
        if (expected === 'less') {
          expect(result).toBeLessThan(0);
        } else if (expected === 'greater') {
          expect(result).toBeGreaterThan(0);
        } else {
          expect(result).toBe(0);
        }
      });
    });
  });
});

// ============================================================================
// 3. Version helper functions Tests
// ============================================================================
describe('version comparison helpers', () => {
  describe('isVersionGreaterOrEqual', () => {
    it('should return true when a > b', () => {
      expect(isVersionGreaterOrEqual('2.0', '1.0')).toBe(true);
    });

    it('should return true when a === b', () => {
      expect(isVersionGreaterOrEqual('1.0', '1.0')).toBe(true);
    });

    it('should return false when a < b', () => {
      expect(isVersionGreaterOrEqual('1.0', '2.0')).toBe(false);
    });

    it('should handle Adobe patch versions correctly', () => {
      expect(isVersionGreaterOrEqual('2.4-p1', '2.4')).toBe(true);
      expect(isVersionGreaterOrEqual('2.4-p2', '2.4-p1')).toBe(true);
      expect(isVersionGreaterOrEqual('2.4-p1', '2.4-p2')).toBe(false);
    });

    it('should return true for equal patch versions', () => {
      expect(isVersionGreaterOrEqual('2.4-p1', '2.4-p1')).toBe(true);
    });
  });

  describe('isVersionLessOrEqual', () => {
    it('should return true when a < b', () => {
      expect(isVersionLessOrEqual('1.0', '2.0')).toBe(true);
    });

    it('should return true when a === b', () => {
      expect(isVersionLessOrEqual('1.0', '1.0')).toBe(true);
    });

    it('should return false when a > b', () => {
      expect(isVersionLessOrEqual('2.0', '1.0')).toBe(false);
    });

    it('should handle Adobe patch versions correctly', () => {
      expect(isVersionLessOrEqual('2.4', '2.4-p1')).toBe(true);
      expect(isVersionLessOrEqual('2.4-p1', '2.4-p2')).toBe(true);
      expect(isVersionLessOrEqual('2.4-p2', '2.4-p1')).toBe(false);
    });

    it('should return true for equal patch versions', () => {
      expect(isVersionLessOrEqual('2.4-p1', '2.4-p1')).toBe(true);
    });
  });

  describe('isVersionEqual', () => {
    it('should return true when versions are equal', () => {
      expect(isVersionEqual('1.0', '1.0')).toBe(true);
      expect(isVersionEqual('2.4-p1', '2.4-p1')).toBe(true);
      expect(isVersionEqual('1.2.3', '1.2.3')).toBe(true);
    });

    it('should return false when versions differ', () => {
      expect(isVersionEqual('1.0', '2.0')).toBe(false);
      expect(isVersionEqual('2.4-p1', '2.4-p2')).toBe(false);
      expect(isVersionEqual('2.4', '2.4-p1')).toBe(false);
    });

    it('should handle v prefix as equal', () => {
      expect(isVersionEqual('v1.0', '1.0')).toBe(true);
      expect(isVersionEqual('v2.4-p1', '2.4-p1')).toBe(true);
    });

    it('should handle decimal patch versions', () => {
      expect(isVersionEqual('1.2.3-p1.2', '1.2.3-p1.2')).toBe(true);
      expect(isVersionEqual('1.2.3-p1.1', '1.2.3-p1.2')).toBe(false);
    });
  });
});

// ============================================================================
// 4. httpSlurp(url) Tests
// ============================================================================
describe('httpSlurp', () => {
  let mockRequest;
  let mockResponse;

  beforeEach(() => {
    jest.clearAllMocks();

    mockResponse = {
      on: jest.fn()
    };

    mockRequest = {
      on: jest.fn(),
      end: jest.fn()
    };

    https.request.mockImplementation((url, callback) => {
      // Store callback for later invocation
      mockRequest._callback = callback;
      return mockRequest;
    });
  });

  it('should resolve with response data', async () => {
    const dataChunks = ['chunk1', 'chunk2', 'chunk3'];

    https.request.mockImplementation((url, callback) => {
      // Simulate response event handlers
      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          dataChunks.forEach(chunk => handler(chunk));
        }
        if (event === 'end') {
          handler();
        }
      });

      // Call the callback with mock response
      process.nextTick(() => callback(mockResponse));

      return mockRequest;
    });

    const result = await httpSlurp('https://example.com/api');

    expect(https.request).toHaveBeenCalledTimes(1);
    expect(result).toBe('chunk1chunk2chunk3');
  });

  it('should handle empty response', async () => {
    https.request.mockImplementation((url, callback) => {
      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'end') {
          handler();
        }
      });

      process.nextTick(() => callback(mockResponse));

      return mockRequest;
    });

    const result = await httpSlurp('https://example.com/empty');

    expect(result).toBe('');
  });

  it('should handle single chunk response', async () => {
    https.request.mockImplementation((url, callback) => {
      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          handler('single-chunk');
        }
        if (event === 'end') {
          handler();
        }
      });

      process.nextTick(() => callback(mockResponse));

      return mockRequest;
    });

    const result = await httpSlurp('https://example.com/single');

    expect(result).toBe('single-chunk');
  });

  it('should reject on request error', async () => {
    const errorMessage = 'Network error';

    https.request.mockImplementation((url, callback) => {
      return {
        on: jest.fn((event, handler) => {
          if (event === 'error') {
            process.nextTick(() => handler({ message: errorMessage }));
          }
        }),
        end: jest.fn()
      };
    });

    await expect(httpSlurp('https://example.com/error')).rejects.toBe(errorMessage);
  });

  it('should call request.end()', async () => {
    https.request.mockImplementation((url, callback) => {
      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'end') {
          handler();
        }
      });

      process.nextTick(() => callback(mockResponse));

      return mockRequest;
    });

    await httpSlurp('https://example.com/test');

    expect(mockRequest.end).toHaveBeenCalledTimes(1);
  });

  it('should pass URL to https.request', async () => {
    const testUrl = 'https://example.com/api/data';

    https.request.mockImplementation((url, callback) => {
      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'end') {
          handler();
        }
      });

      process.nextTick(() => callback(mockResponse));

      return mockRequest;
    });

    await httpSlurp(testUrl);

    expect(https.request).toHaveBeenCalledTimes(1);
    // The URL is passed as a URL object
    const calledUrl = https.request.mock.calls[0][0];
    expect(calledUrl.href).toBe(testUrl);
  });

  /**
   * NOTE: Bug Documentation
   *
   * The original test plan mentioned a bug in httpSlurp where
   * `reject(e.message)` should have been `reject(err.message)`.
   *
   * Looking at the current source code (src/utils.js line 89):
   *   request.on('error', err => reject(err.message));
   *
   * This bug appears to have been FIXED. The variable name is now correct.
   * The commit 2a67f699 with message "fix: correct variable name in httpSlurp
   * error handler" indicates this was recently corrected.
   *
   * The error rejection test above verifies the correct behavior.
   */
});

// ============================================================================
// 5. mergeBuildConfigs(a, b) Tests
// ============================================================================
describe('mergeBuildConfigs', () => {
  describe('basic merging', () => {
    it('should return empty array when both configs are empty', () => {
      const result = mergeBuildConfigs({}, {});
      expect(result).toEqual([]);
    });

    it('should return array with entries from b when a is empty', () => {
      const a = {};
      const b = { repo1: { repoUrl: 'https://github.com/example/repo1.git' } };
      const result = mergeBuildConfigs(a, b);

      expect(result).toHaveLength(1);
      expect(result[0].repoUrl).toBe('https://github.com/example/repo1.git');
    });

    it('should include key from b in result', () => {
      const a = {};
      const b = { 'my-repo': { repoUrl: 'https://example.com' } };
      const result = mergeBuildConfigs(a, b);

      // The key is added to the repositoryBuildDefinition - verify via the object
      expect(result).toHaveLength(1);
    });

    it('should override values from a with values from b', () => {
      const a = { repo1: { repoUrl: 'url1', ref: 'main' } };
      const b = { repo1: { repoUrl: 'url2' } };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].repoUrl).toBe('url2');
    });

    it('should preserve values from a when not overridden by b', () => {
      const a = { repo1: { repoUrl: 'url1', ref: 'main', vendor: 'mage-os' } };
      const b = { repo1: { repoUrl: 'url2' } };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].repoUrl).toBe('url2');
      expect(result[0].ref).toBe('main');
      expect(result[0].vendor).toBe('mage-os');
    });

    it('should handle multiple repos in b', () => {
      const a = {};
      const b = {
        repo1: { repoUrl: 'url1' },
        repo2: { repoUrl: 'url2' }
      };
      const result = mergeBuildConfigs(a, b);

      expect(result).toHaveLength(2);
    });
  });

  describe('packageDirs array merging', () => {
    it('should merge packageDirs arrays', () => {
      const a = {
        repo1: {
          packageDirs: [{ dir: 'app/code', label: 'Modules' }]
        }
      };
      const b = {
        repo1: {
          packageDirs: [{ dir: 'lib', label: 'Libraries' }]
        }
      };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].packageDirs).toHaveLength(2);
    });

    it('should update existing item when dir matches', () => {
      const a = {
        repo1: {
          packageDirs: [{ dir: 'app/code', label: 'Old Label' }]
        }
      };
      const b = {
        repo1: {
          packageDirs: [{ dir: 'app/code', label: 'New Label', composerJsonPath: 'custom/composer.json' }]
        }
      };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].packageDirs).toHaveLength(1);
      expect(result[0].packageDirs[0].label).toBe('New Label');
      // packageDefinition only supports specific properties: label, dir, composerJsonPath, emptyDirsToAdd, excludes
      expect(result[0].packageDirs[0].composerJsonPath).toBe('custom/composer.json');
      expect(result[0].packageDirs[0].dir).toBe('app/code');
    });

    it('should add new items to packageDirs', () => {
      const a = {
        repo1: {
          packageDirs: [{ dir: 'dir1', label: 'Label1' }]
        }
      };
      const b = {
        repo1: {
          packageDirs: [
            { dir: 'dir2', label: 'Label2' },
            { dir: 'dir3', label: 'Label3' }
          ]
        }
      };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].packageDirs).toHaveLength(3);
    });
  });

  describe('packageIndividual array merging', () => {
    it('should merge packageIndividual arrays', () => {
      const a = {
        repo1: {
          packageIndividual: [{ dir: 'src/Package1', label: 'Package 1' }]
        }
      };
      const b = {
        repo1: {
          packageIndividual: [{ dir: 'src/Package2', label: 'Package 2' }]
        }
      };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].packageIndividual).toHaveLength(2);
    });

    it('should update existing item when dir matches in packageIndividual', () => {
      const a = {
        repo1: {
          packageIndividual: [{ dir: 'src/Package1', label: 'Old' }]
        }
      };
      const b = {
        repo1: {
          packageIndividual: [{ dir: 'src/Package1', label: 'New', composerJsonPath: 'custom/path.json' }]
        }
      };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].packageIndividual).toHaveLength(1);
      expect(result[0].packageIndividual[0].label).toBe('New');
      // packageDefinition only supports specific properties: label, dir, composerJsonPath, emptyDirsToAdd, excludes
      expect(result[0].packageIndividual[0].composerJsonPath).toBe('custom/path.json');
    });
  });

  describe('packageMetaFromDirs array merging', () => {
    it('should merge packageMetaFromDirs arrays', () => {
      const a = {
        repo1: {
          packageMetaFromDirs: [{ dir: 'meta1', label: 'Meta 1' }]
        }
      };
      const b = {
        repo1: {
          packageMetaFromDirs: [{ dir: 'meta2', label: 'Meta 2' }]
        }
      };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].packageMetaFromDirs).toHaveLength(2);
    });
  });

  describe('matching by label when dir is not present', () => {
    it('should match by label when dir is not present', () => {
      const a = {
        repo1: {
          packageIndividual: [{ label: 'Package A', composerJsonPath: 'old/path.json' }]
        }
      };
      const b = {
        repo1: {
          packageIndividual: [{ label: 'Package A', composerJsonPath: 'new/path.json' }]
        }
      };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].packageIndividual).toHaveLength(1);
      // packageDefinition only supports specific properties: label, dir, composerJsonPath, emptyDirsToAdd, excludes
      expect(result[0].packageIndividual[0].composerJsonPath).toBe('new/path.json');
    });

    it('should add new item when label does not match', () => {
      const a = {
        repo1: {
          packageIndividual: [{ label: 'Package A' }]
        }
      };
      const b = {
        repo1: {
          packageIndividual: [{ label: 'Package B' }]
        }
      };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].packageIndividual).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty source config', () => {
      const a = {};
      const b = { repo1: { repoUrl: 'url1' } };
      const result = mergeBuildConfigs(a, b);

      expect(result).toHaveLength(1);
    });

    it('should handle missing array properties in a', () => {
      const a = { repo1: {} };
      const b = { repo1: { packageDirs: [{ dir: 'app' }] } };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].packageDirs).toHaveLength(1);
    });

    it('should handle missing array properties in b', () => {
      const a = { repo1: { packageDirs: [{ dir: 'app', label: 'App' }] } };
      const b = { repo1: { repoUrl: 'url2' } };
      const result = mergeBuildConfigs(a, b);

      expect(result[0].packageDirs).toHaveLength(1);
      expect(result[0].repoUrl).toBe('url2');
    });

    it('should handle repo in b but not in a', () => {
      const a = { repo1: { repoUrl: 'url1' } };
      const b = { repo2: { repoUrl: 'url2' } };
      const result = mergeBuildConfigs(a, b);

      // Only repos from b are included in result
      expect(result).toHaveLength(1);
      expect(result[0].repoUrl).toBe('url2');
    });

    it('should create repositoryBuildDefinition instances', () => {
      const repositoryBuildDefinition = require('../../src/type/repository-build-definition');
      const a = {};
      const b = { repo1: { repoUrl: 'url1' } };
      const result = mergeBuildConfigs(a, b);

      expect(result[0]).toBeInstanceOf(repositoryBuildDefinition);
    });
  });

  describe('complex merge scenarios', () => {
    it('should handle complex merge with multiple array types', () => {
      const a = {
        'composer-root-update-plugin': {
          repoUrl: 'https://github.com/mage-os/mirror-composer-root-update-plugin.git',
          packageDirs: [{ label: 'Community Edition Sample Data', dir: 'app/code/Magento' }],
          packageIndividual: [{ label: 'Magento Composer Root Update Plugin', dir: 'src/Magento/ComposerRootUpdatePlugin' }],
          packageMetaFromDirs: [],
        }
      };
      const b = {
        'composer-root-update-plugin': {
          repoUrl: 'https://github.com/mage-os/mageos-composer-root-update-plugin.git',
          ref: 'develop',
          packageDirs: [
            {
              label: 'Community Edition Sample Data',
              composerJsonPath: 'custom/composer.json'
            }
          ],
        }
      };
      const result = mergeBuildConfigs(a, b);

      expect(result).toHaveLength(1);
      expect(result[0].repoUrl).toBe('https://github.com/mage-os/mageos-composer-root-update-plugin.git');
      expect(result[0].ref).toBe('develop');
      expect(result[0].packageDirs).toHaveLength(1);
      expect(result[0].packageDirs[0].label).toBe('Community Edition Sample Data');
      expect(result[0].packageDirs[0].dir).toBe('app/code/Magento');
      // packageDefinition only supports specific properties: label, dir, composerJsonPath, emptyDirsToAdd, excludes
      expect(result[0].packageDirs[0].composerJsonPath).toBe('custom/composer.json');
      expect(result[0].packageIndividual).toHaveLength(1);
    });

    it('should handle merge with items updated by dir, new items added, and label changes', () => {
      const a = {
        'commerce-data-export': {
          repoUrl: 'https://github.com/mage-os/mirror-commerce-data-export.git',
          packageIndividual: [
            {
              label: 'Community Edition Sample Data Media',
              dir: 'pub/media',
            },
            {
              label: 'Package Individual Dummy',
              dir: 'foo',
              excludes: [],
            }
          ]
        }
      };
      const b = {
        'commerce-data-export': {
          repoUrl: 'https://github.com/mage-os/mageos-commerce-data-export.git',
          ref: 'main',
          packageIndividual: [
            {
              dir: 'foo',
              composerJsonPath: 'bar/buz/composer.json'
            },
            {
              label: 'BAZ',
              dir: 'pub/media',
            },
            {
              label: 'Moo',
              dir: 'moo',
            }
          ]
        }
      };
      const result = mergeBuildConfigs(a, b);

      expect(result).toHaveLength(1);
      expect(result[0].repoUrl).toBe('https://github.com/mage-os/mageos-commerce-data-export.git');
      expect(result[0].ref).toBe('main');
      expect(result[0].packageIndividual).toHaveLength(3);

      // Find items by dir
      const pubMediaItem = result[0].packageIndividual.find(p => p.dir === 'pub/media');
      const fooItem = result[0].packageIndividual.find(p => p.dir === 'foo');
      const mooItem = result[0].packageIndividual.find(p => p.dir === 'moo');

      expect(pubMediaItem.label).toBe('BAZ');
      expect(fooItem.label).toBe('Package Individual Dummy');
      expect(fooItem.composerJsonPath).toBe('bar/buz/composer.json');
      expect(fooItem.excludes).toEqual([]);
      expect(mooItem.label).toBe('Moo');
    });
  });
});
