const repo = require('./../repository');
const parseOptions = require('parse-options');
const {setArchiveBaseDir} = require('./../package-modules');
const {
  processNightlyBuildInstructions,
  determineLatestUpstreamMagentoRelease,
} = require('./../release-branch-build-tools');
const {getPackageVersionMap} = require('./../release-build-tools');
const {buildConfig: branchBuildInstructions} = require('./../build-config/mageos-nightly-build-config');

const options = parseOptions(
  `$outputDir $gitRepoDir $repoUrl $upstreamRelease @help|h`,
  process.argv
);


if (options.help) {
  console.log(`Build Mage-OS release packages from github.com/mage-os/mageos-* git repositories.

Usage:
  node src/make/mageos-nightly.js [OPTIONS]

Options:
  --outputDir=        Dir to contain the built packages (default: packages)
  --gitRepoDir=       Dir to clone repositories into (default: repositories)
  --repoUrl=          Composer repository URL to use in base package (default: https://repo.mage-os.org/)
  --upstreamRelease=  Upstream Magento Open Source release used to populate the replace map
                      of nightly mage-os/* packages. Auto-detected from mirror.mage-os.org if omitted.
`);
  process.exit(1);
}

const archiveDir = options.outputDir || 'packages';
setArchiveBaseDir(archiveDir);

if (options.gitRepoDir) {
  repo.setStorageDir(options.gitRepoDir);
}

for (const instruction of branchBuildInstructions) {
  instruction.vendor = 'mage-os';
}

(async () => {
  try {
    const upstreamRelease = options.upstreamRelease || await determineLatestUpstreamMagentoRelease();
    console.log(`Using upstream Magento release ${upstreamRelease} as source of replace versions`);
    const replaceVersions = await getPackageVersionMap(upstreamRelease, {skipSampleData: true});

    await processNightlyBuildInstructions(branchBuildInstructions, options.repoUrl || 'https://nightly.mage-os.org/', {
      replaceVersions,
    });
  } catch (exception) {
    console.error(exception);
    process.exit(1);
  }
})();

