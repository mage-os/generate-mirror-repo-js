const fs = require('fs');
const path = require('path');
const {determineSourceDependencies} = require('./determine-dependencies');
const JSZip = require('jszip');
const repo = require("./repository");
const {lastTwoDirs, httpSlurp, compareVersions} = require('./utils');
const {isOnPackagist} = require('./packagist');
const repositoryBuildDefinition = require('./type/repository-build-definition');
const packageDefinition = require('./type/package-definition');
const buildState = require('./type/build-state');

let archiveBaseDir = 'packages';

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
    str = str.slice(0, str.length - 1);
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
  ensureArchiveDirectoryExists(packageFilepath);
  const zip = zipFileWith(files);
  const stream = await zip.generateNodeStream({streamFiles: false, platform: 'UNIX'});
  stream.pipe(fs.createWriteStream(packageFilepath));
}

/**
 * @param {repositoryBuildDefinition} instruction
 * @param {packageDefinition} package
 * @param {String} ref
 * @returns {String}
 */
async function getComposerJson(instruction, package, ref) {
  if (!package.composerJsonFile || !package.composerJsonFile.length) {
    return readComposerJson(instruction.repoUrl, package.dir, ref || instruction.ref)
  }
  if (package.composerJsonFile.slice(0, 4) === 'http') {
    return httpSlurp(package.composerJsonFile);
  }
  return fs.readFileSync(package.composerJsonFile, 'utf8');
}

/**
 * Determine the stability level of a composer version string
 * @param {string} version - The version string to check (e.g. "2.4.0-beta1", "1.0.0", "dev-master")
 * @returns {string} - Returns 'dev', 'alpha', 'beta', 'RC', 'stable', or 'patch'
 */
function getVersionStability(version) {
  version = version.toLowerCase();

  if (version.startsWith('dev-') || version.includes('-dev')) {
    return 'dev';
  }
  if (version.includes('-alpha')) {
    return 'alpha';
  }
  if (version.includes('-beta')) {
    return 'beta';
  }
  if (version.includes('-rc')) {
    return 'RC';
  }

  return 'stable';
}

/**
 * @param {repositoryBuildDefinition} instruction
 * @param {packageDefinition} package
 * @param {*} magentoName
 * @param {*} composerJson
 * @param {*} definedVersion
 * @param {*} fallbackVersion
 * @returns
 */
function chooseNameAndVersion(instruction, package, magentoName, composerJson, definedVersion, fallbackVersion) {
  let composerConfig = JSON.parse(composerJson);
  let {version, name} = composerConfig;
  version = definedVersion || version || fallbackVersion;
  if (!name) {
    throw {
      kind: 'NAME_UNKNOWN',
      message: `Unable find package name in composer.json for ${version}, skipping ${magentoName}`,
      name,
      ref: version,
    }
  }
  if (!version) {
    throw {
      kind: 'VERSION_UNKNOWN',
      message: `Unable find package version in ${name} composer.json for ${version}, skipping ${magentoName}`,
      name,
      ref: version,
    }
  }
  return {name, version};
}

/**
 * @param {repositoryBuildDefinition} instruction
 * @param {buildState} release
 * @param {{'require':{}, 'require-dev':{}, 'suggest':{}}} composerConfig
 */
function setDependencyVersions(instruction, release, composerConfig) {
  const dependencyVersions = release.dependencyVersions;
  for (const dependencyType of ['require', 'require-dev', 'suggest']) {
    for (const dep in (composerConfig[dependencyType] || {})) {
      if (dependencyVersions[dep]
        || (instruction.vendor
          && dep.startsWith(instruction.vendor + '/')
          && dependencyVersions['*']
          && !isOnPackagist(instruction.vendor, dep)
        )
      ) {
        composerConfig[dependencyType][dep] = dependencyVersions[dep] || dependencyVersions['*'];
      }

      // For the sample data package, there's a 'suggest' that needs to include this special text for all versions.
      // The "Sample Data version:" prefix is used by sampledata:deploy to identify packages to require.
      // @see \Magento\SampleData\Model\Dependency::getSampleDataPackages()
      // Package names are for example magento/module-catalog-sample-data or magento/sample-data-media
      const specialKey = 'Sample Data version: ';
      if (dependencyType === 'suggest'
        && (dep.endsWith('-sample-data') || dep.includes('/sample-data-'))
        && composerConfig.suggest[dep].includes(specialKey) === false) {
        composerConfig.suggest[dep] = specialKey + composerConfig.suggest[dep];
      }
    }
  }
}

/**
 * Return {package-name: version} that would be built by createPackageForRef with the same params.
 *
 * Only used for release-branch builds (not mirror builds).
 *
 * @param {repositoryBuildDefinition} instruction
 * @param {packageDefinition} package
 * @returns {Promise<Object.<String, String>>}
 */
async function determinePackageForRef(instruction, package, ref) {
  const magentoName = lastTwoDirs(package.dir) || '';

  try {
    let composerJson = await getComposerJson(instruction, package, ref);

    if (composerJson.trim() === '404: Not Found') {
      throw {message: `Unable to find composer.json for ${ref || instruction.ref}, skipping ${magentoName}`}
    }
    const {name, version} = chooseNameAndVersion(instruction, package, magentoName, composerJson, null, ref || instruction.ref);

    return {[name]: version}
  } catch (exception) {
    // This function is only used for nightly release branch builds.
    // Some refs do not have a version in the composer.json (e.g. the base package or the magento-composer-installer 0.4.0-beta1=
    // For those we use the ref as the version. This might be a problem, so for now we leave it as is.
    if (exception.kind === 'VERSION_UNKNOWN') {
      return {[exception.name]: exception.ref}
    }
    console.log(`Unable to determine name and/or version for ${magentoName || instruction.repoUrl} in ${instruction.ref}: ${exception.message || exception}`);
    return {};
  }
}

/**
 * Return map of {package-name: version} that would be built by createPackagesForRef with the same params.
 *
 * Only used for release-branch builds (not mirror builds).
 *
 * @param {repositoryBuildDefinition} instruction
 * @param {packageDefinition} package
 * @returns {Promise<Object.<String, String>>}
 */
async function determinePackagesForRef(instruction, package, ref) {
  const modules = await findModulesToBuild(instruction, package, ref);
  const packages = {};

  for (const moduleDir of modules) {
    let subpackage = new packageDefinition({dir: moduleDir});
    Object.assign(packages, await determinePackageForRef(instruction, subpackage, ref));
  }
  return packages;
}

/**
 * @param {repositoryBuildDefinition} instruction
 * @param {packageDefinition} package
 * @param {buildState} release
 * @returns {Promise<{}>}
 */
async function createPackageForRef(instruction, package, release) {
  let excludes = package.excludes;
  if (!excludes.includes('composer.json')) excludes.push('composer.json');
  if (!excludes.includes('.git/')) excludes.push('.git/');

  package.composerJsonFile ??= package.composerJsonPath;

  let magentoName = lastTwoDirs(package.dir) || '';
  const composerJson = await getComposerJson(instruction, package, release.ref);

  if (composerJson.trim() === '404: Not Found') {
    throw {message: `Unable to find composer.json for ${instruction.ref}, skipping ${magentoName}`}
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
   *    => use fallbackVersions
   *
   * 5. mageos release
   *    dependencyVersions: set as {'*': releaseVersion}
   *    => use dependencyVersions
   */
  ({
    name,
    version
  } = chooseNameAndVersion(instruction, package, magentoName, composerJson, (release.dependencyVersions[composerConfig.name] ?? null), release.fallbackVersion));
  const packageWithVersion = {[name]: version};

  // Use fixed date for stable package checksum generation
  const mtime = new Date(stableMtime);
  const packageFilepath = archiveFilePath(name, version);

  // build the package even if it already exists - this is important as a workaround against inconsistencies in upstream
  // release tagging of adobe-ims
  if (fs.existsSync(packageFilepath)) {
    // the package version was already built while processing an earlier tag, so we skip the generation. The content
    // _should_ be the same. However, it sometimes changes due to mistakes in the upstream processes, but in those cases
    // upstream uses the earliest version of the package, so we do the same to be consistent.
    return packageWithVersion;
  }

  const files = (await repo.listFiles(instruction.repoUrl, package.dir, release.ref, package.excludes))
    .filter(file => {
      const isExcluded = (package.excludes || []).find(exclude => {
        return typeof exclude === 'function'
          ? exclude(release.ref, file.filepath)
          : file.filepath === exclude || file.filepath.startsWith(exclude)
      })
      return !isExcluded;
    });

  // Ensure version is set in config because some repos (e.g. page-builder and inventory) do not provide the version
  // in tagged composer.json files. The version is required for satis to be able to use the artifact repository type.
  composerConfig.version = version;

  if ((package.composerJsonFile || '').endsWith('template.json')) {
    // the origRef that ref is based on needs to be checked out for composer install, because only magento/* packages are available through the mirror repo
    const dir = await repo.checkout(instruction.repoUrl, release.origRef || release.ref);
    const deps = await determineSourceDependencies(dir, files);
    release.origRef && await repo.checkout(instruction.repoUrl, release.ref);
    composerConfig.require = {};
    Object.keys(deps).sort().forEach(dependency => {
      const dependencyName = instruction.vendor && dependency.startsWith('magento/')
        ? dependency.replace(/^magento\//, instruction.vendor + '/')
        : dependency
      composerConfig.require[dependencyName] = deps[dependency]
    });
  }
  setDependencyVersions(instruction, release, composerConfig);

  if (instruction.transform[name]) {
    for (const fn of instruction.transform[name]) {
      composerConfig = await fn(composerConfig, instruction, release);
    }
  }

  const filesInZip = files.map(file => {
    file.mtime = mtime;
    file.filepath = file.filepath.slice(package.dir ? package.dir.length + 1 : 0);
    return file;
  });

  filesInZip.push({
    filepath: 'composer.json',
    contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'),
    mtime,
    isExecutable: false
  });
  for (const d of (package.emptyDirsToAdd || [])) {
    filesInZip.push({filepath: d, contentBuffer: false, mtime, isExecutable: false});
  }
  filesInZip.sort((a, b) => ('' + a.filepath).localeCompare('' + b.filepath));

  if (! isInAdditionalPackages(composerConfig.name, composerConfig.version)) {
    await writePackage(packageFilepath, filesInZip);
  }

  return packageWithVersion;
}

function isInAdditionalPackages(name, version) {
  const dir = `${__dirname}/../resource/additional-packages`;

  const [vendorName, packageName] = name.split('/')

  const m = version.match(/^(?<mainVersion>[0-9.]+)(?:-p(?<patchVersion>[0-9]+))?$/)
  const {mainVersion, patchVersion} = m && m.groups || {mainVersion: version, patchVersion: undefined}

  const baseName = path.join(dir, `${vendorName}-${packageName}-${mainVersion}`)
  const fileNames = patchVersion
    ? [`${baseName}-p${patchVersion}.zip`, `${baseName}-patch${patchVersion}.zip`]
    : [`${baseName}.zip`]

  return fileNames.some(fs.existsSync)
}

/**
 * @param {repositoryBuildDefinition} instruction
 * @param {buildState} release
 * @param {String} name The composer name to use in the composer.json and for the package archive
 * @param {String|undefined} version Release version to use in the package archive name. Defaults to ref
 * @param {Function} transform Transformation fn, takes the source composer.json config, returns updated composer config
 * @returns {Promise: <{packageFilepath: String, files: {filepath:String, mtime: Date, contentBugger: Buffer, isExecutable: Boolean}}>}
 */
async function createComposerJsonOnlyPackage(instruction, release, name, version, transform) {
  const refComposerConfig = JSON.parse(await readComposerJson(instruction.repoUrl, '', release.ref));

  const composerConfig = await transform(refComposerConfig, instruction, release);
  const files = [{
    filepath: 'composer.json',
    mtime: new Date(stableMtime),
    contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'),
    isExecutable: false,
  }];

  // Special case - in these releases the base package also contained a .gitignore file in addition to the composer.json file.
  // The .gitignore file is identical for those two releases. However, it is not the same as the .gitignore file in the tagged release,
  // so we copy it from resource/history/magento/project-community-edition/2.4.0-gitignore
  if (name === 'magento/project-community-edition' && (release.ref === '2.4.0' || release.ref === '2.4.0-p1')) {
    files.push({
      filepath: '.gitignore',
      mtime: new Date(stableMtime),
      contentBuffer: fs.readFileSync(`${__dirname}/../resource/history/magento/project-community-edition/2.4.0-gitignore`),
      isExecutable: false,
    })
  }

  // @todo: Check version vs instruction.ref vs release.version here. Is this necessary to track separately? Is this fallback needed?
  const packageFilepath = archiveFilePath(name, version || release.ref);

  if (!isInAdditionalPackages(name, composerConfig.version)) {
    await writePackage(packageFilepath, files);
  }

  return {packageFilepath, files}
}

async function getLatestTag(url) {
  // Filter out tags beginning with v because magento/composer-dependency-version-audit-plugin has a wrong v1.0 tag
  const tags = (await repo.listTags(url)).filter(tag => tag.slice(0, 1) !== 'v').sort(compareVersions);
  return tags[tags.length - 1];
}

async function getLatestConfiguration(dir) {
  if (!fs.existsSync(`${dir}/dependencies-template.json`)) {
    return {
      require: {}
    };
  }
  const template = JSON.parse(fs.readFileSync(`${dir}/dependencies-template.json`, 'utf8'));
  return Object.entries(template.dependencies).reduce(async (deps, [dependency, url]) => {
      const tag = url.slice(0, 4) === 'http' ? await getLatestTag(url) : url;
      return Object.assign(await deps, {[dependency]: tag});
    }, Promise.resolve({}))
    .then(requireObj => ({ require: requireObj }));
}

async function getAdditionalConfiguration(packageName, ref) {
  const dir = `${__dirname}/../resource/history/${packageName}`;
  const file = `${dir}/${ref}.json`;
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : await getLatestConfiguration(`${__dirname}/../resource/composer-templates/${packageName}`);
}

/**
 * @param {repositoryBuildDefinition} instruction
 * @param {packageDefinition} package
 * @returns Array<String>
 */
async function findModulesToBuild(instruction, package, ref) {
  const folders = await repo.listFolders(instruction.repoUrl, package.dir, ref || instruction.ref);
  return folders
    .filter(folder => folder !== '.')
    .filter(folder => {
      const isExcluded = (package.excludes || []).find(exclude => {
        return folder === rtrim(exclude, '/') || folder.startsWith(exclude)
      })
      return !isExcluded;
    });
}

/**
 * @param {repositoryBuildDefinition} instruction
 * @param {packageDefinition} package
 * @param {buildState} release
 * @returns {Promise<{}>}
 */
async function createPackagesForRef(instruction, package, release) {
  const modules = await findModulesToBuild(instruction, package, release.ref);

  report(`Found ${modules.length} modules`);

  let n = 0;
  const built = {};

  // Synchronously build all packages for the given ref because building them async causes JS to go OOM

  for (const moduleDir of modules) {
    const current = (++n).toString().padStart(modules.length.toString().length, ' ');
    report(`${current}/${modules.length} Packaging [${release.ref}] ${(lastTwoDirs(moduleDir, '_'))}`);
    try {
      let subpackage = new packageDefinition({
        ...package,
        dir: moduleDir,
      });
      const packageToVersion = await createPackageForRef(instruction, subpackage, release);
      Object.assign(built, packageToVersion);
    } catch (exception) {
      report(exception.message);
    }
  }
  if (Object.keys(built).length === 0) {
    throw {message: `No packages built for ${release.ref}`};
  }
  return built;
}

/**
 * @param {String} url The URL of the source git repository
 * @param {String} dir The directory path to the git repository
 * @param {String} ref Git ref to check out (string of tag or branch)
 * @param {String|undefined} release Release version to use in composer.json version tag and in the package archive name. Defaults to ref
 * @returns {Promise<Object.<String, String>>}
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
 * @param {repositoryBuildDefinition} instruction
 * @param {packageDefinition} package
 * @param {buildState} release
 * @returns {Promise<Object.<String, String>>}
 */
async function createMetaPackageFromRepoDir(instruction, package, release) {
  let composerConfig = JSON.parse(await readComposerJson(
    instruction.repoUrl,
    package.dir,
    release.ref
  ));
  let {version, name} = composerConfig;
  if (!name) {
    throw {message: `Unable find package name and in composer.json for metapackage ${release.ref} in ${package.dir}`}
  }
  version = release.version || release.dependencyVersions[name] || version || release.ref;

  // Ensure version is set on composer config because not all repos provide the version in composer.json (e.g.
  // page-builder) and it is required by satis to be able to use artifact repositories.
  composerConfig.version = version;
  setDependencyVersions(instruction, release, composerConfig);

  if (instruction.transform[name]) {
    for (const fn of instruction.transform[name]) {
      composerConfig = await fn(composerConfig, instruction, release);
    }
  }

  const files = [{
    filepath: 'composer.json',
    mtime: new Date(stableMtime),
    contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'),
    isExecutable: false,
  }];

  const packageFilepath = archiveFilePath(name, version);
  if (! isInAdditionalPackages(composerConfig.name, composerConfig.version)) {
    await writePackage(packageFilepath, files);
  }

  return {[name]: version}
}

async function createMetaPackage(instruction, metapackage, release) {
  let packageName = `magento/${metapackage.name}`; // Has to be Magento here for transforms.

  // Fetch base composer config
  const composerJson = await readComposerJson(instruction.repoUrl, '', release.ref);
  let composerConfig = JSON.parse(composerJson);

  // Create specific package config
  composerConfig = Object.assign(composerConfig, {
    name: packageName,
    description: composerConfig.description || '',
    type: metapackage.type,
    license: composerConfig.license || [],
    require: composerConfig.require || {},
    version: release.version || release.ref
  });

  // Apply transforms
  if (instruction.transform[packageName]) {
    for (const fn of instruction.transform[packageName]) {
      composerConfig = await fn(composerConfig, instruction, release);
    }
  }

  for (const fn of metapackage.transform) {
    composerConfig = await fn(composerConfig, instruction, metapackage, release);
  }

  // Create package
  const files = [{
    filepath: 'composer.json',
    mtime: new Date(stableMtime),
    contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'),
    isExecutable: false
  }];

  // Update packageName with final vendor
  packageName = `${instruction.vendor}/${metapackage.name}`;

  const packageFilepath = archiveFilePath(packageName, composerConfig.version);

  if (!isInAdditionalPackages(packageName, composerConfig.version)) {
    await writePackage(packageFilepath, files);
  }

  return {[packageName]: composerConfig.version};
}

module.exports = {
  setArchiveBaseDir(newArchiveBaseDir) {
    archiveBaseDir = newArchiveBaseDir;
  },
  createPackageForRef,
  createPackagesForRef,
  createMetaPackageFromRepoDir,
  createMetaPackage,
  createComposerJsonOnlyPackage,

  getLatestTag,
  archiveFilePath,
  writePackage,
  readComposerJson,

  determinePackageForRef,
  determinePackagesForRef,
  determineMetaPackageFromRepoDir,

  getVersionStability,
  setDependencyVersions,
  getAdditionalDependencies: getAdditionalConfiguration,
  getAdditionalConfiguration
}
