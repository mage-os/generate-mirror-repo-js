const repo = require('./../repository');
const parseOptions = require('parse-options');
const {setArchiveBaseDir, setMageosPackageRepoUrl} = require('./../package-modules');
const {processBuildInstructions} = require('./../release-branch-build-tools');
const {buildConfig: branchBuildInstructions} = require('./../build-config/upstream-nightly-build-config');

const options = parseOptions(
  `$outputDir $gitRepoDir $repoUrl @help|h`,
  process.argv
);


if (options.help) {
  console.log(`Build Mage-OS release packages from github.com/mage-os git repositories.

Usage:
  node src/make/upstream-nightly.js [OPTIONS]
  
Options:
  --outputDir=   Dir to contain the built packages (default: packages)
  --gitRepoDir=  Dir to clone repositories into (default: repositories)
  --repoUrl=     Composer repository URL to use in base package (default: https://repo.mage-os.org/)
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

processBuildInstructions(branchBuildInstructions);

