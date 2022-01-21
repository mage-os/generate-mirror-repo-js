
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
// const gitRepoUrl = 'https://github.com/mage2tv/magento-cache-clean.git';
// const tag = '1.0.0';

function lastTwoDirs(dir, sep) {
  return dir.split('/').slice(-2).join(sep || '/');
}

function addFileToZip(zip, {filepath, contentBuffer, isExecutable}) {
  zip.file(
    filepath,
    contentBuffer,
    {date: new Date(0), unixPermissions: isExecutable ? '755' : '644'}
  )
}

function zipFileWith(files, callback) {
  const zip = new JSZip();
  files.map(file => {
    addFileToZip(zip, file)
    callback && callback(file);
  });
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
    const {version, name} = await readComposerJson(url, moduleDir, ref);
    if (! version || ! name) {
      console.error(`Unable determine module ${lastTwoDirs(moduleDir)} package name and/or version.`);
      return;
    }
    
    const packageFilepath = path.join(process.cwd(), 'packages', name + '-' + version + '.zip');
    const packageDir = path.dirname(packageFilepath);
    if (!fs.existsSync(packageDir)) fs.mkdirSync(packageDir, {recursive: true});
    
    const files = (await repo.listFiles(url, moduleDir, ref)).map(file => {
      file.filepath = file.filepath.substr(moduleDir.length +1);
      return file;
    });
    const filesProgressBar = multibar.create(files.length, 0, {label: `[${lastTwoDirs(moduleDir, '_')}] 0/${files.length}`});
    const updateProgressCallback = (file) => {
      filesProgressBar.increment({label: `[${lastTwoDirs(moduleDir, '_')}] ${file.filepath}`});
    }
    
    //console.log(`Found ${files.length} files to add to ${path.basename(packageFilepath)}`);
    zipFileWith(files, updateProgressCallback)
      .generateNodeStream({streamFiles: true, platform: 'UNIX'})
      .pipe(fs.createWriteStream(packageFilepath))
      .on('finish', () => {
        filesProgressBar.update(null, {label: `[${lastTwoDirs(moduleDir, '_')}] - done`})
        setTimeout(() => multibar.remove(filesProgressBar), 10000);
      });
    
  } catch (exception) {
    filesProgressBar && filesProgressBar.stop();
    console.error(`Skipping module ${lastTwoDirs(moduleDir, '_')}`, exception);
  }
}

(async (url, ref) => {
  const packagesProgressBar = multibar.create(100, 0, {label: `Listing Modules`});
  repo.setReportFn((s) => packagesProgressBar.update(null, {label: s}));
  const modules = (await repo.listFolders(url, 'app/code/Magento', ref)).filter(dir => dir !== '.');
  packagesProgressBar.setTotal(modules.length);
  packagesProgressBar.update(null, {label: `${modules.length} modules`});

  for (const moduleDir of modules) {
    packagesProgressBar.increment({label: `Preparing ${lastTwoDirs(moduleDir, '_')}`});
    await createPackageForModule(url, moduleDir, ref);
  }
  multibar.bars.forEach(bar => multibar.remove(bar));
})(gitRepoUrl, tag)