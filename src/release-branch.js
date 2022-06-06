const repo = require('./repository');
const parseOptions = require('parse-options');
const {setArchiveBaseDir, setMageosPackageRepoUrl} = require('./package-modules');
const {processBuildInstructions} = require('./release-branch-build-tools');
const {buildConfig: branchBuildInstructions} = require('./build-config/branch-build-config');

const options = parseOptions(
  `$outputDir $gitRepoDir $mirrorUrl @help|h`,
  process.argv
);


if (options.help) {
  console.log(`Build Mage-OS composer release packages from github.com/mage-os git repositories.

Usage:
  node src/main [OPTIONS]
  
Options:
  --outputDir=   Dir to contain the built packages (default: packages)
  --gitRepoDir=  Dir to clone repositories into (default: repositories)
  --mirrorUrl=   Composer repository URL to use in base package (default: https://mirror.mage-os.org/)
`);
  process.exit(1);
}

const archiveDir = options.outputDir || 'packages';
setArchiveBaseDir(archiveDir);

if (options.gitRepoDir) {
  repo.setStorageDir(options.gitRepoDir);
}

if (options.mirrorUrl) {
  setMageosPackageRepoUrl(options.mirrorUrl);
}

// Note to self:
//
// Next step: multi-pass processing of build instructions:
// 1. pass: determine which packages will be generated
// 2. pass: build packages and set the version for dependencies on to-be-generated packages to the release


(async () => {
  for (const instruction of branchBuildInstructions) {
    await processBuildInstructions(instruction);
  }  
})()

