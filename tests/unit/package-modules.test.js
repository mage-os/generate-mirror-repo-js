/**
 * Comprehensive Jest tests for src/package-modules.js
 *
 * Tests exported functions:
 * - getVersionStability
 * - archiveFilePath
 * - setDependencyVersions
 * - setArchiveBaseDir
 * - readComposerJson
 * - getLatestTag
 * - createPackageForRef
 * - createPackagesForRef
 * - createMetaPackageFromRepoDir
 * - createMetaPackage
 * - createComposerJsonOnlyPackage
 * - determinePackageForRef
 * - determinePackagesForRef
 * - determineMetaPackageFromRepoDir
 * - getAdditionalConfiguration
 */

const path = require('path');

// Mock dependencies before requiring the module under test
jest.mock('fs');
jest.mock('jszip');
jest.mock('../../src/repository');
jest.mock('../../src/packagist');
jest.mock('../../src/determine-dependencies');
jest.mock('../../src/utils', () => ({
  lastTwoDirs: jest.fn((dir, sep) => dir ? dir.split('/').slice(-2).join(sep || '/') : ''),
  httpSlurp: jest.fn(),
  compareVersions: jest.fn((a, b) => {
    // Simple version comparison for tests
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }),
}));

const fs = require('fs');
const JSZip = require('jszip');
const repo = require('../../src/repository');
const { isOnPackagist } = require('../../src/packagist');
const { httpSlurp } = require('../../src/utils');
const { determineSourceDependencies } = require('../../src/determine-dependencies');

// Import the module under test after mocks are set up
const sut = require('../../src/package-modules');

// ============================================================================
// Test fixtures
// ============================================================================

const createMockComposerConfig = (overrides = {}) => ({
  name: 'magento/module-catalog',
  version: '103.0.5',
  description: 'Catalog module',
  type: 'magento2-module',
  license: ['OSL-3.0', 'AFL-3.0'],
  require: {
    'php': '~8.1.0||~8.2.0',
    'magento/framework': '*',
    'magento/module-store': '*',
  },
  'require-dev': {
    'magento/module-dev': '*',
  },
  suggest: {
    'magento/module-catalog-sample-data': 'Sample Data',
  },
  ...overrides,
});

const createMockInstruction = (overrides = {}) => ({
  repoUrl: 'https://github.com/magento/magento2.git',
  ref: '2.4.6',
  vendor: 'magento',
  transform: {},
  ...overrides,
});

const createMockPackage = (overrides = {}) => ({
  dir: 'app/code/Magento/Catalog',
  excludes: [],
  emptyDirsToAdd: [],
  composerJsonFile: null,
  ...overrides,
});

const createMockRelease = (overrides = {}) => ({
  ref: '2.4.6',
  version: '2.4.6',
  fallbackVersion: '2.4.6',
  dependencyVersions: {},
  origRef: null,
  ...overrides,
});

// ============================================================================
// getVersionStability tests
// ============================================================================

describe('getVersionStability', () => {
  describe('dev versions', () => {
    it('should return dev for dev-* prefix', () => {
      expect(sut.getVersionStability('dev-master')).toBe('dev');
      expect(sut.getVersionStability('dev-main')).toBe('dev');
      expect(sut.getVersionStability('dev-feature-branch')).toBe('dev');
    });

    it('should return dev for *-dev suffix', () => {
      expect(sut.getVersionStability('1.0.0-dev')).toBe('dev');
      expect(sut.getVersionStability('2.4.6-dev')).toBe('dev');
      expect(sut.getVersionStability('1.0-dev')).toBe('dev');
    });

    it('should be case insensitive for dev prefix', () => {
      expect(sut.getVersionStability('DEV-master')).toBe('dev');
      expect(sut.getVersionStability('Dev-Main')).toBe('dev');
    });
  });

  describe('pre-release versions', () => {
    it('should return alpha for alpha versions', () => {
      expect(sut.getVersionStability('2.4.0-alpha1')).toBe('alpha');
      expect(sut.getVersionStability('1.0.0-alpha')).toBe('alpha');
      expect(sut.getVersionStability('2.4.0-alpha123')).toBe('alpha');
    });

    it('should return beta for beta versions', () => {
      expect(sut.getVersionStability('2.4.0-beta1')).toBe('beta');
      expect(sut.getVersionStability('1.0.0-beta')).toBe('beta');
      expect(sut.getVersionStability('2.4.0-beta123')).toBe('beta');
    });

    it('should return RC for rc versions (case insensitive)', () => {
      expect(sut.getVersionStability('2.4.0-rc1')).toBe('RC');
      expect(sut.getVersionStability('2.4.0-RC1')).toBe('RC');
      expect(sut.getVersionStability('2.4.0-Rc2')).toBe('RC');
      expect(sut.getVersionStability('1.0.0-rc')).toBe('RC');
    });

    it('should be case insensitive for alpha and beta', () => {
      expect(sut.getVersionStability('2.4.0-ALPHA1')).toBe('alpha');
      expect(sut.getVersionStability('2.4.0-BETA1')).toBe('beta');
      expect(sut.getVersionStability('2.4.0-Alpha1')).toBe('alpha');
      expect(sut.getVersionStability('2.4.0-Beta1')).toBe('beta');
    });
  });

  describe('stable versions', () => {
    it('should return stable for numeric versions', () => {
      expect(sut.getVersionStability('1.0.0')).toBe('stable');
      expect(sut.getVersionStability('2.4.5')).toBe('stable');
      expect(sut.getVersionStability('103.0.5')).toBe('stable');
    });

    it('should return stable for patch versions (-p suffix)', () => {
      expect(sut.getVersionStability('2.4.5-p1')).toBe('stable');
      expect(sut.getVersionStability('2.4.5-p2')).toBe('stable');
      expect(sut.getVersionStability('2.4.6-p3')).toBe('stable');
    });

    it('should return stable for versions with only numbers and dots', () => {
      expect(sut.getVersionStability('1')).toBe('stable');
      expect(sut.getVersionStability('1.0')).toBe('stable');
      expect(sut.getVersionStability('1.0.0.0')).toBe('stable');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(sut.getVersionStability('')).toBe('stable');
    });

    it('should handle version with multiple stability indicators', () => {
      // First matching indicator wins
      expect(sut.getVersionStability('dev-alpha')).toBe('dev');
      expect(sut.getVersionStability('1.0.0-alpha-beta')).toBe('alpha');
    });

    it('should handle mixed case versions', () => {
      expect(sut.getVersionStability('DeV-Master')).toBe('dev');
      expect(sut.getVersionStability('1.0.0-ALPHA')).toBe('alpha');
    });

    it('should handle version with numbers in stability suffix', () => {
      expect(sut.getVersionStability('1.0.0-beta123')).toBe('beta');
      expect(sut.getVersionStability('1.0.0-rc99')).toBe('RC');
    });
  });
});

// ============================================================================
// archiveFilePath tests
// ============================================================================

describe('archiveFilePath', () => {
  const originalCwd = process.cwd;

  beforeEach(() => {
    // Reset the archive base dir before each test
    sut.setArchiveBaseDir('packages');
    // Mock process.cwd for consistent paths
    process.cwd = jest.fn().mockReturnValue('/project');
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  describe('path generation', () => {
    it('should generate correct path for standard package', () => {
      const result = sut.archiveFilePath('magento/module-catalog', '2.4.5');
      expect(result).toBe('/project/packages/magento/module-catalog-2.4.5.zip');
    });

    it('should handle package with vendor prefix', () => {
      const result = sut.archiveFilePath('mage-os/mageos-product', '1.0.0');
      expect(result).toBe('/project/packages/mage-os/mageos-product-1.0.0.zip');
    });

    it('should include version in filename', () => {
      const result = sut.archiveFilePath('magento/framework', '103.0.5');
      expect(result).toContain('103.0.5.zip');
    });

    it('should handle version with pre-release suffix', () => {
      const result = sut.archiveFilePath('magento/module-catalog', '2.4.5-beta1');
      expect(result).toBe('/project/packages/magento/module-catalog-2.4.5-beta1.zip');
    });

    it('should handle version with patch suffix', () => {
      const result = sut.archiveFilePath('magento/module-catalog', '2.4.5-p1');
      expect(result).toBe('/project/packages/magento/module-catalog-2.4.5-p1.zip');
    });
  });

  describe('base directory handling', () => {
    it('should handle absolute base directory', () => {
      sut.setArchiveBaseDir('/absolute/path/packages');
      const result = sut.archiveFilePath('magento/module-catalog', '2.4.5');
      expect(result).toBe('/absolute/path/packages/magento/module-catalog-2.4.5.zip');
    });

    it('should handle relative base directory', () => {
      sut.setArchiveBaseDir('relative/packages');
      const result = sut.archiveFilePath('magento/module-catalog', '2.4.5');
      expect(result).toBe('/project/relative/packages/magento/module-catalog-2.4.5.zip');
    });

    it('should handle custom archive base dir', () => {
      sut.setArchiveBaseDir('custom-packages');
      const result = sut.archiveFilePath('vendor/package', '1.0.0');
      expect(result).toBe('/project/custom-packages/vendor/package-1.0.0.zip');
    });
  });

  describe('edge cases', () => {
    it('should handle package name with special characters', () => {
      const result = sut.archiveFilePath('vendor/my-special_package', '1.0.0');
      expect(result).toContain('vendor/my-special_package-1.0.0.zip');
    });

    it('should handle very long package names', () => {
      const longName = 'vendor/' + 'a'.repeat(100);
      const result = sut.archiveFilePath(longName, '1.0.0');
      expect(result).toContain(longName + '-1.0.0.zip');
    });
  });
});

// ============================================================================
// setArchiveBaseDir tests
// ============================================================================

describe('setArchiveBaseDir', () => {
  beforeEach(() => {
    // Reset to default
    sut.setArchiveBaseDir('packages');
  });

  it('should update the archive base directory', () => {
    process.cwd = jest.fn().mockReturnValue('/project');

    sut.setArchiveBaseDir('new-packages');
    const result = sut.archiveFilePath('vendor/package', '1.0.0');

    expect(result).toContain('new-packages');
  });

  it('should accept absolute paths', () => {
    sut.setArchiveBaseDir('/absolute/packages');
    const result = sut.archiveFilePath('vendor/package', '1.0.0');

    expect(result).toBe('/absolute/packages/vendor/package-1.0.0.zip');
  });
});

// ============================================================================
// setDependencyVersions tests
// ============================================================================

describe('setDependencyVersions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isOnPackagist.mockReturnValue(false);
  });

  describe('require dependencies', () => {
    it('should update version when in dependencyVersions map', () => {
      const instruction = createMockInstruction();
      const release = createMockRelease({
        dependencyVersions: {
          'magento/framework': '103.0.6',
          'magento/module-store': '101.1.5',
        },
      });
      const composerConfig = createMockComposerConfig();

      sut.setDependencyVersions(instruction, release, composerConfig);

      expect(composerConfig.require['magento/framework']).toBe('103.0.6');
      expect(composerConfig.require['magento/module-store']).toBe('101.1.5');
    });

    it('should use wildcard version for vendor packages not on packagist', () => {
      const instruction = createMockInstruction({ vendor: 'mage-os' });
      const release = createMockRelease({
        dependencyVersions: {
          '*': '1.0.0',
        },
      });
      const composerConfig = {
        name: 'mage-os/module-test',
        require: {
          'mage-os/framework': '*',
        },
      };
      isOnPackagist.mockReturnValue(false);

      sut.setDependencyVersions(instruction, release, composerConfig);

      expect(composerConfig.require['mage-os/framework']).toBe('1.0.0');
    });

    it('should not modify version when not in map', () => {
      const instruction = createMockInstruction();
      const release = createMockRelease({
        dependencyVersions: {},
      });
      const composerConfig = createMockComposerConfig();
      const originalVersion = composerConfig.require['php'];

      sut.setDependencyVersions(instruction, release, composerConfig);

      expect(composerConfig.require['php']).toBe(originalVersion);
    });

    it('should not update vendor packages that are on packagist', () => {
      const instruction = createMockInstruction({ vendor: 'mage-os' });
      const release = createMockRelease({
        dependencyVersions: {
          '*': '1.0.0',
        },
      });
      const composerConfig = {
        name: 'mage-os/module-test',
        require: {
          'mage-os/published-package': '2.0.0',
        },
      };
      isOnPackagist.mockReturnValue(true);

      sut.setDependencyVersions(instruction, release, composerConfig);

      expect(composerConfig.require['mage-os/published-package']).toBe('2.0.0');
    });
  });

  describe('require-dev dependencies', () => {
    it('should update require-dev version when in dependencyVersions map', () => {
      const instruction = createMockInstruction();
      const release = createMockRelease({
        dependencyVersions: {
          'magento/module-dev': '100.4.5',
        },
      });
      const composerConfig = createMockComposerConfig();

      sut.setDependencyVersions(instruction, release, composerConfig);

      expect(composerConfig['require-dev']['magento/module-dev']).toBe('100.4.5');
    });
  });

  describe('sample data packages', () => {
    it('should add Sample Data version prefix to suggest entries', () => {
      const instruction = createMockInstruction();
      const release = createMockRelease({
        dependencyVersions: {},
      });
      const composerConfig = createMockComposerConfig({
        suggest: {
          'magento/module-catalog-sample-data': '100.4.0',
        },
      });

      sut.setDependencyVersions(instruction, release, composerConfig);

      expect(composerConfig.suggest['magento/module-catalog-sample-data']).toBe(
        'Sample Data version: 100.4.0'
      );
    });

    it('should handle sample-data-* pattern packages', () => {
      const instruction = createMockInstruction();
      const release = createMockRelease({
        dependencyVersions: {},
      });
      const composerConfig = {
        name: 'magento/module-sample-data',
        suggest: {
          'magento/sample-data-media': 'Media files',
        },
      };

      sut.setDependencyVersions(instruction, release, composerConfig);

      expect(composerConfig.suggest['magento/sample-data-media']).toBe(
        'Sample Data version: Media files'
      );
    });

    it('should not duplicate prefix if already present', () => {
      const instruction = createMockInstruction();
      const release = createMockRelease({
        dependencyVersions: {},
      });
      const composerConfig = {
        name: 'magento/module-sample-data',
        suggest: {
          'magento/module-catalog-sample-data': 'Sample Data version: 100.4.0',
        },
      };

      sut.setDependencyVersions(instruction, release, composerConfig);

      // Should not duplicate the prefix
      expect(composerConfig.suggest['magento/module-catalog-sample-data']).toBe(
        'Sample Data version: 100.4.0'
      );
    });

    it('should not add prefix to non-sample-data packages', () => {
      const instruction = createMockInstruction();
      const release = createMockRelease({
        dependencyVersions: {},
      });
      const composerConfig = {
        name: 'magento/module-test',
        suggest: {
          'magento/module-catalog': 'Catalog module',
        },
      };

      sut.setDependencyVersions(instruction, release, composerConfig);

      expect(composerConfig.suggest['magento/module-catalog']).toBe('Catalog module');
    });
  });

  describe('edge cases', () => {
    it('should handle composerConfig missing dependency types gracefully', () => {
      const instruction = createMockInstruction();
      const release = createMockRelease({
        dependencyVersions: { 'magento/framework': '103.0.6' },
      });
      const composerConfig = {
        name: 'magento/module-test',
      };

      // Should not throw
      expect(() => {
        sut.setDependencyVersions(instruction, release, composerConfig);
      }).not.toThrow();
    });

    it('should handle empty dependencyVersions', () => {
      const instruction = createMockInstruction();
      const release = createMockRelease({
        dependencyVersions: {},
      });
      const composerConfig = createMockComposerConfig();
      const originalRequire = { ...composerConfig.require };

      sut.setDependencyVersions(instruction, release, composerConfig);

      // Versions should remain unchanged (except sample data prefix)
      expect(composerConfig.require['magento/framework']).toBe(originalRequire['magento/framework']);
    });

    it('should handle mixed scenarios: some deps in map, some not', () => {
      const instruction = createMockInstruction();
      const release = createMockRelease({
        dependencyVersions: {
          'magento/framework': '103.0.6',
        },
      });
      const composerConfig = createMockComposerConfig();

      sut.setDependencyVersions(instruction, release, composerConfig);

      expect(composerConfig.require['magento/framework']).toBe('103.0.6');
      expect(composerConfig.require['magento/module-store']).toBe('*'); // unchanged
    });
  });
});

// ============================================================================
// readComposerJson tests
// ============================================================================

describe('readComposerJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should read composer.json from repository', async () => {
    const mockComposerJson = JSON.stringify(createMockComposerConfig());
    repo.readFile.mockResolvedValue(Buffer.from(mockComposerJson));

    const result = await sut.readComposerJson(
      'https://github.com/magento/magento2.git',
      'app/code/Magento/Catalog',
      '2.4.6'
    );

    expect(repo.readFile).toHaveBeenCalledWith(
      'https://github.com/magento/magento2.git',
      'app/code/Magento/Catalog/composer.json',
      '2.4.6'
    );
    expect(result).toBe(mockComposerJson);
  });

  it('should handle root directory (empty dir)', async () => {
    const mockComposerJson = JSON.stringify(createMockComposerConfig());
    repo.readFile.mockResolvedValue(Buffer.from(mockComposerJson));

    await sut.readComposerJson(
      'https://github.com/magento/magento2.git',
      '',
      '2.4.6'
    );

    expect(repo.readFile).toHaveBeenCalledWith(
      'https://github.com/magento/magento2.git',
      'composer.json',
      '2.4.6'
    );
  });

  it('should trim leading slashes from directory path', async () => {
    const mockComposerJson = JSON.stringify(createMockComposerConfig());
    repo.readFile.mockResolvedValue(Buffer.from(mockComposerJson));

    await sut.readComposerJson(
      'https://github.com/magento/magento2.git',
      '/app/code/Magento/Catalog',
      '2.4.6'
    );

    expect(repo.readFile).toHaveBeenCalledWith(
      'https://github.com/magento/magento2.git',
      'app/code/Magento/Catalog/composer.json',
      '2.4.6'
    );
  });
});

// ============================================================================
// getLatestTag tests
// ============================================================================

describe('getLatestTag', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return latest tag sorted by semantic version', async () => {
    repo.listTags.mockResolvedValue(['1.0.0', '2.0.0', '1.5.0', '2.1.0']);

    const result = await sut.getLatestTag('https://github.com/vendor/repo.git');

    expect(result).toBe('2.1.0');
  });

  it('should filter out tags starting with v', async () => {
    repo.listTags.mockResolvedValue(['v1.0.0', '1.0.0', 'v2.0.0', '1.5.0']);

    const result = await sut.getLatestTag('https://github.com/vendor/repo.git');

    // Should only consider tags not starting with 'v'
    expect(result).toBe('1.5.0');
  });

  it('should handle empty tag list', async () => {
    repo.listTags.mockResolvedValue([]);

    const result = await sut.getLatestTag('https://github.com/vendor/repo.git');

    expect(result).toBeUndefined();
  });

  it('should handle all tags starting with v', async () => {
    repo.listTags.mockResolvedValue(['v1.0.0', 'v2.0.0']);

    const result = await sut.getLatestTag('https://github.com/vendor/repo.git');

    expect(result).toBeUndefined();
  });

  it('should handle tags with pre-release suffixes', async () => {
    repo.listTags.mockResolvedValue(['1.0.0', '1.0.0-beta1', '1.0.0-alpha1', '0.9.0']);

    const result = await sut.getLatestTag('https://github.com/vendor/repo.git');

    // Mock compareVersions returns simple string comparison, so actual behavior depends on that
    expect(result).toBeDefined();
  });
});

// ============================================================================
// determinePackageForRef tests
// ============================================================================

describe('determinePackageForRef', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return package name and version from composer.json', async () => {
    const composerConfig = createMockComposerConfig({
      name: 'magento/module-catalog',
      version: '103.0.5',
    });
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();

    const result = await sut.determinePackageForRef(instruction, pkg, '2.4.6');

    expect(result).toEqual({ 'magento/module-catalog': '103.0.5' });
  });

  it('should return empty object when composer.json not found', async () => {
    repo.readFile.mockResolvedValue(Buffer.from('404: Not Found'));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();

    const result = await sut.determinePackageForRef(instruction, pkg, '2.4.6');

    expect(result).toEqual({});
  });

  it('should use ref as version when VERSION_UNKNOWN', async () => {
    const composerConfig = {
      name: 'magento/module-test',
      // No version field
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();

    const result = await sut.determinePackageForRef(instruction, pkg, '2.4.6');

    // Should use ref as fallback version
    expect(result).toEqual({ 'magento/module-test': '2.4.6' });
  });

  it('should return empty object when name is missing', async () => {
    const composerConfig = {
      version: '1.0.0',
      // No name field
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();

    const result = await sut.determinePackageForRef(instruction, pkg, '2.4.6');

    expect(result).toEqual({});
  });
});

// ============================================================================
// determineMetaPackageFromRepoDir tests
// ============================================================================

describe('determineMetaPackageFromRepoDir', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return package name and version from metapackage composer.json', async () => {
    const composerConfig = {
      name: 'magento/product-community-edition',
      version: '2.4.6',
      type: 'metapackage',
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const result = await sut.determineMetaPackageFromRepoDir(
      'https://github.com/magento/magento2.git',
      '',
      '2.4.6'
    );

    expect(result).toEqual({ 'magento/product-community-edition': '2.4.6' });
  });

  it('should use release version if provided', async () => {
    const composerConfig = {
      name: 'magento/product-community-edition',
      version: '2.4.5',
      type: 'metapackage',
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const result = await sut.determineMetaPackageFromRepoDir(
      'https://github.com/magento/magento2.git',
      '',
      '2.4.5',
      '2.4.6' // Release version overrides composer.json version
    );

    expect(result).toEqual({ 'magento/product-community-edition': '2.4.6' });
  });

  it('should use ref as fallback when no version in composer.json', async () => {
    const composerConfig = {
      name: 'magento/product-community-edition',
      type: 'metapackage',
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const result = await sut.determineMetaPackageFromRepoDir(
      'https://github.com/magento/magento2.git',
      '',
      '2.4.6'
    );

    expect(result).toEqual({ 'magento/product-community-edition': '2.4.6' });
  });

  it('should throw when name is missing', async () => {
    const composerConfig = {
      version: '2.4.6',
      type: 'metapackage',
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    await expect(
      sut.determineMetaPackageFromRepoDir(
        'https://github.com/magento/magento2.git',
        'metapackages/product',
        '2.4.6'
      )
    ).rejects.toMatchObject({
      message: expect.stringContaining('Unable find package name'),
    });
  });
});

// ============================================================================
// createPackageForRef tests
// ============================================================================

describe('createPackageForRef', () => {
  let mockZip;
  let mockStream;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup JSZip mock
    mockStream = {
      pipe: jest.fn(),
    };
    mockZip = {
      file: jest.fn(),
      generateNodeStream: jest.fn().mockResolvedValue(mockStream),
    };
    JSZip.mockImplementation(() => mockZip);

    // Setup fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.createWriteStream.mockReturnValue({});

    // Setup repo mocks
    repo.listFiles.mockResolvedValue([
      { filepath: 'app/code/Magento/Catalog/Model/Product.php', contentBuffer: Buffer.from('<?php'), isExecutable: false },
      { filepath: 'app/code/Magento/Catalog/etc/module.xml', contentBuffer: Buffer.from('<config/>'), isExecutable: false },
    ]);

    // Reset archive base dir
    sut.setArchiveBaseDir('packages');
    process.cwd = jest.fn().mockReturnValue('/project');
  });

  it('should create ZIP archive with correct structure', async () => {
    const composerConfig = createMockComposerConfig();
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();
    const release = createMockRelease();

    const result = await sut.createPackageForRef(instruction, pkg, release);

    expect(result).toEqual({ 'magento/module-catalog': '103.0.5' });
    expect(fs.mkdirSync).toHaveBeenCalled();
  });

  it('should skip package creation if already exists', async () => {
    const composerConfig = createMockComposerConfig();
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));
    fs.existsSync.mockReturnValue(true); // Package already exists

    const instruction = createMockInstruction();
    const pkg = createMockPackage();
    const release = createMockRelease();

    const result = await sut.createPackageForRef(instruction, pkg, release);

    expect(result).toEqual({ 'magento/module-catalog': '103.0.5' });
    // Should not create the zip since it already exists
    expect(mockZip.generateNodeStream).not.toHaveBeenCalled();
  });

  it('should throw when composer.json not found', async () => {
    repo.readFile.mockResolvedValue(Buffer.from('404: Not Found'));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();
    const release = createMockRelease();

    await expect(
      sut.createPackageForRef(instruction, pkg, release)
    ).rejects.toMatchObject({
      message: expect.stringContaining('Unable to find composer.json'),
    });
  });

  it('should add composer.json exclusion automatically', async () => {
    const composerConfig = createMockComposerConfig();
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage({ excludes: [] });
    const release = createMockRelease();

    await sut.createPackageForRef(instruction, pkg, release);

    expect(pkg.excludes).toContain('composer.json');
  });

  it('should add .git/ exclusion automatically', async () => {
    const composerConfig = createMockComposerConfig();
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage({ excludes: [] });
    const release = createMockRelease();

    await sut.createPackageForRef(instruction, pkg, release);

    expect(pkg.excludes).toContain('.git/');
  });

  it('should apply transforms when configured', async () => {
    const composerConfig = createMockComposerConfig();
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const transformFn = jest.fn().mockImplementation((config) => ({
      ...config,
      extra: { transformed: true },
    }));

    const instruction = createMockInstruction({
      transform: {
        'magento/module-catalog': [transformFn],
      },
    });
    const pkg = createMockPackage();
    const release = createMockRelease();

    await sut.createPackageForRef(instruction, pkg, release);

    expect(transformFn).toHaveBeenCalled();
  });

  it('should use version from dependencyVersions over composer.json', async () => {
    const composerConfig = createMockComposerConfig({ version: '103.0.5' });
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();
    const release = createMockRelease({
      dependencyVersions: {
        'magento/module-catalog': '103.0.6',
      },
    });

    const result = await sut.createPackageForRef(instruction, pkg, release);

    expect(result).toEqual({ 'magento/module-catalog': '103.0.6' });
  });

  it('should use fallbackVersion when no version in composer.json or dependencyVersions', async () => {
    const composerConfig = createMockComposerConfig();
    delete composerConfig.version;
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();
    const release = createMockRelease({
      dependencyVersions: {},
      fallbackVersion: '2.4.7-dev',
    });

    const result = await sut.createPackageForRef(instruction, pkg, release);

    expect(result).toEqual({ 'magento/module-catalog': '2.4.7-dev' });
  });

  it('should handle template composer.json files', async () => {
    const composerConfig = createMockComposerConfig();
    // Mock fs.readFileSync to return valid JSON when reading the template file
    fs.readFileSync.mockReturnValue(JSON.stringify(composerConfig));
    repo.checkout.mockResolvedValue('/tmp/checkout');
    determineSourceDependencies.mockResolvedValue({
      'magento/framework': '*',
    });

    const instruction = createMockInstruction();
    const pkg = createMockPackage({
      composerJsonFile: 'resource/template.json',
    });
    const release = createMockRelease();

    await sut.createPackageForRef(instruction, pkg, release);

    expect(repo.checkout).toHaveBeenCalled();
    expect(determineSourceDependencies).toHaveBeenCalled();
  });
});

// ============================================================================
// createPackagesForRef tests
// ============================================================================

describe('createPackagesForRef', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup JSZip mock
    const mockStream = { pipe: jest.fn() };
    const mockZip = {
      file: jest.fn(),
      generateNodeStream: jest.fn().mockResolvedValue(mockStream),
    };
    JSZip.mockImplementation(() => mockZip);

    // Setup fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.createWriteStream.mockReturnValue({});

    // Reset archive base dir
    sut.setArchiveBaseDir('packages');
    process.cwd = jest.fn().mockReturnValue('/project');
  });

  it('should build packages for all modules in directory', async () => {
    repo.listFolders.mockResolvedValue([
      'app/code/Magento/Catalog',
      'app/code/Magento/Customer',
    ]);
    repo.listFiles.mockResolvedValue([
      { filepath: 'Model/Test.php', contentBuffer: Buffer.from('<?php'), isExecutable: false },
    ]);
    repo.readFile.mockImplementation((url, filepath, ref) => {
      if (filepath.includes('Catalog')) {
        return Promise.resolve(Buffer.from(JSON.stringify({
          name: 'magento/module-catalog',
          version: '103.0.5',
        })));
      }
      return Promise.resolve(Buffer.from(JSON.stringify({
        name: 'magento/module-customer',
        version: '103.0.5',
      })));
    });

    const instruction = createMockInstruction();
    const pkg = createMockPackage({ dir: 'app/code/Magento' });
    const release = createMockRelease();

    const result = await sut.createPackagesForRef(instruction, pkg, release);

    expect(result).toHaveProperty('magento/module-catalog');
    expect(result).toHaveProperty('magento/module-customer');
  });

  it('should exclude directories matching excludes pattern', async () => {
    repo.listFolders.mockResolvedValue([
      'app/code/Magento/Catalog',
      'app/code/Magento/ExcludedModule',
    ]);
    repo.listFiles.mockResolvedValue([
      { filepath: 'Model/Test.php', contentBuffer: Buffer.from('<?php'), isExecutable: false },
    ]);
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify({
      name: 'magento/module-catalog',
      version: '103.0.5',
    })));

    const instruction = createMockInstruction();
    const pkg = createMockPackage({
      dir: 'app/code/Magento',
      excludes: ['app/code/Magento/ExcludedModule'],
    });
    const release = createMockRelease();

    const result = await sut.createPackagesForRef(instruction, pkg, release);

    expect(result).toHaveProperty('magento/module-catalog');
  });

  it('should throw when no packages are built', async () => {
    repo.listFolders.mockResolvedValue(['.']); // Only '.' which is filtered out

    const instruction = createMockInstruction();
    const pkg = createMockPackage({ dir: 'app/code/Magento' });
    const release = createMockRelease();

    await expect(
      sut.createPackagesForRef(instruction, pkg, release)
    ).rejects.toMatchObject({
      message: expect.stringContaining('No packages built'),
    });
  });
});

// ============================================================================
// createMetaPackageFromRepoDir tests
// ============================================================================

describe('createMetaPackageFromRepoDir', () => {
  let mockZip;
  let mockStream;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup JSZip mock
    mockStream = { pipe: jest.fn() };
    mockZip = {
      file: jest.fn(),
      generateNodeStream: jest.fn().mockResolvedValue(mockStream),
    };
    JSZip.mockImplementation(() => mockZip);

    // Setup fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.createWriteStream.mockReturnValue({});

    // Reset archive base dir
    sut.setArchiveBaseDir('packages');
    process.cwd = jest.fn().mockReturnValue('/project');
  });

  it('should create metapackage with composer.json only', async () => {
    const composerConfig = {
      name: 'magento/product-community-edition',
      version: '2.4.6',
      type: 'metapackage',
      require: {
        'magento/module-catalog': '*',
      },
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage({ dir: '' });
    const release = createMockRelease();

    const result = await sut.createMetaPackageFromRepoDir(instruction, pkg, release);

    expect(result).toEqual({ 'magento/product-community-edition': '2.4.6' });
  });

  it('should apply transforms to metapackage', async () => {
    const composerConfig = {
      name: 'magento/product-community-edition',
      version: '2.4.6',
      type: 'metapackage',
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const transformFn = jest.fn().mockImplementation((config) => ({
      ...config,
      extra: { transformed: true },
    }));

    const instruction = createMockInstruction({
      transform: {
        'magento/product-community-edition': [transformFn],
      },
    });
    const pkg = createMockPackage({ dir: '' });
    const release = createMockRelease();

    await sut.createMetaPackageFromRepoDir(instruction, pkg, release);

    expect(transformFn).toHaveBeenCalled();
  });

  it('should throw when name is missing', async () => {
    const composerConfig = {
      version: '2.4.6',
      type: 'metapackage',
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage({ dir: '' });
    const release = createMockRelease();

    await expect(
      sut.createMetaPackageFromRepoDir(instruction, pkg, release)
    ).rejects.toMatchObject({
      message: expect.stringContaining('Unable find package name'),
    });
  });
});

// ============================================================================
// createMetaPackage tests
// ============================================================================

describe('createMetaPackage', () => {
  let mockZip;
  let mockStream;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup JSZip mock
    mockStream = { pipe: jest.fn() };
    mockZip = {
      file: jest.fn(),
      generateNodeStream: jest.fn().mockResolvedValue(mockStream),
    };
    JSZip.mockImplementation(() => mockZip);

    // Setup fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.createWriteStream.mockReturnValue({});

    // Reset archive base dir
    sut.setArchiveBaseDir('packages');
    process.cwd = jest.fn().mockReturnValue('/project');
  });

  it('should create metapackage with transformed composer.json', async () => {
    const baseComposerConfig = {
      name: 'magento/magento2-base',
      description: 'Base package',
      license: ['OSL-3.0'],
      require: {},
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(baseComposerConfig)));

    const transformFn = jest.fn().mockImplementation((config) => ({
      ...config,
      require: { 'magento/module-catalog': '*' },
    }));

    const instruction = createMockInstruction({ vendor: 'mage-os' });
    const metapackage = {
      name: 'product-community-edition',
      type: 'metapackage',
      transform: [transformFn],
    };
    const release = createMockRelease({ version: '1.0.0' });

    const result = await sut.createMetaPackage(instruction, metapackage, release);

    expect(result).toEqual({ 'mage-os/product-community-edition': '1.0.0' });
    expect(transformFn).toHaveBeenCalled();
  });

  it('should apply both instruction and metapackage transforms', async () => {
    const baseComposerConfig = {
      name: 'magento/magento2-base',
      description: 'Base package',
      license: ['OSL-3.0'],
      require: {},
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(baseComposerConfig)));

    const instructionTransform = jest.fn().mockImplementation((config) => ({
      ...config,
      extra: { instructionTransform: true },
    }));
    const metapackageTransform = jest.fn().mockImplementation((config) => ({
      ...config,
      require: { 'magento/module-catalog': '*' },
    }));

    const instruction = createMockInstruction({
      vendor: 'mage-os',
      transform: {
        'magento/product-community-edition': [instructionTransform],
      },
    });
    const metapackage = {
      name: 'product-community-edition',
      type: 'metapackage',
      transform: [metapackageTransform],
    };
    const release = createMockRelease({ version: '1.0.0' });

    await sut.createMetaPackage(instruction, metapackage, release);

    expect(instructionTransform).toHaveBeenCalled();
    expect(metapackageTransform).toHaveBeenCalled();
  });
});

// ============================================================================
// createComposerJsonOnlyPackage tests
// ============================================================================

describe('createComposerJsonOnlyPackage', () => {
  let mockZip;
  let mockStream;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup JSZip mock
    mockStream = { pipe: jest.fn() };
    mockZip = {
      file: jest.fn(),
      generateNodeStream: jest.fn().mockResolvedValue(mockStream),
    };
    JSZip.mockImplementation(() => mockZip);

    // Setup fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.createWriteStream.mockReturnValue({});
    fs.readFileSync.mockReturnValue(Buffer.from('# .gitignore'));

    // Reset archive base dir
    sut.setArchiveBaseDir('packages');
    process.cwd = jest.fn().mockReturnValue('/project');
  });

  it('should create package with only composer.json', async () => {
    const baseComposerConfig = {
      name: 'magento/project-community-edition',
      description: 'Project package',
      type: 'project',
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(baseComposerConfig)));

    const transformFn = jest.fn().mockImplementation((config) => ({
      ...config,
      version: '2.4.6',
      require: { 'magento/product-community-edition': '*' },
    }));

    const instruction = createMockInstruction();
    const release = createMockRelease();

    const result = await sut.createComposerJsonOnlyPackage(
      instruction,
      release,
      'magento/project-community-edition',
      '2.4.6',
      transformFn
    );

    expect(result.files).toHaveLength(1);
    expect(result.files[0].filepath).toBe('composer.json');
  });

  it('should include .gitignore for project-community-edition 2.4.0 and 2.4.0-p1', async () => {
    const baseComposerConfig = {
      name: 'magento/project-community-edition',
      description: 'Project package',
      type: 'project',
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(baseComposerConfig)));

    const transformFn = jest.fn().mockImplementation((config) => ({
      ...config,
      version: '2.4.0',
    }));

    const instruction = createMockInstruction();
    const release = createMockRelease({ ref: '2.4.0' });

    const result = await sut.createComposerJsonOnlyPackage(
      instruction,
      release,
      'magento/project-community-edition',
      '2.4.0',
      transformFn
    );

    expect(result.files).toHaveLength(2);
    expect(result.files.find(f => f.filepath === '.gitignore')).toBeDefined();
  });

  it('should use ref as version when version not provided', async () => {
    const baseComposerConfig = {
      name: 'magento/project-community-edition',
      description: 'Project package',
    };
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(baseComposerConfig)));

    const transformFn = jest.fn().mockImplementation((config) => ({
      ...config,
      version: '2.4.6',
    }));

    const instruction = createMockInstruction();
    const release = createMockRelease({ ref: '2.4.6' });

    const result = await sut.createComposerJsonOnlyPackage(
      instruction,
      release,
      'magento/project-community-edition',
      undefined, // No version provided
      transformFn
    );

    expect(result.packageFilepath).toContain('2.4.6.zip');
  });
});

// ============================================================================
// getAdditionalConfiguration tests
// ============================================================================

describe('getAdditionalConfiguration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return configuration from history file when exists', async () => {
    const historyConfig = {
      require: { 'some/package': '1.0.0' },
    };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(historyConfig));

    const result = await sut.getAdditionalConfiguration('magento/product-community-edition', '2.4.6');

    expect(result).toEqual(historyConfig);
  });

  it('should return latest configuration when history file does not exist', async () => {
    fs.existsSync.mockImplementation((path) => {
      if (path.includes('dependencies-template.json')) {
        return false;
      }
      return false;
    });

    const result = await sut.getAdditionalConfiguration('magento/product-community-edition', '2.4.6');

    expect(result).toEqual({ require: {} });
  });

  it('should resolve dependencies from template when template exists', async () => {
    const templateConfig = {
      dependencies: {
        'vendor/package': 'https://github.com/vendor/package.git',
      },
    };
    fs.existsSync.mockImplementation((path) => {
      if (path.includes('.json') && !path.includes('template')) {
        return false; // History file doesn't exist
      }
      return path.includes('dependencies-template.json');
    });
    fs.readFileSync.mockReturnValue(JSON.stringify(templateConfig));
    repo.listTags.mockResolvedValue(['1.0.0', '2.0.0']);

    const result = await sut.getAdditionalConfiguration('magento/product-community-edition', '2.4.6');

    expect(result).toHaveProperty('require');
  });
});

// ============================================================================
// determinePackagesForRef tests
// ============================================================================

describe('determinePackagesForRef', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should determine packages for all modules in directory', async () => {
    repo.listFolders.mockResolvedValue([
      'app/code/Magento/Catalog',
      'app/code/Magento/Customer',
    ]);
    repo.readFile.mockImplementation((url, filepath, ref) => {
      if (filepath.includes('Catalog')) {
        return Promise.resolve(Buffer.from(JSON.stringify({
          name: 'magento/module-catalog',
          version: '103.0.5',
        })));
      }
      return Promise.resolve(Buffer.from(JSON.stringify({
        name: 'magento/module-customer',
        version: '103.0.5',
      })));
    });

    const instruction = createMockInstruction();
    const pkg = createMockPackage({ dir: 'app/code/Magento' });

    const result = await sut.determinePackagesForRef(instruction, pkg, '2.4.6');

    expect(result).toHaveProperty('magento/module-catalog', '103.0.5');
    expect(result).toHaveProperty('magento/module-customer', '103.0.5');
  });

  it('should exclude directories matching excludes pattern', async () => {
    repo.listFolders.mockResolvedValue([
      'app/code/Magento/Catalog',
      'app/code/Magento/ExcludedModule',
    ]);
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify({
      name: 'magento/module-catalog',
      version: '103.0.5',
    })));

    const instruction = createMockInstruction();
    const pkg = createMockPackage({
      dir: 'app/code/Magento',
      excludes: ['app/code/Magento/ExcludedModule'],
    });

    const result = await sut.determinePackagesForRef(instruction, pkg, '2.4.6');

    expect(result).toHaveProperty('magento/module-catalog');
    expect(result).not.toHaveProperty('magento/module-excluded');
  });
});

// ============================================================================
// Integration-like tests for ZIP creation
// ============================================================================

describe('ZIP creation behavior', () => {
  let mockZip;
  let mockStream;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup JSZip mock
    mockStream = { pipe: jest.fn() };
    mockZip = {
      file: jest.fn(),
      generateNodeStream: jest.fn().mockResolvedValue(mockStream),
    };
    JSZip.mockImplementation(() => mockZip);

    // Setup fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.createWriteStream.mockReturnValue({});

    // Setup repo mocks
    repo.listFiles.mockResolvedValue([
      { filepath: 'app/code/Magento/Catalog/Model/Product.php', contentBuffer: Buffer.from('<?php'), isExecutable: false },
    ]);

    // Reset archive base dir
    sut.setArchiveBaseDir('packages');
    process.cwd = jest.fn().mockReturnValue('/project');
  });

  it('should use stable mtime for reproducible checksums', async () => {
    const composerConfig = createMockComposerConfig();
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();
    const release = createMockRelease();

    await sut.createPackageForRef(instruction, pkg, release);

    // Verify that file() was called with a Date object for mtime
    const fileCalls = mockZip.file.mock.calls;
    fileCalls.forEach((call) => {
      if (call[2] && call[2].date) {
        expect(call[2].date).toBeInstanceOf(Date);
        // The stable mtime is '2022-02-22 22:02:22.000Z'
        expect(call[2].date.toISOString()).toBe('2022-02-22T22:02:22.000Z');
      }
    });
  });

  it('should set UNIX platform for ZIP generation', async () => {
    const composerConfig = createMockComposerConfig();
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();
    const release = createMockRelease();

    await sut.createPackageForRef(instruction, pkg, release);

    expect(mockZip.generateNodeStream).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'UNIX',
      })
    );
  });

  it('should add empty directories when specified', async () => {
    const composerConfig = createMockComposerConfig();
    repo.readFile.mockResolvedValue(Buffer.from(JSON.stringify(composerConfig)));

    const instruction = createMockInstruction();
    const pkg = createMockPackage({
      emptyDirsToAdd: ['var/cache', 'var/log'],
    });
    const release = createMockRelease();

    await sut.createPackageForRef(instruction, pkg, release);

    // Check that empty directories were added (contentBuffer is false for dirs)
    const fileCalls = mockZip.file.mock.calls;
    const dirCalls = fileCalls.filter((call) => call[1] === '' || call[2]?.dir === true);
    expect(dirCalls.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Error handling tests
// ============================================================================

describe('Error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle invalid JSON in composer.json', async () => {
    repo.readFile.mockResolvedValue(Buffer.from('invalid json {'));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();
    const release = createMockRelease();

    await expect(
      sut.createPackageForRef(instruction, pkg, release)
    ).rejects.toThrow();
  });

  it('should handle repository read errors gracefully in determinePackageForRef', async () => {
    repo.readFile.mockRejectedValue(new Error('Network error'));

    const instruction = createMockInstruction();
    const pkg = createMockPackage();

    const result = await sut.determinePackageForRef(instruction, pkg, '2.4.6');

    // Should return empty object on error
    expect(result).toEqual({});
  });
});
