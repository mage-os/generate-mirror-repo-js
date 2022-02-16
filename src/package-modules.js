const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const repo = require("./repository");
const {lastTwoDirs, httpSlurp, compareTags} = require('./utils');

let archiveBaseDir = 'packages';

const stableMtime = '2022-02-22 22:22:22';

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
  zip.file(filepath, contentBuffer, {date: mtime, unixPermissions: isExecutable ? '755' : '644'}
  )
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

async function createPackageForTag(url, moduleDir, excludes, ref, composerJsonUrl) {

  excludes = excludes || [];
  excludes.push('composer.json');
  let magentoName = lastTwoDirs(moduleDir) || '';
  
  const json = composerJsonUrl
    ? await httpSlurp(composerJsonUrl)
    : await readComposerJson(url, moduleDir, ref);
  const {version, name} = JSON.parse(json);
  if (!version || !name) {
    throw {message: `Unable find package name and/or version in composer.json for ${ref}, skipping ${magentoName}`}
  }

  // use fixed date for stable package checksum generation
  const mtime = new Date(stableMtime);
  
  const packageFilepath = archiveFilePath(name, version);
  if (fs.existsSync(packageFilepath)) {
    return;
  }

  const files = (await repo.listFiles(url, moduleDir, ref))
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
  files.push({filepath: 'composer.json', contentBuffer: Buffer.from(json, 'utf8'), mtime, isExecutable: false});
  files.sort((a, b) => ('' + a.filepath).localeCompare('' + b.filepath));

  ensureArchiveDirectoryExists(packageFilepath);
  const zip = zipFileWith(files);
  const stream = await zip.generateNodeStream({streamFiles: false, platform: 'UNIX'});
  stream.pipe(fs.createWriteStream(packageFilepath));
}

async function createComposerJsonOnlyPackage(url, ref, name, transform) {
  const taggedComposerConfig = JSON.parse(await readComposerJson(url, '', ref));

  const composerConfig = transform(taggedComposerConfig);

  const files = [{
    filepath: 'composer.json',
    mtime: new Date(stableMtime),
    contentBuffer: Buffer.from(JSON.stringify(composerConfig), 'utf8'),
    isExecutable: false,
  }];

  const packageFilepath = archiveFilePath(name, ref);
  if (fs.existsSync(packageFilepath)) {
    return;
  }

  ensureArchiveDirectoryExists(packageFilepath);
  const zip = zipFileWith(files);
  const stream = await zip.generateNodeStream({streamFiles: false, platform: 'UNIX'});
  stream.pipe(fs.createWriteStream(packageFilepath));
}


module.exports = {
  setArchiveBaseDir(newArchiveBaseDir) {
    archiveBaseDir = newArchiveBaseDir;
  },
  createPackageForTag,
  async createPackagesForTag(url, modulesPath, excludes, ref) {
    
    const built = [];
    
    const modules = (await repo.listFolders(url, modulesPath, ref))
      .filter(dir => dir !== '.')
      .filter(dir => {
        const isExcluded = (excludes || []).find(exclude => {
          return dir === rtrim(exclude, '/') || dir.startsWith(exclude)
        })
        return ! isExcluded;
      });

    
    report(`Found ${modules.length} modules`);

    let n = 0;
    for (const moduleDir of modules) {
      report(`${++n}/${modules.length} Packaging ${(lastTwoDirs(moduleDir, '_'))} ${ref}`);
      try {
        await createPackageForTag(url, moduleDir, excludes, ref);
        report(`${n}/${modules.length} Finished ${(lastTwoDirs(moduleDir, '_'))} ${ref}`);
        built.push(moduleDir);
      } catch (exception) {
        report(exception.message);
      }
    }
    if (built.length === 0) {
      throw {message: `No packages built for ${ref}`};
    }
  },
  async createMagentoCommunityEditionMetapackage(url, ref) {
    const name = 'magento/product-community-edition';
    await createComposerJsonOnlyPackage(url, ref, name, taggedComposerConfig => {
      const composerConfig = Object.assign(taggedComposerConfig, {
        name: name,
        description: 'eCommerce Platform for Growth (Community Edition)',
        type: 'metapackage',
        require: Object.assign({'magento/magento2-base': ref}, taggedComposerConfig.require, taggedComposerConfig.replace)
      });

      for (const k of ['autoload', 'autoload-dev', 'config', 'conflict', 'extra', 'minimum-stability', 'replace', 'require-dev', 'suggest']) {
        delete composerConfig[k];
      }
      return composerConfig;
    });
  },
  async createMagentoCommunityEditionProject(url, ref) {
    const name = 'magento/project-community-edition';
    await createComposerJsonOnlyPackage(url, ref, name, taggedComposerConfig => {
      const composerConfig = Object.assign(taggedComposerConfig, {
        name: name,
        description: 'eCommerce Platform for Growth (Community Edition)',
        extra: {'magento-force': 'override'},
        repositories: [{type: 'composer', url: 'https://repo.mage-os.org/'}],
        'minimum-stability': 'stable',
        require: Object.assign(
          {
            'magento/product-community-edition': ref,
            'magento/composer-root-update-plugin': '~1.1',
          },
          compareTags('2.4.3', ref) === -1 ? {} : {'magento/composer-dependency-version-audit-plugin': '~0.1'}
        )
      });

      for (const k of ['replace', 'suggest']) {
        delete composerConfig[k];
      }
      return composerConfig;
    });
  }
}
