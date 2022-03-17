const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const repo = require("./repository");
const {lastTwoDirs, httpSlurp, compareVersions} = require('./utils');

let archiveBaseDir = 'packages';

let mageosPackageRepoUrl = 'https://mirror.mage-os.org/';

const stableMtime = '2022-02-22 22:02:22.000Z';

function report() {
  console.log(...arguments);
}

/**
 * Given 'a/b/c/foo.txt', return ['a', 'a/b', 'a/b/c']
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
  return fs.readFileSync(composerJsonPath).toString('utf8');
}

async function createPackageForTag(url, moduleDir, excludes, ref, composerJsonPath, emptyDirsToAdd) {

  excludes = excludes || [];
  if (! excludes.includes('composer.json')) excludes.push('composer.json');
  let magentoName = lastTwoDirs(moduleDir) || '';
  
  const composerJson = await getComposerJson(url, moduleDir, ref, composerJsonPath);

  if (composerJson.trim() === '404: Not Found') {
    throw {message: `Unable to find composer.json for ${ref}, skipping ${magentoName}`}
  }

  let {version, name} = JSON.parse(composerJson);
  // Force package and composer version to match git tag
  // This is to work around a wrong version in the magento/composer-dependency-version-audit-plugin:0.1.2 that
  // lists version 0.1.1 in the composer.json
  // See https://github.com/magento/composer-dependency-version-audit-plugin/blob/0.1.2/composer.json#L5
  version = ref;
  if (!name) {
    throw {message: `Unable find package name in composer.json for ${ref}, skipping ${magentoName}`}
  }
  
  // Use fixed date for stable package checksum generation
  const mtime = new Date(stableMtime);
  
  const packageFilepath = archiveFilePath(name, version);
  if (fs.existsSync(packageFilepath)) {
    return;
  }

  const files = (await repo.listFiles(url, moduleDir, ref, excludes))
    .filter(file => {
      const isExcluded = (excludes || []).find(exclude => {
        return file.filepath === exclude || file.filepath.startsWith(exclude)
      })
      return ! isExcluded;
    })
    .map(file => {
      file.mtime = mtime;
      file.filepath = file.filepath.substr(moduleDir ? moduleDir.length + 1 : '');
      return file;
    });
  
  // Ensure version is set in config because some repos (e.g. page-builder and inventory) do not provide the version
  // in tagged composer.json files. The version is required for satis to be able to use the artifact repository type.
  const composerConfig = JSON.parse(composerJson);
  composerConfig.version = version;
  
  files.push({filepath: 'composer.json', contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'), mtime, isExecutable: false});
  for (const d of (emptyDirsToAdd || [])) {
    files.push({filepath: d, contentBuffer: false, mtime, isExecutable: false});
  }
  files.sort((a, b) => ('' + a.filepath).localeCompare('' + b.filepath));

  await writePackage(packageFilepath, files)
}

async function createComposerJsonOnlyPackage(url, ref, name, transform) {
  const taggedComposerConfig = JSON.parse(await readComposerJson(url, '', ref));

  const composerConfig = await transform(taggedComposerConfig);
  const files = [{
    filepath: 'composer.json',
    mtime: new Date(stableMtime),
    contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'),
    isExecutable: false,
  }];

  const packageFilepath = archiveFilePath(name, ref);
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

module.exports = {
  setArchiveBaseDir(newArchiveBaseDir) {
    archiveBaseDir = newArchiveBaseDir;
  },
  setMageosPackageRepoUrl(newMirrorUrl) {
    mageosPackageRepoUrl = newMirrorUrl;
  },
  createPackageForTag,
  async createPackagesForTag(url, modulesPath, excludes, ref) {
    
    const built = [];

    const folders = await repo.listFolders(url, modulesPath, ref);
    const modules = folders
      .filter(dir => dir !== '.')
      .filter(dir => {
        const isExcluded = (excludes || []).find(exclude => {
          return dir === rtrim(exclude, '/') || dir.startsWith(exclude)
        })
        return ! isExcluded;
      });

    
    report(`Found ${modules.length} modules`);

    let n = 0;

    // Asynchronously build all packages for the given ref 
    const promises = modules.map(moduleDir => {
      report(`${++n}/${modules.length} Packaging ${(lastTwoDirs(moduleDir, '_'))} ${ref}`);
      return createPackageForTag(url, moduleDir, excludes, ref)
        .then(() => built.push(moduleDir))
        .catch(exception => report(exception.message || exception));
    });
    await Promise.allSettled(promises);

    // Synchronously build all packages for the given ref
    // for (const moduleDir of modules) {
    //   report(`${++n}/${modules.length} Packaging ${(lastTwoDirs(moduleDir, '_'))} ${ref}`);
    //   try {
    //     await createPackageForTag(url, moduleDir, excludes, ref);
    //     built.push(moduleDir);
    //   } catch (exception) {
    //     report(exception.message);
    //   }
    // }
    if (built.length === 0) {
      throw {message: `No packages built for ${ref}`};
    }
  },
  async createMagentoCommunityEditionMetapackage(url, ref) {
    const name = 'magento/product-community-edition';
    await createComposerJsonOnlyPackage(url, ref, name, async (taggedComposerConfig) => {
      
      const additionalDependencies = await getAdditionalDependencies(name, ref);
      
      const composerConfig = Object.assign({}, taggedComposerConfig, {
        name: name,
        description: 'eCommerce Platform for Growth (Community Edition)',
        type: 'metapackage',
        require: Object.assign({'magento/magento2-base': ref}, taggedComposerConfig.require, taggedComposerConfig.replace, additionalDependencies),
        version: ref
      });

      for (const k of ['autoload', 'autoload-dev', 'config', 'conflict', 'extra', 'minimum-stability', 'replace', 'require-dev', 'suggest']) {
        delete composerConfig[k];
      }
      return composerConfig;
    });
  },
  async createMagentoCommunityEditionProject(url, ref) {
    const name = 'magento/project-community-edition';
    await createComposerJsonOnlyPackage(url, ref, name, async (taggedComposerConfig) => {

      const additionalDependencies = await getAdditionalDependencies(name, ref);

      const composerConfig = Object.assign(taggedComposerConfig, {
        name: name,
        description: 'eCommerce Platform for Growth (Community Edition)',
        extra: {'magento-force': 'override'},
        version: ref,
        repositories: [{type: 'composer', url: mageosPackageRepoUrl}],
        'minimum-stability': 'stable',
        require: Object.assign({'magento/product-community-edition': ref}, additionalDependencies)
      });

      for (const k of ['replace', 'suggest']) {
        delete composerConfig[k];
      }
      return composerConfig;
    });
  },
  async createMetaPackageFromRepoDir(url, dir, ref) {
    const composerConfig = JSON.parse(await readComposerJson(url, dir, ref));
    let {version, name} = composerConfig;
    if (!name) {
      throw {message: `Unable find package name and in composer.json for metapackage ${ref} in ${dir}`}
    }
    version = version || ref;

    // Ensure version is set on composer config because not all repos provide the version in composer.json (e.g.
    // page-builder) and it is required by satis to be able to use artifact repositories.
    composerConfig.version = version;
    
    const files = [{
      filepath: 'composer.json',
      mtime: new Date(stableMtime),
      contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'),
      isExecutable: false,
    }];

    const packageFilepath = archiveFilePath(name, ref);
    await writePackage(packageFilepath, files)
  }
}
