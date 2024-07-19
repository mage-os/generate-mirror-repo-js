const childProcess = require('child_process');
const {tmpdir} = require("os");
const repo = require("./repository");
const {accessSync, constants} = require("fs");
const fs = require("fs/promises");
const path = require("path");
const {readComposerJson, createMagentoCommunityEditionMetapackage,
  createPackagesForRef,
  createPackageForRef,
  createMetaPackageFromRepoDir,
  createMagentoCommunityEditionProject
} = require('./package-modules');


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
      const command = `composer create-project --ignore-platform-reqs --repository-url https://mirror.mage-os.org magento/project-community-edition ${workDir} ${version}`
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

async function installSampleData(dir) {
  // @see \Magento\SampleData\Model\Dependency::SAMPLE_DATA_SUGGEST
  const SAMPLE_DATA_SUGGEST = 'Sample Data version:';
  const listCommand = `composer suggests --all`
  const bufferBytes = 4 * 1024 * 1024; // 4M
  const output = await (new Promise((resolve, reject) => {
    childProcess.exec(listCommand, {maxBuffer: bufferBytes, cwd: dir}, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing command: ${error.message}`)
      }
      if (stderr) {
        reject(`[error] ${stderr}`)
      }
      resolve(stdout.trim())
    })
  }))
  const packages = output.split("\n").filter(line => line.includes(SAMPLE_DATA_SUGGEST)).map(line => {
    // A line looks like (without the quotes):
    // " - magento/module-bundle-sample-data: Sample Data version: 100.4.*"
    const re = new RegExp(`^.+(?<package>magento\\/[^:]+): ${SAMPLE_DATA_SUGGEST}.*?(?<version>\\d.*)$`)
    return line.replace(re, '$<package>:$<version>')
  })
  return packages.length === 0
    ? true
    : new Promise((resolve, reject) => {
      const installCommand = `composer require --ignore-platform-reqs "${packages.join('" "')}"`
      console.log(`Installing sample data packages`)
      childProcess.exec(installCommand, {maxBuffer: bufferBytes, cwd: dir}, (error, stdout, stderr) => {
        if (stderr && stderr.includes('Generating autoload files')) stderr = '';
        if (error) {
          reject(`Error executing command: ${error.message}`)
        }
        if (stderr) {
          reject(`[error] ${stderr}`)
        }
        resolve(true)
      })
    })
}

async function getInstalledPackageMap(dir) {
  const command = `composer show --format=json`
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
    throw new Error(`${name || 'Version'} "${version}" is not a valid version (X.Y.Z[-suffix]).`)
  }
}

function setMageOsVendor(packageName, vendor) {
  return packageName.replace(/^magento\//, `${vendor}/`)
}

function updateMapFromMagentoToMageOs(obj, vendor) {
  const packageNames = Object.keys(obj)
  return packageNames.reduce((acc, pkg) => Object.assign(acc, {[setMageOsVendor(pkg, vendor)]: obj[pkg]}), {})
}

function updateComposerDepsFromMagentoToMageOs(composerConfig, vendor) {
  composerConfig.name = setMageOsVendor(composerConfig.name, vendor)
  for (const dependencyType of ['require', 'require-dev', 'suggest', 'replace']) {
    composerConfig[dependencyType] && (composerConfig[dependencyType] = updateMapFromMagentoToMageOs(composerConfig[dependencyType], vendor))
  }
}

function setMageOsDependencyVersion(obj, dependencyType, releaseVersion, vendor) {
  const mageOsPackage = new RegExp(`^${vendor}/`)
  const packageNames = Object.keys(obj)
  packageNames.forEach(packageName => {
    if (packageName.match(mageOsPackage)) {
      obj[packageName] = dependencyType === 'suggest' && packageName.endsWith('-sample-data')
        ? `Sample Data version: ${releaseVersion}`
        : releaseVersion;
    }
  })
  return obj
}

function updateComposerDepsVersionForMageOs(composerConfig, releaseVersion, vendor) {
  for (const dependencyType of ['require', 'require-dev', 'suggest']) {
    composerConfig[dependencyType] && (composerConfig[dependencyType] = setMageOsDependencyVersion(composerConfig[dependencyType], dependencyType, releaseVersion, vendor))
  }
}

function updateComposerPluginConfigForMageOs(composerConfig, vendor) {
  if (composerConfig?.['config']?.['allow-plugins']) {
    Object.keys(composerConfig['config']['allow-plugins']).forEach(plugin => {
      const val = composerConfig['config']['allow-plugins'][plugin]
      delete composerConfig['config']['allow-plugins'][plugin]
      composerConfig['config']['allow-plugins'][setMageOsVendor(plugin, vendor)] = val
    })
  }
}

/**
 * Replace all occurrences of the magento vendor name with the given vendor in a composer.json
 *
 * This also happens for the "replace" section, before the given replaceVersionMap is merged.
 */
function updateComposerConfigFromMagentoToMageOs(composerConfig, releaseVersion, replaceVersionMap, vendor) {
  const originalPackageName = composerConfig.name

  composerConfig.version = releaseVersion
  composerConfig.name = setMageOsVendor(composerConfig.name, vendor)
  
  updateComposerDepsFromMagentoToMageOs(composerConfig, vendor)
  updateComposerDepsVersionForMageOs(composerConfig, releaseVersion, vendor)
  updateComposerPluginConfigForMageOs(composerConfig, vendor)

  if (replaceVersionMap[originalPackageName]) {
    composerConfig.replace = {[originalPackageName]: replaceVersionMap[originalPackageName]}
  }
}

async function prepPackageForRelease({label, dir}, repoUrl, ref, releaseVersion, vendor, replaceVersionMap, workingCopyPath) {
  console.log(`Preparing ${label}`);

  const composerConfig = JSON.parse(await readComposerJson(repoUrl, dir, ref))
  updateComposerConfigFromMagentoToMageOs(composerConfig, releaseVersion, replaceVersionMap, vendor)

  // write composerJson to file in repo
  const file = path.join(workingCopyPath, dir, 'composer.json');
  await fs.writeFile(file, JSON.stringify(composerConfig, null, 2), 'utf8')
}


async function buildMageOsProductCommunityEditionMetapackage(releaseVersion, instruction, replaceVersionMap, vendor) {
  const {ref, repoUrl} = instruction

  console.log('Packaging Mage-OS Community Edition Product Metapackage');

  return createMagentoCommunityEditionMetapackage(repoUrl, ref, {
    release: releaseVersion,
    vendor,
    dependencyVersions: {'*': releaseVersion},
    transform: {
      [`${vendor}/product-community-edition`]: [
        (composerConfig) => {
          updateComposerConfigFromMagentoToMageOs(composerConfig, releaseVersion, replaceVersionMap, vendor)
          return composerConfig
        }
      ]
    }
  })
}

async function buildMageOsProjectCommunityEditionMetapackage(releaseVersion, instruction, replaceVersionMap, vendor, dependencyVersions) {
  const {ref, repoUrl} = instruction

  console.log('Packaging Mage-OS Community Edition Project');

  return createMagentoCommunityEditionProject(repoUrl, ref, {
    release: releaseVersion,
    vendor,
    dependencyVersions,
    minimumStability: 'stable',
    description: 'Community built eCommerce Platform for Growth',
    transform: {
      [`${vendor}/project-community-edition`]: [
        (composerConfig) => {
          updateComposerConfigFromMagentoToMageOs(composerConfig, releaseVersion, replaceVersionMap, vendor)
          return composerConfig
        }
      ]
    }
  })
}


module.exports = {
  validateVersionString,
  updateComposerConfigFromMagentoToMageOs,
  async getPackageVersionMap(releaseVersion) {
    const dir = await composerCreateMagentoProject(releaseVersion)
    await installSampleData(dir)
    return getInstalledPackageMap(dir)
  },
  async prepRelease(releaseVersion, vendor, instruction, replaceVersionMap) {
    const {ref, repoUrl} = instruction

    const workBranch = `prep-release/${vendor}-${releaseVersion}`;

    const workingCopyPath = await repo.pull(repoUrl, ref);
    await repo.createBranch(repoUrl, workBranch, ref);

    for (const packageDirInstruction of (instruction.packageDirs || [])) {
      const childPackageDirs = await fs.readdir(path.join(workingCopyPath, packageDirInstruction.dir));

      for (let childPackageDir of childPackageDirs) {
        // Add trailing slash to our dir, so it matches excludes strings.
        if ((packageDirInstruction.excludes || []).includes(childPackageDir + path.sep)) {
          // Skip directory
          continue
        }

        const workingChildPackagePath = path.join(workingCopyPath, packageDirInstruction.dir, childPackageDir);

        if (!(await fs.lstat(workingChildPackagePath)).isDirectory()) {
          // Not a directory, skip
          continue
        }

        const childPackageFiles = await fs.readdir(workingChildPackagePath);
        if (!childPackageFiles.includes('composer.json')) {
          throw new Error(`Error: ${workingChildPackagePath} doesn\'t contain a composer.json! Please add to excludes in config.`);
        }

        childPackageDir = path.join(packageDirInstruction.dir, childPackageDir);
        const composerJson = JSON.parse(await readComposerJson(repoUrl, childPackageDir, workBranch));

        const instruction = {
          'label': `${composerJson.name} (part of ${packageDirInstruction.label})`,
          'dir': childPackageDir
        }
        await prepPackageForRelease(instruction, repoUrl, workBranch, releaseVersion, vendor, replaceVersionMap, workingCopyPath);
      }
    }

    for (const individualInstruction of (instruction.packageIndividual || [])) {
      await prepPackageForRelease(individualInstruction, repoUrl, workBranch, releaseVersion, vendor, replaceVersionMap, workingCopyPath);
    }

    for (const packageDirInstruction of (instruction.packageMetaFromDirs || [])) {
      await prepPackageForRelease(packageDirInstruction, repoUrl, workBranch, releaseVersion, vendor, replaceVersionMap, workingCopyPath)
    }

    if (instruction.magentoCommunityEditionMetapackage) {
      // nothing to do - the product-community-edition metapackage composer.json is built from a template
    }

    if (instruction.magentoCommunityEditionProject) {
      // update the base composer.json for releasing (doesn't happen for the base package because that uses a composer.json template)
      const instruction = {
        'label': 'Mage-OS Community Edition Project Metapackage',
        'dir': ''
      }
      await prepPackageForRelease(instruction, repoUrl, workBranch, releaseVersion, vendor, replaceVersionMap, workingCopyPath)
    }

    return workBranch
  },

  async processBuildInstructions(mageosRelease, vendor, instruction, upstreamVersionMap) {
    const dependencyVersions = {'*': mageosRelease}
    const fallbackVersion = mageosRelease

    const packages = {} // record generated packages with versions

    const {repoUrl, transform, ref, origRef} = instruction

    for (const packageDir of (instruction.packageDirs || [])) {
      const {label, dir, excludes} = Object.assign({excludes: []}, packageDir)
      console.log(`Packaging ${label}`)
      const built = await createPackagesForRef(repoUrl, dir, ref, {
        excludes,
        mageosRelease,
        fallbackVersion,
        dependencyVersions,
        transform,
        origRef,
        vendor
      })
      Object.assign(packages, built)
    }

    for (const individualPackage of (instruction.packageIndividual || [])) {
      const defaults = {excludes: [], composerJsonPath: '', emptyDirsToAdd: []}
      const {label, dir, excludes, composerJsonPath, emptyDirsToAdd} = Object.assign(defaults, individualPackage)
      console.log(`Packaging ${label}`)

      const built = await createPackageForRef(repoUrl, dir, ref, {
        excludes,
        composerJsonPath,
        emptyDirsToAdd,
        mageosRelease,
        fallbackVersion,
        dependencyVersions,
        transform,
        origRef,
        vendor
      })
      Object.assign(packages, built)
    }

    for (const packageMeta of (instruction.packageMetaFromDirs || [])) {
      const {label, dir} = packageMeta
      console.log(`Packaging ${label}`)
      const built = await createMetaPackageFromRepoDir(repoUrl, dir, ref, {mageosRelease, dependencyVersions, transform});
      Object.assign(packages, built)
    }

    if (instruction.magentoCommunityEditionMetapackage) {
      const built = await buildMageOsProductCommunityEditionMetapackage(mageosRelease, instruction, {replaceVersionMap: upstreamVersionMap}, vendor, dependencyVersions)
      Object.assign(packages, built)
    }

    if (instruction.magentoCommunityEditionProject) {
      const built = await buildMageOsProjectCommunityEditionMetapackage(mageosRelease, instruction, {replaceVersionMap: upstreamVersionMap}, vendor, dependencyVersions)
      Object.assign(packages, built)
    }

    return packages
  },
}
