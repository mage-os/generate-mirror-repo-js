const fs = require('fs');
const path = require('path');
const {determineSourceDependencies} = require('./determine-dependencies');
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
  while (c && str && c.includes(str.slice(0, 1))) {
    str = str.slice(1);
  }
  return str;
}

function rtrim(str, c) {
  while (c && str && c.includes(str.slice(-1))) {
    str = str.slice(0, str.length -1);
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
  if (composerJsonPath.slice(0, 4) === 'http') {
    return httpSlurp(composerJsonPath);
  }
  return fs.readFileSync(composerJsonPath, 'utf8');
}

function chooseNameAndVersion(magentoName, composerJson, ref, givenVersion) {
  const composerConfig = JSON.parse(composerJson);
  let {version, name} = composerConfig;
  version = givenVersion || version;
  if (!name) {
    throw {
      kind: 'NAME_UNKNOWN',
      message: `Unable find package name in composer.json for ${ref}, skipping ${magentoName}`,
      name,
      ref,
    }
  }
  if (!version) {
    throw {
      kind: 'VERSION_UNKNOWN',
      message: `Unable find package version in ${name} composer.json for ${ref}, skipping ${magentoName}`,
      name,
      ref,
    }
  }
  return {name, version};
}

/**
 * @param {{'require':{}, 'require-dev':{}}} composerConfig
 * @param {{}} dependencyVersions composer package:version dependency map. Dependencies for packages in the map will be set to the given versions
 */
function setDependencyVersions(composerConfig, dependencyVersions) {
  for (const dependencyType of ['require', 'require-dev', 'suggest']) {
    for (const dep in (composerConfig[dependencyType] || {})) {
      if (dependencyVersions[dep]) {
        // The "Sample Data version:" prefix is used by sampledata:deploy to identify packages to require.
        // See \Magento\SampleData\Model\Dependency::getSampleDataPackages
        composerConfig[dependencyType][dep] = dependencyType === 'suggest' && dep.endsWith('-sample-data')
          ? `Sample Data version: ${dependencyVersions[dep]}`
          : dependencyVersions[dep];
      }
    }
  }
}

/**
 * Return {package-name: version} that would be built by createPackageForRef with the same params.
 * 
 * Only used for release-branch builds (not mirror builds).
 *
 * Options:
 *   excludes: Array of path prefixes relative to repo root to exclude from the package
 *
 * @param {String} url The URL of the source git repository
 * @param {String} moduleDir The path to the module to package. Can be '' to use the full repo
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {{excludes:Array|undefined}} options
 * @returns {Promise<{}>}
 */
async function determinePackageForRef(url, moduleDir, ref, options) {
  const defaults = {composerJsonPath: undefined, emptyDirsToAdd: []};
  const {composerJsonPath} = Object.assign(defaults, (options || {}));
  const magentoName = lastTwoDirs(moduleDir) || '';

  try {
    const composerJson = await getComposerJson(url, moduleDir, ref, composerJsonPath);

    if (composerJson.trim() === '404: Not Found') {
      throw {message: `Unable to find composer.json for ${ref}, skipping ${magentoName}`}
    }
    const {name, version} = chooseNameAndVersion(magentoName, composerJson, ref);

    return {[name]: version}
  } catch (exception) {
    // This function is only used for nightly release branch builds.
    // Some refs do not have a version in the composer.json (e.g. the base package or the magento-composer-installer 0.4.0-beta1=
    // For those we use the ref as the version. This might be a problem, so for now we leave it as is.
    if (exception.kind === 'VERSION_UNKNOWN') {
      return {[exception.name]: exception.ref}
    }
     console.log(`Unable to determine name and/or version for ${magentoName || url} in ${ref}: ${exception.message || exception}`);
     return {};
  }
}

/**
 * Return map of {package-name: version} that would be built by createPackagesForRef with the same params.
 *
 * Only used for release-branch builds (not mirror builds).
 * 
 * Options:
 *   excludes: Array of path prefixes relative to repo root to exclude from the package
 *
 * @param {String} url The URL of the source git repository
 * @param {String} modulesPath The path to the module to package. Can be '' to use the full repo
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {{excludes:Array|undefined}} options
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
 * @param {{excludes:Array|undefined, composerJsonPath:String|undefined, emptyDirsToAdd:Array|undefined, dependencyVersions:{}|undefined}, fallbackVersion:String|undefined, transform:Function[]|undefined} options
 * @returns {Promise<{}>}
 */
async function createPackageForRef(url, moduleDir, ref, options) {
  const defaults = {excludes: [], composerJsonPath: undefined, emptyDirsToAdd: [], release: undefined, dependencyVersions: {}, fallbackVersion: undefined};
  const {excludes, composerJsonPath, emptyDirsToAdd, dependencyVersions, fallbackVersion, transform} = Object.assign(defaults, (options || {}));

  if (! excludes.includes('composer.json')) excludes.push('composer.json');
  if (! excludes.includes('.git/')) excludes.push('.git/');
  let magentoName = lastTwoDirs(moduleDir) || '';

  const composerJson = await getComposerJson(url, moduleDir, ref, composerJsonPath);

  if (composerJson.trim() === '404: Not Found') {
    throw {message: `Unable to find composer.json for ${ref}, skipping ${magentoName}`}
  }
  
  let composerConfig = JSON.parse(composerJson);
  
  let name, version;
  
  /*
   * Possible cases:
   * 1. mirror package, without version fix:
   *   dependencyVersions: undefined, composer.json version: set
   *   => use composer.json version
   *
   * 2. mirror package, with version fix:
   *   dependencyVersions: set, composer.json version: set
   *   => use dependencyVersions
   *
   * 3. nightly build, previously released version:
   *    dependencyVersions: set, composer.json version: undefined
   *    => use dependencyVersions
   *
   * 4. nightly build, previously unreleased version:
   *    dependencyVersions: undefined, composer.json version: undefined
   *    => use fallbackVersion
   */
  ({name, version} = chooseNameAndVersion(magentoName, composerJson, ref, (dependencyVersions[composerConfig.name] ?? fallbackVersion)));
  const packageWithVersion = {[name]: version};

  // Use fixed date for stable package checksum generation
  const mtime = new Date(stableMtime);
  const packageFilepath = archiveFilePath(name, version);

  // build the package even if it already exists - this is important as a workaround against inconsistencies in upstream
  // release tagging of adobe-ims
  // if (fs.existsSync(packageFilepath)) {
  //   return packageWithVersion;
  // }

  const files = (await repo.listFiles(url, moduleDir, ref, excludes))
    .filter(file => {
      const isExcluded = (excludes || []).find(exclude => {
        return typeof exclude === 'function'
          ? exclude(ref, file.filepath)
          : file.filepath === exclude || file.filepath.startsWith(exclude)
      })
      return ! isExcluded;
    });
  
  // Ensure version is set in config because some repos (e.g. page-builder and inventory) do not provide the version
  // in tagged composer.json files. The version is required for satis to be able to use the artifact repository type.
  composerConfig.version = version;
  
  if ((composerJsonPath || '').endsWith('template.json')) {
    const dir = await(repo.checkout(url, ref));
    const deps = await determineSourceDependencies(dir, files);
    composerConfig.require = {};
    Object.keys(deps).sort().forEach(dependency => composerConfig.require[dependency] = deps[dependency]);
  }
  setDependencyVersions(composerConfig, dependencyVersions);

  composerConfig = (transform && transform[name] || []).reduce((config, transformFn) => transformFn(config), composerConfig);

  const filesInZip = files.map(file => {
    file.mtime = mtime;
    file.filepath = file.filepath.slice(moduleDir ? moduleDir.length + 1 : 0);
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
 * @param {Function} transform Transformation fn, takes the source composer.json config, returns updated composer config
 * @param {String|undefined} release Release version to use in the package archive name. Defaults to ref
 * @returns {Promise: <{packageFilepath: String, files: {filepath:String, mtime: Date, contentBugger: Buffer, isExecutable: Boolean}}>}
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
  return {packageFilepath, files}
}

async function getLatestTag(url) {
  // Filter out tags beginning with v because magento/composer-dependency-version-audit-plugin has a wrong v1.0 tag
  const tags = (await repo.listTags(url)).filter(tag => tag.slice(0, 1) !== 'v').sort(compareVersions);
  return tags[tags.length -1];
}

async function getLatestDependencies(dir) {
  if (! fs.existsSync(`${dir}/dependencies-template.json`)) {
    return {};
  }
  const template = JSON.parse(fs.readFileSync(`${dir}/dependencies-template.json`, 'utf8'));
  return Object.entries(template.dependencies).reduce(async (deps, [dependency, url]) => {
    const tag = url.slice(0, 4) === 'http' ? await getLatestTag(url) : url;
    return Object.assign(await deps, {[dependency]: tag});
  }, Promise.resolve({}));
}

async function getAdditionalDependencies(packageName, ref) {
  const dir = `${__dirname}/../resource/history/${packageName}`;
  const file = `${dir}/${ref}.json`;
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8')).require
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
 *   dependencyVersions: composer package:version dependency map. Dependencies for packages in the map will be set to the given versions
 *
 * @param {String} url The URL of the source git repository
 * @param {String} modulesPath The path to the module to package. Can be '' to use the full repo
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {{excludes:Array|undefined,  dependencyVersions:{}|undefined}} options
 * @returns {Promise<{}>}
 */
async function createPackagesForRef(url, modulesPath, ref, options) {
  const defaults = {excludes: [], dependencyVersions: {}};
  let configOptions = Object.assign(defaults, (options || {}));
  const {excludes} = configOptions;
  const modules = await findModulesToBuild(url, modulesPath, ref, excludes);

  report(`Found ${modules.length} modules`);

  let n = 0;
  const built = {};

  // Synchronously build all packages for the given ref because building them async causes JS to go OOM

  for (const moduleDir of modules) {
    const current = (++n).toString().padStart(modules.length.toString().length, ' ');
    report(`${current}/${modules.length} Packaging [${ref}] ${(lastTwoDirs(moduleDir, '_'))}`);
    try {
      const packageToVersion = await createPackageForRef(url, moduleDir, ref, configOptions);
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
 * @param {{release:String|undefined, dependencyVersions:{}, transform:Function[]|undefined}} options
 * @returns {Promise<{}>}
 */
async function createMagentoCommunityEditionMetapackage(url, ref, options) {
  const {release, dependencyVersions, transform} = Object.assign({release: undefined, dependencyVersions: {}}, (options || {}))
  const name = 'magento/product-community-edition';
  const version = release || dependencyVersions[name] || ref;
  const {packageFilepath, files} = await createComposerJsonOnlyPackage(url, ref, name, async (refComposerConfig) => {

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

    return (transform && transform[name] || []).reduce((config, transformFn) => transformFn(config), composerConfig);
  }, release || version);
  
  await writePackage(packageFilepath, files);
  
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
 * @param {{release:String|undefined, dependencyVersions:{}, minimumStability:String|undefined, transform:Function[]|undefined}} options
 * @returns {Promise<{}>}
 */
async function createMagentoCommunityEditionProject(url, ref, options) {
  const defaults = {release: undefined, dependencyVersions: {}, minimumStability: 'stable'};
  const {release, dependencyVersions, minimumStability, transform} = Object.assign(defaults, (options || {}))
  const name = 'magento/project-community-edition';
  const version = release || dependencyVersions[name] || ref;
  const {packageFilepath, files} = await createComposerJsonOnlyPackage(url, ref, name, async (refComposerConfig) => {

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

    return (transform && transform[name] || []).reduce((config, transformFn) => transformFn(config), composerConfig)
  }, version);
  
  // Special case - in these releases the base package also contained a .gitignore file in addition to the composer.json file.
  // The .gitignore file is identical for those two releases. However, it is not the same as the .gitignore file in the tagged release,
  // so we copy it from resource/history/magento/project-community-edition/2.4.0-gitignore
  if (ref === '2.4.0' || ref === '2.4.0-p1') {
    files.push({
      filepath: '.gitignore',
      mtime: new Date(stableMtime),
      contentBuffer: fs.readFileSync(`${__dirname}/../resource/history/magento/project-community-edition/2.4.0-gitignore`),
      isExecutable: false,
    })
  }
  
  await writePackage(packageFilepath, files)

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
 * @param {{release:String|undefined, dependencyVersions:{}, transform:Function[]|undefined}} options
 * @returns {Promise<{}>}
 */
async function createMetaPackageFromRepoDir(url, dir, ref, options) {
  const {release, dependencyVersions, transform} = Object.assign({release: undefined, dependencyVersions: {}}, (options || {}));
  let composerConfig = JSON.parse(await readComposerJson(url, dir, ref));
  let {version, name} = composerConfig;
  if (!name) {
    throw {message: `Unable find package name and in composer.json for metapackage ${ref} in ${dir}`}
  }
  version = release || dependencyVersions[name] || version || ref;

  // Ensure version is set on composer config because not all repos provide the version in composer.json (e.g.
  // page-builder) and it is required by satis to be able to use artifact repositories.
  composerConfig.version = version;
  setDependencyVersions(composerConfig, dependencyVersions);

  composerConfig = (transform && transform[name] || []).reduce((config, transformFn) => transformFn(config), composerConfig);

  const files = [{
    filepath: 'composer.json',
    mtime: new Date(stableMtime),
    contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'),
    isExecutable: false,
  }];

  const packageFilepath = archiveFilePath(name, version);
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

  getLatestTag,
  archiveFilePath,
  
  determinePackageForRef,
  determinePackagesForRef,
  determineMagentoCommunityEditionMetapackage,
  determineMagentoCommunityEditionProject,
  determineMetaPackageFromRepoDir,
}
