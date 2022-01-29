const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const repo = require('./repository');

const cliProgress = require('cli-progress');
const multibar = new cliProgress.MultiBar({
  clearOnComplete: false,
  hideCursor: true,
  emptyOnZero: true,
  fps: 10,
  format: '[{bar}] {label}',
  forceRedraw: true,
}, cliProgress.Presets.shades_classic);

const gitRepoUrl = 'https://github.com/mage-os/mirror-magento2.git';
const tag = '2.4.3';

function lastTwoDirs(dir, sep) {
  return dir.split('/').slice(-2).join(sep || '/');
}

function addFileToZip(zip, mtime, {filepath, contentBuffer, isExecutable}) {
  const folders = filepath.split('/').slice(0, -1).reduce((acc, part) => {
    const parent = acc.length ? acc[acc.length -1] + '/' : '';
    return acc.concat([parent + part]);
  }, []);
  // create folders explicitly to be able to set the folder mtime
  for (const folder of folders) {
    zip.file(folder, '', {dir: true, date: mtime, unixPermissions: '775'});
  }
  zip.file(filepath, contentBuffer, {date: mtime, unixPermissions: isExecutable ? '755' : '644'}
  )
}

function zipFileWith(files, mtime) {
  const zip = new JSZip();
  files.map(file => addFileToZip(zip, mtime, file));
  return zip;
}

async function readComposerJson(url, dir, ref) {
  try {
    return repo.readFile(url, `${dir}/composer.json`, ref)
      .then(b => Buffer.from(b).toString('utf8'))
      .then(JSON.parse)
  } catch (exception) {
    console.error(`Unable to read ${lastTwoDirs(dir)}/composer.json`, exception);
    return {};
  }
}

async function createPackageForModule(url, moduleDir, ref) {

  try {
    const mtime = await repo.lastCommitTimeForFile(url, `${moduleDir}/composer.json`, ref);
    const {version, name} = await readComposerJson(url, moduleDir, ref);
    if (!version || !name) {
      console.error(`Unable determine module ${lastTwoDirs(moduleDir)} package name and/or version.`);
      return;
    }

    const packageFilepath = path.join(process.cwd(), 'packages', name + '-' + version + '.zip');
    const packageDir = path.dirname(packageFilepath);
    if (!fs.existsSync(packageDir)) fs.mkdirSync(packageDir, {recursive: true});
    
    const files = (await repo.listFiles(url, moduleDir, ref))
      .sort()
      .map(file => {
        file.filepath = file.filepath.substr(moduleDir.length + 1);
        return file;
      });

    fs.existsSync(packageFilepath) && fs.unlinkSync(packageFilepath);
    
    const zip = zipFileWith(files, mtime);
    const content = await zip.generateAsync({type: 'nodebuffer', streamFiles: false, platform: 'UNIX'});
    fs.writeFileSync(packageFilepath, content);
    
  } catch (exception) {
    console.error(`Skipping module ${lastTwoDirs(moduleDir, '_')}`, exception);
  }
}

(async (url, ref) => {
  const packagesProgressBar = multibar.create(100, 0, {label: `Listing Modules`});
  repo.setReportFn((s) => setTimeout(() => packagesProgressBar.update(null, {label: s}), 100));
  
  const modules = (await repo.listFolders(url, 'app/code/Magento', ref)).filter(dir => dir !== '.');
  
  packagesProgressBar.setTotal(modules.length);
  packagesProgressBar.update(null, {label: `${modules.length} modules`});

  let n = 0;
  for (const moduleDir of modules) {
    packagesProgressBar.increment(0, {label: `${++n}/${modules.length} Preparing ${(lastTwoDirs(moduleDir, '_'))}`});
    await createPackageForModule(url, moduleDir, ref);
    packagesProgressBar.increment(1, {label: `${n}/${modules.length} Finished ${(lastTwoDirs(moduleDir, '_'))}`});
  }
  setTimeout(() => {
    multibar.remove(packagesProgressBar);
    multibar.stop();
  }, 100);
})(gitRepoUrl, tag)