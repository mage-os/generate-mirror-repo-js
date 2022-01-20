
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const repo = require('./repository');

const gitRepoUrl = 'https://github.com/mage-os/mirror-magento2.git';
const tag = '2.4.3';
// const gitRepoUrl = 'https://github.com/mage2tv/magento-cache-clean.git';
// const tag = '1.0.0';

function lastTwoDirs(dir, sep) {
  return dir.split('/').slice(-2).join(sep || '/');
}

function addFileToZip(zip, {filepath, mtime, contentBuffer, isExecutable}) {
  //console.log(`Adding file ${filepath}`);
  zip.file(
    filepath,
    contentBuffer,
    {date: new Date(mtime), unixPermissions: isExecutable ? '755' : '644'}
  )
}

function zipFileWith(files) {
  const zip = new JSZip();
  files.map(file => addFileToZip(zip, file));
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

async function createPackageForModule(url, dir, ref) {
  
  try {
    const {version, name} = await readComposerJson(url, dir, ref);
    if (! version || ! name) {
      console.error(`Unable determine module ${lastTwoDirs(dir)} package name and/or version.`);
      return;
    }

    const packageFilepath = path.join(process.cwd(), 'packages', name + '-' + version + '.zip');
    const packageDir = path.dirname(packageFilepath);
    if (!fs.existsSync(packageDir)) fs.mkdirSync(packageDir, {recursive: true});

    console.log(`Packing ${path.basename(packageFilepath)}...`);
    const files = await repo.listFiles(url, dir, ref);
    console.log(`Found ${files.length} files to add to ${path.basename(packageFilepath)}`);
    zipFileWith(files)
      .generateNodeStream({streamFiles: true, platform: 'UNIX'})
      .pipe(fs.createWriteStream(packageFilepath))
      .on('finish', () => console.log(`Finished ${path.basename(packageFilepath)}`));
    
  } catch (exception) {
    console.error(`Skipping module ${lastTwoDirs(dir, '_')}`, exception);
  }
}

(async (url, ref) => {
  console.log(`Listing modules...`);
  const modules = (await repo.listFolders(url, 'app/code/Magento', ref)).filter(dir => dir !== '.');
  console.log(`Found ${modules.length} modules in "app/code/Magento"`);
  for (const moduleDir of modules) {
    await createPackageForModule(url, moduleDir, ref);
  }
})(gitRepoUrl, tag)