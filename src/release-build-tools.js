const childProcess = require('child_process');
const {createHash} = require("crypto");
const {tmpdir} = require("os");
const {cwd, chdir} = require("process");
const {accessSync, constants} = require("fs");
const fs = require("fs/promises");
const path = require("path");


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
  async determineUpstreamPackageVersions(upstreamRelease) {
    const dir = await composerCreateMagentoProject(upstreamRelease)
    return getInstalledPackageMap(dir)
  },
  processReleaseInstructions() {}
}