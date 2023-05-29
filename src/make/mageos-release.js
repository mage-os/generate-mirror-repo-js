const repo = require('./../repository');
const parseOptions = require('parse-options');
const {
  getPackageVersionMap,
  prepRelease,
  processBuildInstructions,
  validateVersionString,
  buildMageOsProductCommunityEditionMetapackage
} = require('./../release-build-tools');
const {
  setArchiveBaseDir,
  setMageosPackageRepoUrl,
  createPackagesForRef,
  createPackageForRef,
  createMetaPackageFromRepoDir
} = require("../package-modules");
const {buildConfig: releaseInstructions} = require('./../build-config/mageos-release-build-config');

const options = parseOptions(
  `$outputDir $gitRepoDir $repoUrl $mageosRelease $upstreamRelease @help|h`,
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
const upstreamRelease = options.upstreamRelease || ''

validateVersionString(mageosRelease, 'mageosRelease');
upstreamRelease && validateVersionString(upstreamRelease, 'upstreamRelease');

(async () => {
  try {

    const upstreamVersionMap = upstreamRelease
      ? await getPackageVersionMap(upstreamRelease)
      : {}

    for (const instruction of releaseInstructions) {

      const workBranch = await prepRelease(mageosRelease, instruction, upstreamVersionMap)

      // TODO: maybe commit prepped branch and tag as mageosRelease?

      const releaseInstructions = {...instruction, ref: workBranch}
      await processBuildInstructions(mageosRelease, releaseInstructions, upstreamVersionMap)

      // TODO: maybe push commit and tag to repoUrl? Maybe leave that as a manual step?
    }
  } catch (exception) {
    console.log(exception);
    throw exception
  }
})()
