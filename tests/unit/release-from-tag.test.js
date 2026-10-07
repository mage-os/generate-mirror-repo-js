/**
 * A new release honours each build config entry's fromTag, so a release built
 * from an older line leaves out what only exists from a later major on.
 */

jest.mock('../../src/packagist', () => ({
  fetchPackagistList: jest.fn().mockResolvedValue(new Set()),
  isOnPackagist: jest.fn().mockReturnValue(false)
}));

jest.mock('../../src/package-modules', () => ({
  readComposerJson: jest.fn(),
  createPackagesForRef: jest.fn().mockResolvedValue({}),
  createPackageForRef: jest.fn().mockResolvedValue({}),
  createMetaPackage: jest.fn(async (instruction, metapackage) => ({[metapackage.name]: 'built'})),
  createMetaPackageFromRepoDir: jest.fn().mockResolvedValue({})
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const {isPartOfRelease, loadReleaseRefs, processBuildInstructions} = require('../../src/release-build-tools');
const {createMetaPackage} = require('../../src/package-modules');
const {buildConfig} = require('../../src/build-config/mageos-release-build-config');

describe('isPartOfRelease', () => {
  test('includes an entry from its fromTag onwards', () => {
    expect(isPartOfRelease({fromTag: '3.0.0'}, '3.0.0')).toBe(true);
    expect(isPartOfRelease({fromTag: '3.0.0'}, '3.4.1')).toBe(true);
  });

  test('excludes an entry from releases before its fromTag', () => {
    expect(isPartOfRelease({fromTag: '3.0.0'}, '2.3.1')).toBe(false);
  });

  test('includes an entry without a fromTag', () => {
    expect(isPartOfRelease({}, '2.3.1')).toBe(true);
  });

  test('includes everything when no release version is given', () => {
    expect(isPartOfRelease({fromTag: '3.0.0'}, '')).toBe(true);
  });
});

describe('loadReleaseRefs', () => {
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-refs-'));
    fs.writeFileSync(path.join(dir, 'refs.js'), "module.exports = {'*': '3.4.0'};");
  });

  afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

  test('reads an absolute path', () => {
    expect(loadReleaseRefs(path.join(dir, 'refs.js'))).toEqual({'*': '3.4.0'});
  });

  // require() treats a bare path as a package name, so the path the release
  // workflow passes has to be resolved first or it throws MODULE_NOT_FOUND.
  test('reads a path relative to the working directory', () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      expect(loadReleaseRefs('refs.js')).toEqual({'*': '3.4.0'});
    } finally {
      process.chdir(cwd);
    }
  });

  test('is empty when the file does not exist', () => {
    expect(loadReleaseRefs(path.join(dir, 'missing.js'))).toEqual({});
  });
});

describe('the release build config', () => {
  const skippedRepos = (version) => buildConfig
    .filter(instruction => !isPartOfRelease(instruction, version))
    .map(instruction => instruction.key);

  const skippedMetapackages = (version) => buildConfig
    .flatMap(instruction => instruction.extraMetapackages || [])
    .filter(metapackage => !isPartOfRelease(metapackage, version))
    .map(metapackage => metapackage.name);

  test('a 2.x release leaves out the repositories added in 3.0.0', () => {
    expect(skippedRepos('2.3.1').sort()).toEqual(['magento-zf-captcha', 'magento-zf-soap']);
  });

  test('a 2.x release leaves out the minimal edition', () => {
    expect(skippedMetapackages('2.3.1').sort()).toEqual(['product-minimal-edition', 'project-minimal-edition']);
  });

  test('a release on the current line leaves nothing out', () => {
    expect(skippedRepos('3.5.0')).toEqual([]);
    expect(skippedMetapackages('3.5.0')).toEqual([]);
  });
});

describe('processBuildInstructions', () => {
  const instruction = {
    extraMetapackages: [
      {name: 'product-community-edition', fromTag: '1.0.0'},
      {name: 'product-minimal-edition', fromTag: '3.0.0'},
    ]
  };

  beforeEach(() => createMetaPackage.mockClear());

  test('skips metapackages that begin after the release', async () => {
    const built = await processBuildInstructions(instruction, {version: '2.3.1'});
    expect(Object.keys(built)).toEqual(['product-community-edition']);
    expect(createMetaPackage).toHaveBeenCalledTimes(1);
  });

  test('builds every metapackage for a current release', async () => {
    const built = await processBuildInstructions(instruction, {version: '3.5.0'});
    expect(Object.keys(built)).toEqual(['product-community-edition', 'product-minimal-edition']);
  });
});
