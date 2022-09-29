const repo = require('./../repository');
const parseOptions = require('parse-options');
const {setArchiveBaseDir, setMageosPackageRepoUrl} = require('./../package-modules');
const {copyAdditionalPackages, processMirrorInstruction} = require('./../mirror-build-tools');
const {buildConfig: mirrorInstructions} = require('./../build-config/mirror-build-config');


const options = parseOptions(
  `$outputDir $gitRepoDir $repoUrl @help|h`,
  process.argv
);


if (options.help) {
  console.log(`Build Mage-OS mirror composer packages from github.com/mage-os git repositories.

Usage:
  node src/make/mirror.js [OPTIONS]
  
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


(async () => {
  try {
    for (const instruction of mirrorInstructions) {
      await processMirrorInstruction(instruction);
    }
    await copyAdditionalPackages(archiveDir);
  } catch (exception) {
    console.log(exception);
    throw exception
  }
})()
