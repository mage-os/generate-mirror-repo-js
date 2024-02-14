const repo = require('./../repository');
const parseOptions = require('parse-options');
const {
  getPackageVersionMap,
  prepRelease,
  processBuildInstructions,
  validateVersionString,
  updateComposerConfigFromMagentoToMageOs,
} = require('./../release-build-tools');
const {
  setArchiveBaseDir,
  setMageosPackageRepoUrl,
} = require("../package-modules");
const {buildConfig: releaseInstructions} = require('./../build-config/mageos-release-build-config');
const {processMirrorInstruction} = require("../mirror-build-tools");

const options = parseOptions(
  `$outputDir $gitRepoDir $repoUrl $mageosVendor $mageosRelease $upstreamRelease @help|h`,
  process.argv
);


if (options.help) {
  console.log(`Build Mage-OS release packages from github.com/mage-os git repositories.

Usage:
  node src/make/mageos-release.js [OPTIONS]

Options:
  --outputDir=       Dir to contain the built packages (default: packages)
  --gitRepoDir=      Dir to clone repositories into (default: repositories)
  --repoUrl=         Composer repository URL to use in base package (default: https://repo.mage-os.org/)
  --mageosVendor=    Composer release vendor-name (default: mage-os)
  --mageosRelease=   Target Mage-OS release version
  --upstreamRelease= Upstream Magento Open Source release to use for package compatibility
`);
  process.exit(1);
}

const archiveDir = options.outputDir || 'packages';
setArchiveBaseDir(archiveDir);

if (options.gitRepoDir) {
  repo.setStorageDir(options.gitRepoDir);
}

if (options.repoUrl) {
  setMageosPackageRepoUrl(options.repoUrl);
}

const mageosRelease = options.mageosRelease || ''
const mageosVendor = options.mageosVendor || 'mage-os'
const upstreamRelease = options.upstreamRelease || ''

mageosRelease && validateVersionString(mageosRelease, 'mageosRelease');
upstreamRelease && validateVersionString(upstreamRelease, 'upstreamRelease');

if (upstreamRelease && ! mageosRelease) {
  throw new Error(`An upstream release may only be specified when building a new release`)
}

(async () => {
  try {
    console.log(`Building previous ${mageosVendor} releases`)
    for (const instructions of releaseInstructions) {
      // set vendor for product-community-edition and project-community-edition meta packages
      if (instructions.magentoCommunityEditionProject || instructions.magentoCommunityEditionMetapackage) {
        instructions.vendor = mageosVendor
      }
      if (instructions.magentoCommunityEditionMetapackage) {
        // update product package magento dependencies taken from the root composer.json to given vendor
        const productPackage = `${mageosVendor}/product-community-edition`;
        instructions.transform = instructions.transform || {}
        instructions.transform[productPackage] = instructions.transform[productPackage] || []
        instructions.transform[productPackage].push((composerConfig) => {
          updateComposerConfigFromMagentoToMageOs(composerConfig, composerConfig.version, {}, mageosVendor)
          return composerConfig
        })
      }
      await processMirrorInstruction(instructions)
    }

    if (mageosRelease) {
      console.log(`Building new ${mageosVendor} release ${mageosRelease}`)
      const upstreamVersionMap = upstreamRelease
        ? await getPackageVersionMap(upstreamRelease)
        : {}

      for (const instruction of releaseInstructions) {
        const workBranch = await prepRelease(mageosRelease, mageosVendor, instruction, upstreamVersionMap)
        await repo.addUpdated(instruction.repoUrl, `'*composer.json'`)
        await repo.commit(instruction.repoUrl, workBranch, `Release ${mageosRelease}`)
        await repo.createTagForRef(instruction.repoUrl, workBranch, mageosRelease, '')
        await processBuildInstructions(mageosRelease, mageosVendor, {...instruction, ref: mageosRelease, origRef: instruction.ref}, upstreamVersionMap)
      }
    }
  } catch (exception) {
    console.log(exception);
    throw exception
  }
})()
