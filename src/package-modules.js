const fs = require('fs');
const path = require('path');
const {determineDependencies} = require('./determine-dependencies');
const JSZip = require('jszip');
const repo = require("./repository");
const {lastTwoDirs, httpSlurp, compareVersions} = require('./utils');

let archiveBaseDir = 'packages';

let mageosPackageRepoUrl = 'https://repo.mage-os.org/';

const stableMtime = '2022-02-22 22:02:22.000Z';

function report() {
  console.log(...arguments);
}

/**
 * Given 'a/b/c/foo.txt', return ['a', 'a/b', 'a/b/c']
 *
 * @param {String} filepath
 */
function allParentDirs(filepath) {
  return filepath.split('/').slice(0, -1).reduce((acc, part) => {
    const parent = acc.length ? acc[acc.length - 1] + '/' : '';
    return acc.concat([parent + part]);
  }, []);
}

function addFileToZip(zip, {filepath, mtime, contentBuffer, isExecutable}) {
  // create folders explicitly to be able to set the folder mtime and permissions
  for (const folder of allParentDirs(filepath)) {
    zip.file(folder, '', {dir: true, date: mtime, unixPermissions: '775'});
  }
  contentBuffer
    ? zip.file(filepath, contentBuffer, {date: mtime, unixPermissions: isExecutable ? '755' : '644'})
    : zip.file(filepath, '', {dir: true, date: mtime, unixPermissions: '755'}); // contentBuffer is false -> add as dir 
}

function zipFileWith(files) {
  const zip = new JSZip();
  files.map(file => addFileToZip(zip, file));
  return zip;
}

function ltrim(str, c) {
  while (c && str && c.includes(str.substr(0, 1))) {
    str = str.substr(1);
  }
  return str;
}

function rtrim(str, c) {
  while (c && str && c.includes(str.substr(-1))) {
    str = str.substr(0, str.length -1);
  }
  return str;
}

async function readComposerJson(url, dir, ref) {
  const file = ltrim(`${dir}/composer.json`, '/');
  return repo.readFile(url, file, ref)
    .then(b => Buffer.from(b).toString('utf8'));
}

function ensureArchiveDirectoryExists(archivePath) {
  const packageDir = path.dirname(archivePath);
  if (!fs.existsSync(packageDir)) fs.mkdirSync(packageDir, {recursive: true});
}

function archiveFilePath(name, version) {
  const prefix = path.isAbsolute(archiveBaseDir) ? '' : process.cwd();
  return path.join(prefix, archiveBaseDir, name + '-' + version + '.zip')
}

async function writePackage(packageFilepath, files) {
  if (fs.existsSync(packageFilepath)) {
    return;
  }

  ensureArchiveDirectoryExists(packageFilepath);
  const zip = zipFileWith(files);
  const stream = await zip.generateNodeStream({streamFiles: false, platform: 'UNIX'});
  stream.pipe(fs.createWriteStream(packageFilepath));
}

async function getComposerJson(url, moduleDir, ref, composerJsonPath) {
  if (! composerJsonPath || ! composerJsonPath.length) {
    return readComposerJson(url, moduleDir, ref)
  }
  if (composerJsonPath.substr(0, 4) === 'http') {
    return httpSlurp(composerJsonPath);
  }
  return fs.readFileSync(composerJsonPath, 'utf8');
}

function chooseNameAndVersion(magentoName, composerJson, ref, release) {
  const composerConfig = JSON.parse(composerJson);
  let {version, name} = composerConfig;
  // Force package and composer version to match version from composer.json instead of the git tag (if no release given)
  // This is to work around a wrong version in the magento/composer-dependency-version-audit-plugin:0.1.2 that
  // lists version 0.1.1 in the composer.json
  // See https://github.com/magento/composer-dependency-version-audit-plugin/blob/0.1.2/composer.json#L5
  version = release || version || ref;
  if (!name) {
    throw {message: `Unable find package name in composer.json for ${ref}, skipping ${magentoName}`}
  }
  return {name, version};
}

/**
 * @param {{'require':{}, 'require-dev':{}}} composerConfig
 * @param {{}} dependencyVersions composer package:version dependency map. Dependencies for packages in the map will be set to the given versions
 */
function setDependencyVersions(composerConfig, dependencyVersions) {
  for (const dependencyType of ['require', 'require-dev']) {
    for (const dep in (composerConfig[dependencyType] || {})) {
      if (dependencyVersions[dep]) {
        composerConfig[dependencyType][dep] = dependencyVersions[dep];
      }
    }
  }
}

/**
 * Return {package-name: version} that would be built by createPackageForRef with the same params.
 *
 * Options:
 *   excludes: Array of path prefixes relative to repo root to exclude from the package
 *   release: Release version to use in composer.json version tag and in the package archive name. Defaults to ref
 *
 * @param {String} url The URL of the source git repository
 * @param {String} moduleDir The path to the module to package. Can be '' to use the full repo
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {{excludes:Array|undefined, release:String|undefined}} options
 * @returns {Promise<{}>}
 */
async function determinePackageForRef(url, moduleDir, ref, options) {
  const defaults = {composerJsonPath: undefined, emptyDirsToAdd: [], release: undefined};
  const {composerJsonPath, release} = Object.assign(defaults, (options || {}));
  const magentoName = lastTwoDirs(moduleDir) || '';

  const composerJson = await getComposerJson(url, moduleDir, ref, composerJsonPath);

  if (composerJson.trim() === '404: Not Found') {
    throw {message: `Unable to find composer.json for ${ref}, skipping ${magentoName}`}
  }
  const {name, version} = chooseNameAndVersion(magentoName, composerJson, ref, release);

  return {[name]: version}
}

/**
 * Return map of {package-name: version} that would be built by createPackagesForRef with the same params.
 *
 * Options:
 *   excludes: Array of path prefixes relative to repo root to exclude from the package
 *   release: Release version to use in composer.json version tag and in the package archive name. Defaults to ref
 *
 * @param {String} url The URL of the source git repository
 * @param {String} modulesPath The path to the module to package. Can be '' to use the full repo
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {{excludes:Array|undefined, release:String|undefined}} options
 * @returns {Promise<{}>}
 */
async function determinePackagesForRef(url, modulesPath, ref, options) {
  const {excludes} = Object.assign({excludes: []}, (options || {}));
  const modules = await findModulesToBuild(url, modulesPath, ref, excludes);

  const packages = {};

  for (const moduleDir of modules) {
    Object.assign(packages, await determinePackageForRef(url, moduleDir, ref, options));
  }
  return packages;
}

/**
 * Options:
 *   excludes: Array of path prefixes relative to repo root to exclude from the package
 *   composerJsonPath: Path to file in resource/ folder to use as composer.json file. Defaults to composer.json in moduleDir
 *   emptyDirsToAdd: Array of paths relative to moduleDir to add to the zip as empty directories
 *   release: Release version to use in composer.json version tag and in the package archive name. Defaults to ref
 *   dependencyVersions: composer package:version dependency map. Dependencies for packages in the map will be set to the given versions
 *
 * @param {String} url The URL of the source git repository
 * @param {String} moduleDir The path to the module to package. Can be '' to use the full repo
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {{excludes:Array|undefined, composerJsonPath:String|undefined, emptyDirsToAdd:Array|undefined, release:String|undefined, dependencyVersions:{}|undefined}} options
 * @returns {Promise<{}>}
 */
async function createPackageForRef(url, moduleDir, ref, options) {
  const defaults = {excludes: [], composerJsonPath: undefined, emptyDirsToAdd: [], release: undefined, dependencyVersions: {}};
  const {excludes, composerJsonPath, emptyDirsToAdd, release, dependencyVersions} = Object.assign(defaults, (options || {}));

  if (! excludes.includes('composer.json')) excludes.push('composer.json');
  if (! excludes.includes('.git/')) excludes.push('.git/');
  let magentoName = lastTwoDirs(moduleDir) || '';

  const composerJson = await getComposerJson(url, moduleDir, ref, composerJsonPath);

  if (composerJson.trim() === '404: Not Found') {
    throw {message: `Unable to find composer.json for ${ref}, skipping ${magentoName}`}
  }

  let {name, version} = chooseNameAndVersion(magentoName, composerJson, ref, release);
  const packageWithVersion = {[name]: version};
  
  // Use fixed date for stable package checksum generation
  const mtime = new Date(stableMtime);
  
  const packageFilepath = archiveFilePath(name, version);
  if (fs.existsSync(packageFilepath)) {
    return packageWithVersion;
  }

  const files = (await repo.listFiles(url, moduleDir, ref, excludes))
    .filter(file => {
      const isExcluded = (excludes || []).find(exclude => {
        return file.filepath === exclude || file.filepath.startsWith(exclude)
      })
      return ! isExcluded;
    });
  
  // Ensure version is set in config because some repos (e.g. page-builder and inventory) do not provide the version
  // in tagged composer.json files. The version is required for satis to be able to use the artifact repository type.
  const composerConfig = JSON.parse(composerJson);
  composerConfig.version = version;
  
  if ((composerJsonPath || '').endsWith('template.json')) {
    const dir = await(repo.checkout(url, ref));
    const deps = await determineDependencies(dir, files);
    composerConfig.require = {};
    Object.keys(deps).sort().forEach(dependency => composerConfig.require[dependency] = deps[dependency]);
  }
  setDependencyVersions(composerConfig, dependencyVersions);

  const filesInZip = files.map(file => {
    file.mtime = mtime;
    file.filepath = file.filepath.substr(moduleDir ? moduleDir.length + 1 : '');
    return file;
  });
  
  filesInZip.push({filepath: 'composer.json', contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'), mtime, isExecutable: false});
  for (const d of (emptyDirsToAdd || [])) {
    filesInZip.push({filepath: d, contentBuffer: false, mtime, isExecutable: false});
  }
  filesInZip.sort((a, b) => ('' + a.filepath).localeCompare('' + b.filepath));

  await writePackage(packageFilepath, filesInZip)
  
  return packageWithVersion;
}

/**
 * @param {String} url The URL of the source git repository
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {String} name The composer name to use in the composer.json and for the package archive
 * @param {String} transform Transformation fn, takes the source composer.json config, returns updated composer config
 * @param {String|undefined} release Release version to use in the package archive name. Defaults to ref
 * @returns {Promise<void>}
 */
async function createComposerJsonOnlyPackage(url, ref, name, transform, release) {
  const refComposerConfig = JSON.parse(await readComposerJson(url, '', ref));

  const composerConfig = await transform(refComposerConfig);
  const files = [{
    filepath: 'composer.json',
    mtime: new Date(stableMtime),
    contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'),
    isExecutable: false,
  }];

  const packageFilepath = archiveFilePath(name, release || ref);
  await writePackage(packageFilepath, files)
}

async function getLatestTag(url) {
  // Filter out tags beginning with v because magento/composer-dependency-version-audit-plugin has a wrong v1.0 tag
  const tags = (await repo.listTags(url)).filter(tag => tag.substr(0, 1) !== 'v').sort(compareVersions);
  return tags[tags.length -1];
}

async function getLatestDependencies(dir) {
  if (! fs.existsSync(`${dir}/dependencies-template.json`)) {
    return {};
  }
  const template = JSON.parse(fs.readFileSync(`${dir}/dependencies-template.json`));
  return Object.entries(template.dependencies).reduce(async (deps, [dependency, url]) => {
    const tag = url.substr(0, 4) === 'http' ? await getLatestTag(url) : url;
    return Object.assign(await deps, {[dependency]: tag});
  }, Promise.resolve({}));
}

async function getAdditionalDependencies(packageName, ref) {
  const dir = `${__dirname}/../resource/history/${packageName}`;
  const file = `${dir}/${ref}.json`;
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file)).require
    : await getLatestDependencies(dir);
}

async function findModulesToBuild(url, modulesPath, ref, excludes) {
  const folders = await repo.listFolders(url, modulesPath, ref);
  return folders
    .filter(dir => dir !== '.')
    .filter(dir => {
      const isExcluded = (excludes || []).find(exclude => {
        return dir === rtrim(exclude, '/') || dir.startsWith(exclude)
      })
      return ! isExcluded;
    });
}

/**
 * Options:
 *   excludes: Array of path prefixes relative to repo root to exclude from the package
 *   release: Release version to use in composer.json version tag and in the package archive name. Defaults to ref
 *   dependencyVersions: composer package:version dependency map. Dependencies for packages in the map will be set to the given versions
 *
 * @param {String} url The URL of the source git repository
 * @param {String} modulesPath The path to the module to package. Can be '' to use the full repo
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {{excludes:Array|undefined, release:String|undefined, dependencyVersions:{}|undefined}} options
 * @returns {Promise<{}>}
 */
async function createPackagesForRef(url, modulesPath, ref, options) {
  const defaults = {excludes: [], release: undefined, dependencyVersions: {}};
  const {excludes, release, dependencyVersions} = Object.assign(defaults, (options || {}));
  const modules = await findModulesToBuild(url, modulesPath, ref, excludes);

  report(`Found ${modules.length} modules`);

  let n = 0;
  const built = {};

  // Synchronously build all packages for the given ref because building them async caused JS to go OOM

  for (const moduleDir of modules) {
    const current = (++n).toString().padStart(modules.length.toString().length, ' ');
    report(`${current}/${modules.length} Packaging [${ref}] ${(lastTwoDirs(moduleDir, '_'))}: ${release || ref}`);
    try {
      const packageToVersion = await createPackageForRef(url, moduleDir, ref, {excludes, release, dependencyVersions});
      Object.assign(built, packageToVersion);
    } catch (exception) {
      report(exception.message);
    }
  }
  if (Object.keys(built).length === 0) {
    throw {message: `No packages built for ${ref}`};
  }
  return built;
}

async function determineMagentoCommunityEditionMetapackage(repoUrl, ref, release) {
  const version = release || ref;
  return {'magento/product-community-edition': version};
}

/**
 * Options:
 *   release: Release version to use in composer.json version tag and in the package archive name. Defaults to ref
 *   dependencyVersions: composer package:version dependency map. Dependencies for packages in the map will be set to the given versions
 *
 * @param {String} url The URL of the source git repository
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {{release:String|undefined, dependencyVersions:{}}} options
 * @returns {Promise<{}>}
 */
async function createMagentoCommunityEditionMetapackage(url, ref, options) {
  const {release, dependencyVersions} = Object.assign({release: undefined, dependencyVersions: {}}, (options || {}))
  const version = release || ref;
  const name = 'magento/product-community-edition';
  await createComposerJsonOnlyPackage(url, ref, name, async (refComposerConfig) => {

    const additionalDependencies = await getAdditionalDependencies(name, ref);

    const composerConfig = Object.assign({}, refComposerConfig, {
      name: name,
      description: 'eCommerce Platform for Growth (Community Edition)',
      type: 'metapackage',
      require: Object.assign({}, refComposerConfig.require, refComposerConfig.replace, additionalDependencies, {'magento/magento2-base': version}),
      version
    });

    for (const k of ['autoload', 'autoload-dev', 'config', 'conflict', 'extra', 'minimum-stability', 'replace', 'require-dev', 'suggest']) {
      delete composerConfig[k];
    }
    setDependencyVersions(composerConfig, dependencyVersions);

    return composerConfig;
  }, release);
  return {[name]: version};
}

async function determineMagentoCommunityEditionProject(url, ref, release) {
  const version = release || ref;
  return {'magento/project-community-edition': version}
}

/**
 * Options:
 *   release: Release version to use in composer.json version tag and in the package archive name. Defaults to ref
 *   dependencyVersions: composer package:version dependency map. Dependencies for packages in the map will be set to the given versions
 *
 * @param {String} url The URL of the source git repository
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {{release:String|undefined, dependencyVersions:{}, minimumStability:String|undefined}} options
 * @returns {Promise<{}>}
 */
async function createMagentoCommunityEditionProject(url, ref, options) {
  const defaults = {release: undefined, dependencyVersions: {}, minimumStability: 'stable'};
  const {release, dependencyVersions, minimumStability} = Object.assign(defaults, (options || {}))
  const name = 'magento/project-community-edition';
  const version = release || ref;
  await createComposerJsonOnlyPackage(url, ref, name, async (refComposerConfig) => {

    const additionalDependencies = await getAdditionalDependencies(name, ref);

    const composerConfig = Object.assign(refComposerConfig, {
      name: name,
      description: 'eCommerce Platform for Growth (Community Edition)',
      extra: {'magento-force': 'override'},
      version: version,
      repositories: [{type: 'composer', url: mageosPackageRepoUrl}],
      'minimum-stability': minimumStability,
      require: Object.assign({'magento/product-community-edition': version}, additionalDependencies)
    });

    for (const k of ['replace', 'suggest']) {
      delete composerConfig[k];
    }
    setDependencyVersions(composerConfig, dependencyVersions);

    return composerConfig;
  }, release);

  return {[name]: version}
}

/**
 * @param {String} url The URL of the source git repository
 * @param {String} dir The directory path to the git repository
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {String|undefined} release Release version to use in composer.json version tag and in the package archive name. Defaults to ref
 * @returns {Promise<{}>}
 */

async function determineMetaPackageFromRepoDir(url, dir, ref, release) {
  const composerConfig = JSON.parse(await readComposerJson(url, dir, ref));
  let {version, name} = composerConfig;
  if (!name) {
    throw {message: `Unable find package name and in composer.json for metapackage ${ref} in ${dir}`}
  }
  version = release || version || ref;

  return {[name]: version}
}

/**
 * Options:
 *   release: Release version to use in composer.json version tag and in the package archive name. Defaults to ref
 *   dependencyVersions: composer package:version dependency map. Dependencies for packages in the map will be set to the given versions
 *
 * @param {String} url The URL of the source git repository
 * @param {String} dir The directory path to the git repository
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {{release:String|undefined, dependencyVersions:{}}} options
 * @returns {Promise<{}>}
 */
async function createMetaPackageFromRepoDir(url, dir, ref, options) {
  const {release, dependencyVersions} = Object.assign({release: undefined, dependencyVersions: {}}, (options || {}));
  const composerConfig = JSON.parse(await readComposerJson(url, dir, ref));
  let {version, name} = composerConfig;
  if (!name) {
    throw {message: `Unable find package name and in composer.json for metapackage ${ref} in ${dir}`}
  }
  version = release || version || ref;

  // Ensure version is set on composer config because not all repos provide the version in composer.json (e.g.
  // page-builder) and it is required by satis to be able to use artifact repositories.
  composerConfig.version = version;
  setDependencyVersions(composerConfig, dependencyVersions);

  const files = [{
    filepath: 'composer.json',
    mtime: new Date(stableMtime),
    contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'),
    isExecutable: false,
  }];

  const packageFilepath = archiveFilePath(name, release || ref);
  await writePackage(packageFilepath, files)

  return {[name]: version}
}

module.exports = {
  setArchiveBaseDir(newArchiveBaseDir) {
    archiveBaseDir = newArchiveBaseDir;
  },
  setMageosPackageRepoUrl(newMirrorUrl) {
    mageosPackageRepoUrl = newMirrorUrl;
  },
  createPackageForRef,
  createPackagesForRef,
  createMagentoCommunityEditionMetapackage,
  createMagentoCommunityEditionProject,
  createMetaPackageFromRepoDir,

  determinePackageForRef,
  determinePackagesForRef,
  determineMagentoCommunityEditionMetapackage,
  determineMagentoCommunityEditionProject,
  determineMetaPackageFromRepoDir,
}
