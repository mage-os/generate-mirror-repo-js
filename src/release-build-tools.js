const childProcess = require('child_process');
const {createHash} = require("crypto");
const {tmpdir} = require("os");
const {cwd, chdir} = require("process");
const repo = require("./repository");
const {accessSync, constants} = require("fs");
const fs = require("fs/promises");
const path = require("path");
const {readComposerJson} = require('./package-modules');


function fsExists(dirOrFile) {
  try {
    accessSync(dirOrFile, constants.R_OK);
    return true;
  } catch (exception) {
    return false;
  }
}


async function composerCreateMagentoProject(version) {
  console.log(`Determining upstream package versions for release ${version}...`);
  const workDir = `${tmpdir()}/workdir-${version}`;
  return new Promise((resolve, reject) => {
    if (fsExists(workDir)) {
      console.log(`Found existing installation at ${workDir}`)
      resolve(workDir)
    } else {
      const command = `composer create-project --repository-url https://mirror.mage-os.org magento/project-community-edition ${workDir} ${version}`
      console.log(`Running ${command}`)
      const bufferBytes = 4 * 1024 * 1024; // 4M
      childProcess.exec(command, {maxBuffer: bufferBytes}, (error, stdout, stderr) => {
        //if (stderr && stderr.includes('Warning: The lock file is not up-to-date with the latest changes in composer.json')) stderr = '';
        if (stderr && stderr.includes('Generating autoload files')) stderr = '';
        if (error) {
          reject(`Error executing command: ${error.message}`)
        }
        if (stderr) {
          reject(`[error] ${stderr}`)
        }
        resolve(workDir)
      })
    }
  })
}

async function getInstalledPackageMap(dir) {
  const command = `composer show --format=json`
  console.log(`Running ${command}`)
  const bufferBytes = 4 * 1024 * 1024; // 4M
  const output = await (new Promise((resolve, reject) => {
    childProcess.exec(command, {maxBuffer: bufferBytes, cwd: dir}, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing command: ${error.message}`)
      }
      if (stderr) {
        reject(`[error] ${stderr}`)
      }
      resolve(stdout)
    })
  }))
  return JSON.parse(output).installed.reduce((map, installedPackage) => {
    map[installedPackage.name] = installedPackage.version
    return map;
  })
}

function validateVersionString(version, name) {
  const options = [
    /^[0-9]+\.[0-9]+(-[a-z][a-z0-9.]*)?$/, // e.g, 1.0, 1.2-beta, 2.4-p2
    /^[0-9]+\.[0-9]+\.[0-9]+(-[a-z][a-z0-9.]*)?$/ // e.g. 1.0.0, 1.2.1-alpha, 1.2.2-patch2
  ]
  if (options.map(re => version.match(re)).filter(v => v !== null).length === 0) {
    throw new Error(`${name||'Version'} "${version}" is not a valid version (X.Y.Z[-suffix]).`)
  }
}

module.exports = {
  validateVersionString,
  async getPackageVersionMap(releaseVersion) {
    const dir = await composerCreateMagentoProject(releaseVersion)
    // todo: install sample data
    // todo: look at all suggested packages that end with -sample-data
    // todo: parse version constraint from value "Sample Data version: 100.4.*"
    // todo: composer require all sample packages with the version constraints
    return getInstalledPackageMap(dir)
  },
  async prepRelease(releaseVersion, instruction, options) {
    const {replaceVersionMap} = options
    const {ref, repoUrl} = instruction
    
    const workingCopyPath = await repo.checkout(repoUrl, ref)
    
    // todo: check out work-in-progress branch (temporary, can be deleted again after commit and tag)
    
    // iterate over build instructions
    for (const individualInstruction of (instruction.packageIndividual || [])) {
      const {label, dir} = individualInstruction;
      console.log(`Preparing ${label}`);

      const composerJson = JSON.parse(await readComposerJson(repoUrl, dir, ref))
      composerJson.version = releaseVersion
      if (replaceVersionMap[composerJson.name]) {
        composerJson.replace = {[composerJson.name]: replaceVersionMap[composerJson.name]}
      }
      composerJson.name = composerJson.name.replace(/^magento\//, 'mageos/')
      // todo: replace magento in package vendor names with mageos in require, require-dev and suggest
      // todo: replace version of magento package dependency with build version in require, require-dev and suggest
      
      // write composerJson to file in repo
      const file = path.join(workingCopyPath, dir, 'composer.json');
      await fs.writeFile(file, JSON.stringify(composerJson, null, 4), 'utf8')
    }
    
    // todo: commit all changes
    // todo: tag release version
  }
}