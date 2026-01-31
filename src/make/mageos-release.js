const repo = require('./../repository');
const parseOptions = require('parse-options');
const fs = require('fs');
const path = require('path');
const {
  getPackageVersionMap,
  prepRelease,
  processBuildInstructions,
  validateVersionString,
} = require('./../release-build-tools');
const packageModules = require("../package-modules");
const {setArchiveBaseDir} = packageModules;
const {generateAliasesFromBuiltPackages} = require("../package-aliases");
const {buildConfig: releaseInstructions} = require('./../build-config/mageos-release-build-config');
const {processMirrorInstruction} = require("../mirror-build-tools");
const {fetchPackagistList} = require('../packagist');
const buildState = require('../type/build-state');

const options = parseOptions(
  `$outputDir $gitRepoDir $repoUrl $mageosVendor $mageosRelease $upstreamRelease @skipHistory @generateAliases @help|h`,
  process.argv
);

const skipHistory = options.skipHistory;
const generateAliases = options.generateAliases;

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
  --releaseRefsFile= JS file exporting a map with the git repo refs to use for the release
  --upstreamRelease= Upstream Magento Open Source release to use for package compatibility
  --skipHistory      Skip rebuilding of historic releases
  --generateAliases  Generate magento/* alias metapackages that require mage-os/* packages.
                     This allows third-party extensions requiring magento/* packages to
                     resolve against the Mage-OS repository.
`);
  process.exit(1);
}

const archiveDir = options.outputDir || 'packages';
setArchiveBaseDir(archiveDir);

if (options.gitRepoDir) {
  repo.setStorageDir(options.gitRepoDir);
}

const mageosRelease = options.mageosRelease || '';
const mageosVendor = options.mageosVendor || 'mage-os';
const mageosRepoUrl = options.repoUrl || 'https://repo.mage-os.org/';
const upstreamRelease = options.upstreamRelease || '';
const releaseRefsFile = options.releaseRefsFile || path.join(__dirname, `./../build-config/${mageosVendor}-release-refs/${mageosRelease}.js`);

mageosRelease && validateVersionString(mageosRelease, 'mageosRelease');
upstreamRelease && validateVersionString(upstreamRelease, 'upstreamRelease');

if (upstreamRelease && ! mageosRelease) {
  throw new Error(`An upstream release may only be specified when building a new release`)
}

const releaseRefs = fs.existsSync(releaseRefsFile)
  ? require(releaseRefsFile)
  : {};

let distroRelease = new buildState({
  version: mageosRelease,
  composerRepoUrl: mageosRepoUrl,
  fallbackVersion: mageosRelease,
  dependencyVersions: {'*': mageosRelease}
});

(async () => {
  try {
    await fetchPackagistList(mageosVendor);

    if (! skipHistory) {
      console.log(`Building previous ${mageosVendor} releases`)
      for (const instruction of releaseInstructions) {
        instruction.vendor = mageosVendor;

        await processMirrorInstruction(instruction, distroRelease);
      }
    }

    if (mageosRelease) {
      console.log(`Building new ${mageosVendor} release ${mageosRelease}`)
      const upstreamVersionMap = upstreamRelease
        ? await getPackageVersionMap(upstreamRelease)
        : {};

      distroRelease.replaceVersions = upstreamVersionMap;

      for (const instruction of releaseInstructions) {
        if (releaseRefs['*']) {
          instruction.ref = releaseRefs['*'];
        }
        if (releaseRefs[instruction.key]) {
          instruction.ref = releaseRefs[instruction.key];
        }
        instruction.vendor = mageosVendor;

        const workBranch = await prepRelease(instruction, distroRelease)
        await repo.addUpdated(instruction.repoUrl, `'*composer.json'`)
        await repo.commit(instruction.repoUrl, workBranch, `Release ${mageosRelease}`)
        await repo.createTagForRef(instruction.repoUrl, workBranch, mageosRelease, '')

        distroRelease.origRef = instruction.ref;
        instruction.ref = mageosRelease;
        await processBuildInstructions(instruction, distroRelease);
      }
    }

    // Generate magento/* alias packages by scanning all built mage-os packages
    if (generateAliases) {
      console.log(`\nGenerating magento/* alias packages...`);
      const aliasPackages = await generateAliasesFromBuiltPackages(archiveDir, packageModules);
      console.log(`Alias generation complete. Created ${Object.keys(aliasPackages).length} alias packages.\n`);
    }
  } catch (exception) {
    console.log(exception);
    throw exception
  }
})()
