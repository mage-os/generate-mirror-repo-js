const repo = require('./repository');
const parseOptions = require('parse-options');
const {getPackageVersionsForBuildInstructions, getReleaseDateString} = require('./release-branch-build-tools');
const {buildConfig: branchBuildInstructions} = require('./build-config/upstream-nightly-build-config');

const options = parseOptions(
  `$gitRepoDir @help|h`,
  process.argv
);


if (options.help) {
  console.log(`Print out Mage-OS composer release packages with versions that would used for a nightly build.

Usage:
  node src/packages-and-versions [OPTIONS]
  
Options:
  --gitRepoDir=  Dir to clone repositories into (default: repositories)
`);
  process.exit(1);
}

if (options.gitRepoDir) {
  repo.setStorageDir(options.gitRepoDir);
}

getPackageVersionsForBuildInstructions(branchBuildInstructions, getReleaseDateString())
  //.then(packages => Object.keys(packages).map(name => console.log(`${name}: ${packages[name]}`)))
  .then(packages => console.log(packages['magento/magento2-base']))
