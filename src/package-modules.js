const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const repo = require("./repository");
const {lastTwoDirs, httpSlurp} = require('./utils');

const cliProgress = require('cli-progress');
const multibar = new cliProgress.MultiBar({
  clearOnComplete: false,
  hideCursor: true,
  emptyOnZero: true,
  fps: 10,
  format: '[{bar}] {label}',
  forceRedraw: true,
}, cliProgress.Presets.shades_classic);

let archiveBaseDir = 'archives';

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

async function readComposerJsonUrl(url) {
  
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
    console.error(`Unable find package name and/or version in composer.json for ${ref}, skipping ${magentoName}`);
    return;
  }

  // use fixed date for stable package checksum generation
  const mtime = new Date('2022-02-22 22:22:22');
  
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


module.exports = {
  setArchiveBaseDir(newArchiveBaseDir) {
    archiveBaseDir = newArchiveBaseDir;
  },
  createPackageForTag,
  async createPackagesForTag(url, modulesPath, excludes, ref) {
    const packagesProgressBar = multibar.create(100, 0, {label: `Listing Modules for ${ref}`});
    repo.setReportFn((s) => setTimeout(() => packagesProgressBar.update(null, {label: s}), 100));

    const modules = (await repo.listFolders(url, modulesPath, ref))
      .filter(dir => dir !== '.')
      .filter(dir => {
        const isExcluded = (excludes || []).find(exclude => {
          return dir === rtrim(exclude, '/') || dir.startsWith(exclude)
        })
        return ! isExcluded;
      });

    packagesProgressBar.setTotal(modules.length);
    packagesProgressBar.update(null, {label: `${modules.length} modules`});

    let n = 0;
    for (const moduleDir of modules) {
      packagesProgressBar.increment(0, {label: `${++n}/${modules.length} Preparing ${(lastTwoDirs(moduleDir, '_'))}`});
      await createPackageForTag(url, moduleDir, excludes, ref);
      packagesProgressBar.increment(1, {label: `${n}/${modules.length} Finished ${(lastTwoDirs(moduleDir, '_'))}`});
    }
    setTimeout(() => {
      multibar.remove(packagesProgressBar);
      multibar.stop();
    }, 100);
  },
}
