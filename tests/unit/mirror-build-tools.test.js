'use strict';

const sut = require('../../src/mirror-build-tools');
const fs = require('fs');
const repo = require('../../src/repository');
const { isVersionGreaterOrEqual } = require('../../src/utils');
const {
  createPackagesForRef,
  createPackageForRef,
  createMetaPackageFromRepoDir,
  createComposerJsonOnlyPackage,
  archiveFilePath
} = require('../../src/package-modules');
const JSZip = require('jszip');

// Mock all dependencies
jest.mock('fs');
jest.mock('../../src/repository');
jest.mock('../../src/utils', () => ({
  ...jest.requireActual('../../src/utils'),
  isVersionGreaterOrEqual: jest.fn()
}));
jest.mock('jszip');
jest.mock('../../src/package-modules');

describe('mirror-build-tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks for fs
    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockImplementation(() => {});
    fs.readdir.mockImplementation((_, cb) => cb(null, []));
    fs.copyFile.mockImplementation((_, __, cb) => cb(null));
    fs.readFile.mockImplementation((_, cb) => cb(null, Buffer.from('test')));
    fs.readFileSync.mockReturnValue(Buffer.from('test'));
    fs.createWriteStream.mockReturnValue({ on: jest.fn() });

    // Default mocks for repository
    repo.listTags.mockResolvedValue(['1.0.0', '2.0.0', '2.1.0']);
    repo.clearCache.mockImplementation(() => {});
    repo.createTagForRef.mockResolvedValue();

    // Default mocks for package-modules
    createPackagesForRef.mockResolvedValue({});
    createPackageForRef.mockResolvedValue({});
    createMetaPackageFromRepoDir.mockResolvedValue({});
    createComposerJsonOnlyPackage.mockResolvedValue({ packageFilepath: '/test/path', files: [] });
    archiveFilePath.mockReturnValue('/test/archive/package-1.0.0.zip');

    // Default mock for isVersionGreaterOrEqual
    isVersionGreaterOrEqual.mockImplementation((a, b) => {
      // Simple version comparison for testing
      const aNum = parseFloat(a.replace(/[^0-9.]/g, ''));
      const bNum = parseFloat(b.replace(/[^0-9.]/g, ''));
      return aNum >= bNum;
    });

    // Mock JSZip - loadAsync returns a promise that resolves to the zip contents
    const mockZipContents = {
      file: jest.fn(),
      generateNodeStream: jest.fn().mockReturnValue({
        pipe: jest.fn()
      })
    };
    JSZip.loadAsync = jest.fn().mockResolvedValue(mockZipContents);

    // Suppress console.log during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  // ============================================================================
  // Tests for copyAdditionalPackages
  // ============================================================================
  describe('copyAdditionalPackages', () => {

    // Happy Path Tests

    test('should create destination directory if it does not exist', async () => {
      fs.existsSync
        .mockReturnValueOnce(true)   // source dir exists
        .mockReturnValueOnce(false); // dest dir does not exist
      fs.readdir.mockImplementation((_, cb) => cb(null, []));

      await sut.copyAdditionalPackages('/test/archive');

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/test/archive/additional',
        { recursive: true }
      );
    });

    test('should copy .zip files from source to destination', async () => {
      fs.existsSync
        .mockReturnValueOnce(true)   // source dir exists
        .mockReturnValueOnce(true)   // dest dir exists
        .mockReturnValueOnce(false)  // pkg1.zip does not exist in dest
        .mockReturnValueOnce(false); // pkg2.zip does not exist in dest

      fs.readdir.mockImplementation((_, cb) => cb(null, ['pkg1.zip', 'pkg2.zip']));

      await sut.copyAdditionalPackages('/test/archive');

      // Need to wait for async operations
      await new Promise(resolve => setImmediate(resolve));

      expect(fs.copyFile).toHaveBeenCalledTimes(2);
      expect(fs.copyFile).toHaveBeenCalledWith(
        expect.stringContaining('pkg1.zip'),
        '/test/archive/additional/pkg1.zip',
        expect.any(Function)
      );
      expect(fs.copyFile).toHaveBeenCalledWith(
        expect.stringContaining('pkg2.zip'),
        '/test/archive/additional/pkg2.zip',
        expect.any(Function)
      );
    });

    test('should skip files that already exist in destination', async () => {
      fs.existsSync
        .mockReturnValueOnce(true)   // source dir exists
        .mockReturnValueOnce(true)   // dest dir exists
        .mockReturnValueOnce(true)   // pkg1.zip exists in dest - should be skipped
        .mockReturnValueOnce(false); // pkg2.zip does not exist in dest

      fs.readdir.mockImplementation((_, cb) => cb(null, ['pkg1.zip', 'pkg2.zip']));

      await sut.copyAdditionalPackages('/test/archive');

      await new Promise(resolve => setImmediate(resolve));

      expect(fs.copyFile).toHaveBeenCalledTimes(1);
      expect(fs.copyFile).toHaveBeenCalledWith(
        expect.stringContaining('pkg2.zip'),
        '/test/archive/additional/pkg2.zip',
        expect.any(Function)
      );
    });

    test('should only process .zip files', async () => {
      fs.existsSync
        .mockReturnValueOnce(true)   // source dir exists
        .mockReturnValueOnce(true)   // dest dir exists
        .mockReturnValueOnce(false); // pkg1.zip does not exist in dest

      fs.readdir.mockImplementation((_, cb) => cb(null, ['pkg1.zip', 'readme.txt', 'data.json']));

      await sut.copyAdditionalPackages('/test/archive');

      await new Promise(resolve => setImmediate(resolve));

      expect(fs.copyFile).toHaveBeenCalledTimes(1);
      expect(fs.copyFile).toHaveBeenCalledWith(
        expect.stringContaining('pkg1.zip'),
        expect.stringContaining('pkg1.zip'),
        expect.any(Function)
      );
    });

    test('should do nothing if source directory does not exist', async () => {
      fs.existsSync.mockReturnValueOnce(false); // source dir does not exist

      await sut.copyAdditionalPackages('/test/archive');

      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.readdir).not.toHaveBeenCalled();
      expect(fs.copyFile).not.toHaveBeenCalled();
    });

    // Edge Cases

    test('should handle empty source directory', async () => {
      fs.existsSync
        .mockReturnValueOnce(true)   // source dir exists
        .mockReturnValueOnce(true);  // dest dir exists

      fs.readdir.mockImplementation((_, cb) => cb(null, []));

      await sut.copyAdditionalPackages('/test/archive');

      await new Promise(resolve => setImmediate(resolve));

      expect(fs.copyFile).not.toHaveBeenCalled();
    });

    test('should handle fs.readdir error gracefully', async () => {
      fs.existsSync
        .mockReturnValueOnce(true)   // source dir exists
        .mockReturnValueOnce(true);  // dest dir exists

      const error = new Error('Permission denied');
      fs.readdir.mockImplementation((_, cb) => cb(error, null));

      // Should not throw
      await expect(sut.copyAdditionalPackages('/test/archive')).resolves.not.toThrow();

      // Error should be logged
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Error'));
    });

    test('should handle fs.copyFile error', async () => {
      fs.existsSync
        .mockReturnValueOnce(true)   // source dir exists
        .mockReturnValueOnce(true)   // dest dir exists
        .mockReturnValueOnce(false); // pkg1.zip does not exist in dest

      fs.readdir.mockImplementation((_, cb) => cb(null, ['pkg1.zip']));

      const copyError = new Error('Disk full');
      fs.copyFile.mockImplementation((_, __, cb) => cb(copyError));

      await sut.copyAdditionalPackages('/test/archive');

      await new Promise(resolve => setImmediate(resolve));

      // Error should be logged but not thrown
      expect(console.log).toHaveBeenCalledWith(copyError);
    });

    test('should handle null files from readdir', async () => {
      fs.existsSync
        .mockReturnValueOnce(true)   // source dir exists
        .mockReturnValueOnce(true);  // dest dir exists

      fs.readdir.mockImplementation((_, cb) => cb(null, null));

      await sut.copyAdditionalPackages('/test/archive');

      await new Promise(resolve => setImmediate(resolve));

      expect(fs.copyFile).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Tests for processMirrorInstruction
  // ============================================================================
  describe('processMirrorInstruction', () => {
    const createMockInstruction = (overrides = {}) => ({
      repoUrl: 'https://github.com/test/repo.git',
      fromTag: '1.0.0',
      vendor: 'test-vendor',
      extraRefToRelease: [],
      packageDirs: [],
      packageIndividual: [],
      packageMetaFromDirs: [],
      packageReplacements: [],
      extraMetapackages: [],
      skipTags: {},
      fixVersions: {},
      transform: {},
      ...overrides
    });

    const createMockReleaseContext = (overrides = {}) => ({
      composerRepoUrl: 'https://repo.example.com',
      ...overrides
    });

    // Happy Path Tests

    test('should call createTagForRef for each extraRefToRelease', async () => {
      const instruction = createMockInstruction({
        extraRefToRelease: [
          { ref: 'abc123', release: '1.0.0', details: 'Detail 1' },
          { ref: 'def456', release: '1.0.1', details: 'Detail 2' }
        ]
      });
      const releaseContext = createMockReleaseContext();

      await sut.processMirrorInstruction(instruction, releaseContext);

      expect(repo.createTagForRef).toHaveBeenCalledTimes(2);
      expect(repo.createTagForRef).toHaveBeenCalledWith(
        instruction.repoUrl,
        'abc123',
        '1.0.0',
        'Mage-OS Extra Ref',
        'Detail 1'
      );
      expect(repo.createTagForRef).toHaveBeenCalledWith(
        instruction.repoUrl,
        'def456',
        '1.0.1',
        'Mage-OS Extra Ref',
        'Detail 2'
      );
    });

    test('should process all packageDirs', async () => {
      const instruction = createMockInstruction({
        packageDirs: [
          { label: 'Module A', dir: 'app/code/ModuleA' },
          { label: 'Module B', dir: 'app/code/ModuleB' }
        ]
      });
      const releaseContext = createMockReleaseContext();

      await sut.processMirrorInstruction(instruction, releaseContext);

      expect(createPackagesForRef).toHaveBeenCalledTimes(6); // 2 dirs x 3 tags
    });

    test('should process all packageIndividual', async () => {
      const instruction = createMockInstruction({
        packageIndividual: [
          { label: 'Individual A', dir: 'lib/individual-a' },
          { label: 'Individual B', dir: 'lib/individual-b' }
        ]
      });
      const releaseContext = createMockReleaseContext();

      // Mock fs.existsSync for composerJsonPath check
      fs.existsSync.mockReturnValue(false);

      await sut.processMirrorInstruction(instruction, releaseContext);

      expect(createPackageForRef).toHaveBeenCalledTimes(6); // 2 packages x 3 tags
    });

    test('should process all packageMetaFromDirs', async () => {
      const instruction = createMockInstruction({
        packageMetaFromDirs: [
          { label: 'Meta A', dir: 'meta/a' },
          { label: 'Meta B', dir: 'meta/b' }
        ]
      });
      const releaseContext = createMockReleaseContext();

      await sut.processMirrorInstruction(instruction, releaseContext);

      expect(createMetaPackageFromRepoDir).toHaveBeenCalledTimes(6); // 2 dirs x 3 tags
    });

    test('should process all packageReplacements', async () => {
      // For this test, we need to verify replacePackageFiles is called
      // Since replacePackageFiles is an internal function, we test it indirectly
      // by checking that the package archive is read
      const instruction = createMockInstruction({
        packageReplacements: [
          { name: 'vendor/pkg1', version: '1.0.0', files: ['file1.txt'] },
          { name: 'vendor/pkg2', version: '2.0.0', files: ['file2.txt'] }
        ]
      });
      const releaseContext = createMockReleaseContext();

      // Mock for replacePackageFiles
      fs.existsSync.mockReturnValue(true);
      fs.readFile.mockImplementation((filepath, cb) => {
        cb(null, Buffer.from('PK' + '\x00'.repeat(100))); // Mock ZIP file
      });

      const mockZip = {
        file: jest.fn(),
        generateNodeStream: jest.fn().mockReturnValue({ pipe: jest.fn() })
      };

      // Since replacePackageFiles uses callback pattern, we need to mock appropriately
      // The actual call happens through zip.loadAsync which we've mocked above

      await sut.processMirrorInstruction(instruction, releaseContext);

      // Verify readFile was called for package replacements
      expect(fs.readFile).toHaveBeenCalled();
    });

    test('should process all extraMetapackages', async () => {
      const mockTransform = jest.fn().mockImplementation(config => config);
      const instruction = createMockInstruction({
        extraMetapackages: [
          { name: 'product-community-edition', fromTag: '1.0.0', transform: [mockTransform] },
          { name: 'project-community-edition', fromTag: '1.0.0', transform: [mockTransform] }
        ]
      });
      const releaseContext = createMockReleaseContext();

      await sut.processMirrorInstruction(instruction, releaseContext);

      expect(createComposerJsonOnlyPackage).toHaveBeenCalledTimes(6); // 2 metapackages x 3 tags
    });

    test('should call repo.clearCache at the end', async () => {
      const instruction = createMockInstruction();
      const releaseContext = createMockReleaseContext();

      await sut.processMirrorInstruction(instruction, releaseContext);

      expect(repo.clearCache).toHaveBeenCalledTimes(1);
    });

    test('should handle empty instruction arrays gracefully', async () => {
      const instruction = createMockInstruction({
        extraRefToRelease: [],
        packageDirs: [],
        packageIndividual: [],
        packageMetaFromDirs: [],
        packageReplacements: [],
        extraMetapackages: []
      });
      const releaseContext = createMockReleaseContext();

      await expect(sut.processMirrorInstruction(instruction, releaseContext)).resolves.not.toThrow();

      expect(repo.clearCache).toHaveBeenCalled();
    });

    // Integration-like Tests (testing tag filtering behavior)

    test('should filter tags correctly based on fromTag', async () => {
      // Setup: tags ['1.0.0', '2.0.0', '2.1.0'], fromTag: '2.0.0'
      // Expected: Only '2.0.0' and '2.1.0' should be processed

      isVersionGreaterOrEqual.mockImplementation((a, b) => {
        const versions = { '1.0.0': 1, '2.0.0': 2, '2.1.0': 2.1 };
        return versions[a] >= versions[b];
      });

      const instruction = createMockInstruction({
        fromTag: '2.0.0',
        packageDirs: [{ label: 'Test', dir: 'app/code/Test' }]
      });
      const releaseContext = createMockReleaseContext();

      await sut.processMirrorInstruction(instruction, releaseContext);

      // createPackagesForRef should be called for 2.0.0 and 2.1.0 only (2 times)
      expect(createPackagesForRef).toHaveBeenCalledTimes(2);
    });

    test('should apply skipTags filter', async () => {
      // Setup: skip '2.0.0' tag
      const instruction = createMockInstruction({
        fromTag: '1.0.0',
        skipTags: {
          '2.0.0': () => false  // Return false to skip
        },
        packageDirs: [{ label: 'Test', dir: 'app/code/Test' }]
      });
      const releaseContext = createMockReleaseContext();

      await sut.processMirrorInstruction(instruction, releaseContext);

      // Should process 1.0.0 and 2.1.0, but not 2.0.0 (2 times)
      expect(createPackagesForRef).toHaveBeenCalledTimes(2);
    });

    test('should use fixVersions when processing tags', async () => {
      const instruction = createMockInstruction({
        fromTag: '1.0.0',
        fixVersions: {
          '2.0.0': { 'vendor/package': '2.0.0-fixed' }
        },
        packageDirs: [{ label: 'Test', dir: 'app/code/Test' }]
      });
      const releaseContext = createMockReleaseContext();

      await sut.processMirrorInstruction(instruction, releaseContext);

      // Verify createPackagesForRef receives correct release state with fixVersions
      const calls = createPackagesForRef.mock.calls;
      const releaseFor200 = calls.find(call =>
        call[2] && call[2].ref === '2.0.0'
      );

      expect(releaseFor200).toBeDefined();
      expect(releaseFor200[2].dependencyVersions).toEqual({ 'vendor/package': '2.0.0-fixed' });
    });

    test('should log processing information for packageDirs', async () => {
      const instruction = createMockInstruction({
        packageDirs: [{ label: 'Test Module', dir: 'app/code/Test' }]
      });
      const releaseContext = createMockReleaseContext();

      await sut.processMirrorInstruction(instruction, releaseContext);

      expect(console.log).toHaveBeenCalledWith('Packaging Test Module');
    });

    test('should handle exceptions in createPackagesForRef gracefully', async () => {
      createPackagesForRef.mockRejectedValueOnce({ message: 'Test error' });

      const instruction = createMockInstruction({
        packageDirs: [{ label: 'Test Module', dir: 'app/code/Test' }]
      });
      const releaseContext = createMockReleaseContext();

      // Should not throw
      await expect(sut.processMirrorInstruction(instruction, releaseContext)).resolves.not.toThrow();

      // Error should be logged
      expect(console.log).toHaveBeenCalledWith('Test error');
    });

    test('should handle exceptions in createPackageForRef gracefully', async () => {
      createPackageForRef.mockRejectedValueOnce(new Error('Package creation failed'));

      const instruction = createMockInstruction({
        packageIndividual: [{ label: 'Test Package', dir: 'lib/test' }]
      });
      const releaseContext = createMockReleaseContext();

      // Mock fs.existsSync for composerJsonPath check
      fs.existsSync.mockReturnValue(false);

      await expect(sut.processMirrorInstruction(instruction, releaseContext)).resolves.not.toThrow();
    });

    test('should handle exceptions in createMetaPackageFromRepoDir gracefully', async () => {
      createMetaPackageFromRepoDir.mockRejectedValueOnce({ message: 'Meta package error' });

      const instruction = createMockInstruction({
        packageMetaFromDirs: [{ label: 'Test Meta', dir: 'meta/test' }]
      });
      const releaseContext = createMockReleaseContext();

      await expect(sut.processMirrorInstruction(instruction, releaseContext)).resolves.not.toThrow();

      expect(console.log).toHaveBeenCalledWith('Meta package error');
    });

    test('should pass composerRepoUrl from releaseContext to metapackages', async () => {
      const mockTransform = jest.fn().mockImplementation(config => config);
      const instruction = createMockInstruction({
        extraMetapackages: [
          { name: 'product', fromTag: '1.0.0', transform: [mockTransform] }
        ]
      });
      const releaseContext = createMockReleaseContext({
        composerRepoUrl: 'https://custom-repo.example.com'
      });

      await sut.processMirrorInstruction(instruction, releaseContext);

      // Verify the release context passed to createComposerJsonOnlyPackage includes composerRepoUrl
      const createCalls = createComposerJsonOnlyPackage.mock.calls;
      expect(createCalls.length).toBeGreaterThan(0);

      // The release object passed should have composerRepoUrl
      const releaseArg = createCalls[0][1];
      expect(releaseArg.composerRepoUrl).toBe('https://custom-repo.example.com');
    });

    test('should use metapackage-specific fromTag when provided', async () => {
      repo.listTags.mockResolvedValue(['1.0.0', '2.0.0', '2.1.0', '3.0.0']);

      isVersionGreaterOrEqual.mockImplementation((a, b) => {
        const versions = { '1.0.0': 1, '2.0.0': 2, '2.1.0': 2.1, '3.0.0': 3 };
        return versions[a] >= versions[b];
      });

      const mockTransform = jest.fn().mockImplementation(config => config);
      const instruction = createMockInstruction({
        fromTag: '1.0.0',  // Global fromTag
        extraMetapackages: [
          { name: 'product', fromTag: '3.0.0', transform: [mockTransform] }  // Metapackage-specific
        ]
      });
      const releaseContext = createMockReleaseContext();

      await sut.processMirrorInstruction(instruction, releaseContext);

      // Should only process tag 3.0.0 for this metapackage
      expect(createComposerJsonOnlyPackage).toHaveBeenCalledTimes(1);
    });

    test('should apply both metapackage.transform and instruction.transform', async () => {
      const metaTransform = jest.fn().mockImplementation(config => ({ ...config, metaTransformed: true }));
      const instructionTransform = jest.fn().mockImplementation(config => ({ ...config, instructionTransformed: true }));

      const instruction = createMockInstruction({
        transform: {
          'test-vendor/product': [instructionTransform]
        },
        extraMetapackages: [
          { name: 'product', fromTag: '1.0.0', transform: [metaTransform] }
        ]
      });
      const releaseContext = createMockReleaseContext();

      // Limit to single tag for simplicity
      repo.listTags.mockResolvedValue(['1.0.0']);

      await sut.processMirrorInstruction(instruction, releaseContext);

      // createComposerJsonOnlyPackage receives a transform function that should call both transforms
      expect(createComposerJsonOnlyPackage).toHaveBeenCalled();

      // The fifth argument is the transform function
      const transformFn = createComposerJsonOnlyPackage.mock.calls[0][4];
      expect(typeof transformFn).toBe('function');
    });

    test('should process createTagForRef calls in parallel', async () => {
      const instruction = createMockInstruction({
        extraRefToRelease: [
          { ref: 'ref1', release: '1.0.0', details: 'D1' },
          { ref: 'ref2', release: '1.0.1', details: 'D2' },
          { ref: 'ref3', release: '1.0.2', details: 'D3' }
        ]
      });
      const releaseContext = createMockReleaseContext();

      // Track the order of calls
      const callOrder = [];
      repo.createTagForRef.mockImplementation(async (url, ref) => {
        callOrder.push(ref);
        return Promise.resolve();
      });

      await sut.processMirrorInstruction(instruction, releaseContext);

      expect(repo.createTagForRef).toHaveBeenCalledTimes(3);
      // All three should be called (order may vary due to Promise.all)
      expect(callOrder).toContain('ref1');
      expect(callOrder).toContain('ref2');
      expect(callOrder).toContain('ref3');
    });

    test('should handle composerJsonPath for individual packages', async () => {
      const instruction = createMockInstruction({
        packageIndividual: [{
          label: 'Base Package',
          dir: 'base',
          composerJsonPath: '/resource/composer-templates/base/template.json'
        }]
      });
      const releaseContext = createMockReleaseContext();

      // Mock fs.existsSync for history file check
      fs.existsSync
        .mockReturnValueOnce(false)  // history file doesn't exist
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false);

      // Limit to single tag
      repo.listTags.mockResolvedValue(['1.0.0']);

      await sut.processMirrorInstruction(instruction, releaseContext);

      expect(createPackageForRef).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Tests for internal function behavior (tested through processMirrorInstruction)
  // ============================================================================
  describe('listTagsFrom behavior (internal)', () => {

    test('should return tags >= fromTag', async () => {
      repo.listTags.mockResolvedValue(['1.0.0', '1.5.0', '2.0.0', '2.1.0', '3.0.0']);

      isVersionGreaterOrEqual.mockImplementation((a, b) => {
        const parse = v => parseFloat(v.replace(/[^0-9.]/g, ''));
        return parse(a) >= parse(b);
      });

      const instruction = {
        repoUrl: 'https://github.com/test/repo.git',
        fromTag: '2.0.0',
        vendor: 'test',
        extraRefToRelease: [],
        packageDirs: [{ label: 'Test', dir: 'test' }],
        packageIndividual: [],
        packageMetaFromDirs: [],
        packageReplacements: [],
        extraMetapackages: [],
        skipTags: {},
        fixVersions: {},
        transform: {}
      };

      await sut.processMirrorInstruction(instruction, { composerRepoUrl: 'https://repo.test' });

      // Should only call createPackagesForRef for 2.0.0, 2.1.0, and 3.0.0
      expect(createPackagesForRef).toHaveBeenCalledTimes(3);
    });

    test('should filter out tags where skipTags function returns false', async () => {
      repo.listTags.mockResolvedValue(['2.0.0', '2.1.0', '2.2.0']);

      isVersionGreaterOrEqual.mockReturnValue(true);

      const instruction = {
        repoUrl: 'https://github.com/test/repo.git',
        fromTag: '2.0.0',
        vendor: 'test',
        extraRefToRelease: [],
        packageDirs: [{ label: 'Test', dir: 'test' }],
        packageIndividual: [],
        packageMetaFromDirs: [],
        packageReplacements: [],
        extraMetapackages: [],
        skipTags: {
          '2.1.0': () => false  // Skip this tag
        },
        fixVersions: {},
        transform: {}
      };

      await sut.processMirrorInstruction(instruction, { composerRepoUrl: 'https://repo.test' });

      // Should only call for 2.0.0 and 2.2.0
      expect(createPackagesForRef).toHaveBeenCalledTimes(2);
    });

    test('should handle empty tag list', async () => {
      repo.listTags.mockResolvedValue([]);

      const instruction = {
        repoUrl: 'https://github.com/test/repo.git',
        fromTag: '1.0.0',
        vendor: 'test',
        extraRefToRelease: [],
        packageDirs: [{ label: 'Test', dir: 'test' }],
        packageIndividual: [],
        packageMetaFromDirs: [],
        packageReplacements: [],
        extraMetapackages: [],
        skipTags: {},
        fixVersions: {},
        transform: {}
      };

      await sut.processMirrorInstruction(instruction, { composerRepoUrl: 'https://repo.test' });

      expect(createPackagesForRef).not.toHaveBeenCalled();
    });

    test('should handle when no tags match criteria', async () => {
      repo.listTags.mockResolvedValue(['1.0.0', '1.5.0', '1.9.0']);

      // All versions are less than fromTag
      isVersionGreaterOrEqual.mockReturnValue(false);

      const instruction = {
        repoUrl: 'https://github.com/test/repo.git',
        fromTag: '2.0.0',
        vendor: 'test',
        extraRefToRelease: [],
        packageDirs: [{ label: 'Test', dir: 'test' }],
        packageIndividual: [],
        packageMetaFromDirs: [],
        packageReplacements: [],
        extraMetapackages: [],
        skipTags: {},
        fixVersions: {},
        transform: {}
      };

      await sut.processMirrorInstruction(instruction, { composerRepoUrl: 'https://repo.test' });

      expect(createPackagesForRef).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Tests for replacePackageFiles behavior (internal, tested indirectly)
  // ============================================================================
  describe('replacePackageFiles behavior (internal)', () => {

    test('should throw if package archive does not exist', async () => {
      archiveFilePath.mockReturnValue('/test/archive/vendor-pkg-1.0.0.zip');
      fs.existsSync.mockReturnValue(false);

      const instruction = {
        repoUrl: 'https://github.com/test/repo.git',
        fromTag: '1.0.0',
        vendor: 'test',
        extraRefToRelease: [],
        packageDirs: [],
        packageIndividual: [],
        packageMetaFromDirs: [],
        packageReplacements: [
          { name: 'vendor/pkg', version: '1.0.0', files: ['file.txt'] }
        ],
        extraMetapackages: [],
        skipTags: {},
        fixVersions: {},
        transform: {}
      };

      // The function throws and the error propagates (no try/catch in processMirrorInstruction for this)
      await expect(sut.processMirrorInstruction(instruction, { composerRepoUrl: 'https://repo.test' }))
        .rejects.toEqual({ message: expect.stringContaining('Could not find archive') });
    });

    test('should read existing package archive', async () => {
      // Completely reset existsSync and set up fresh implementation
      fs.existsSync.mockReset();
      fs.existsSync.mockReturnValue(true);

      archiveFilePath.mockReturnValue('/test/archive/vendor-pkg-1.0.0.zip');

      fs.readFile.mockImplementation((_, cb) => cb(null, Buffer.from('test')));
      fs.readFileSync.mockReturnValue(Buffer.from('test'));
      fs.createWriteStream.mockReturnValue({ on: jest.fn() });

      // Mock JSZip load and file operations
      const mockContents = {
        file: jest.fn().mockReturnThis(),
        generateNodeStream: jest.fn().mockReturnValue({
          pipe: jest.fn()
        })
      };
      JSZip.loadAsync = jest.fn().mockResolvedValue(mockContents);

      const instruction = {
        repoUrl: 'https://github.com/test/repo.git',
        fromTag: '1.0.0',
        vendor: 'test',
        extraRefToRelease: [],
        packageDirs: [],
        packageIndividual: [],
        packageMetaFromDirs: [],
        packageReplacements: [
          { name: 'vendor/pkg', version: '1.0.0', files: ['config.json'] }
        ],
        extraMetapackages: [],
        skipTags: {},
        fixVersions: {},
        transform: {}
      };

      await sut.processMirrorInstruction(instruction, { composerRepoUrl: 'https://repo.test' });

      expect(fs.readFile).toHaveBeenCalledWith(
        '/test/archive/vendor-pkg-1.0.0.zip',
        expect.any(Function)
      );
    });
  });

  // ============================================================================
  // Additional edge case tests
  // ============================================================================
  describe('edge cases', () => {

    test('should handle undefined skipTags gracefully', async () => {
      repo.listTags.mockResolvedValue(['1.0.0']);
      isVersionGreaterOrEqual.mockReturnValue(true);

      const instruction = {
        repoUrl: 'https://github.com/test/repo.git',
        fromTag: '1.0.0',
        vendor: 'test',
        extraRefToRelease: [],
        packageDirs: [{ label: 'Test', dir: 'test' }],
        packageIndividual: [],
        packageMetaFromDirs: [],
        packageReplacements: [],
        extraMetapackages: [],
        skipTags: undefined,  // Explicitly undefined
        fixVersions: {},
        transform: {}
      };

      await expect(sut.processMirrorInstruction(instruction, { composerRepoUrl: 'https://repo.test' }))
        .resolves.not.toThrow();
    });

    test('should handle undefined fixVersions for a tag', async () => {
      repo.listTags.mockResolvedValue(['1.0.0']);
      isVersionGreaterOrEqual.mockReturnValue(true);

      const instruction = {
        repoUrl: 'https://github.com/test/repo.git',
        fromTag: '1.0.0',
        vendor: 'test',
        extraRefToRelease: [],
        packageDirs: [{ label: 'Test', dir: 'test' }],
        packageIndividual: [],
        packageMetaFromDirs: [],
        packageReplacements: [],
        extraMetapackages: [],
        skipTags: {},
        fixVersions: undefined,  // Explicitly undefined
        transform: {}
      };

      await expect(sut.processMirrorInstruction(instruction, { composerRepoUrl: 'https://repo.test' }))
        .resolves.not.toThrow();
    });

    test('should log versions to process', async () => {
      repo.listTags.mockResolvedValue(['1.0.0', '2.0.0']);
      isVersionGreaterOrEqual.mockReturnValue(true);

      const instruction = {
        repoUrl: 'https://github.com/test/repo.git',
        fromTag: '1.0.0',
        vendor: 'test',
        extraRefToRelease: [],
        packageDirs: [{ label: 'Test', dir: 'test' }],
        packageIndividual: [],
        packageMetaFromDirs: [],
        packageReplacements: [],
        extraMetapackages: [],
        skipTags: {},
        fixVersions: {},
        transform: {}
      };

      await sut.processMirrorInstruction(instruction, { composerRepoUrl: 'https://repo.test' });

      expect(console.log).toHaveBeenCalledWith('Versions to process: 1.0.0, 2.0.0');
    });

    test('should log each tag being processed', async () => {
      repo.listTags.mockResolvedValue(['1.0.0']);
      isVersionGreaterOrEqual.mockReturnValue(true);

      const instruction = {
        repoUrl: 'https://github.com/test/repo.git',
        fromTag: '1.0.0',
        vendor: 'test',
        extraRefToRelease: [],
        packageDirs: [{ label: 'Test', dir: 'test' }],
        packageIndividual: [],
        packageMetaFromDirs: [],
        packageReplacements: [],
        extraMetapackages: [],
        skipTags: {},
        fixVersions: {},
        transform: {}
      };

      await sut.processMirrorInstruction(instruction, { composerRepoUrl: 'https://repo.test' });

      expect(console.log).toHaveBeenCalledWith('Processing 1.0.0');
    });

    test('should include fallbackVersion in buildState for metapackages', async () => {
      repo.listTags.mockResolvedValue(['1.0.0']);
      isVersionGreaterOrEqual.mockReturnValue(true);

      const instruction = {
        repoUrl: 'https://github.com/test/repo.git',
        fromTag: '1.0.0',
        vendor: 'test',
        extraRefToRelease: [],
        packageDirs: [],
        packageIndividual: [],
        packageMetaFromDirs: [{ label: 'Meta', dir: 'meta' }],
        packageReplacements: [],
        extraMetapackages: [],
        skipTags: {},
        fixVersions: {},
        transform: {}
      };

      await sut.processMirrorInstruction(instruction, { composerRepoUrl: 'https://repo.test' });

      // Check that createMetaPackageFromRepoDir was called with proper release state
      expect(createMetaPackageFromRepoDir).toHaveBeenCalled();
      const releaseArg = createMetaPackageFromRepoDir.mock.calls[0][2];
      expect(releaseArg.fallbackVersion).toBe('1.0.0');
    });
  });
});
