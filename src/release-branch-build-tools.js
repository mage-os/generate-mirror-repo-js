const repo = require("./repository");
const {
  createPackagesForRef,
  createPackageForRef,
  createMagentoCommunityEditionMetapackage,
  createMagentoCommunityEditionProject,
  createMetaPackageFromRepoDir,
} = require('./package-modules');


/**
 * @param instructions
 * @returns {Promise<{}>}
 */
async function processBuildInstructions(instructions) {
  const packages = {}
  let built = {};

  const {repoUrl, ref, release} = instructions;

  for (const packageDir of (instructions.packageDirs || [])) {
    const {label, dir, exclude} = Object.assign({exclude: []}, packageDir);
    console.log(`Packaging ${label}`);
    built = await createPackagesForRef(repoUrl, dir, exclude, ref, release);
    Object.assign(packages, built);
  }

  for (const individualPackage of (instructions.packageIndividual || [])) {
    const defaults = {exclude: [], composerJsonPath: '', emptyDirsToAdd: []};
    const {label, dir, exclude, composerJsonPath, emptyDirsToAdd} = Object.assign(defaults, individualPackage);
    console.log(`Packaging ${label}`);
    built = await createPackageForRef(repoUrl, dir, exclude, ref, composerJsonPath, emptyDirsToAdd, release);
    Object.assign(packages, built);
  }

  for (const packageMeta of (instructions.packageMetaFromDirs || [])) {
    const {label, dir} = packageMeta;
    console.log(`Packaging ${label}`);
    built = await createMetaPackageFromRepoDir(repoUrl, dir, ref, release);
    Object.assign(packages, built);
  }

  if (instructions.magentoCommunityEditionMetapackage) {
    console.log('Packaging Magento Community Edition Product Metapackage');
    built = await createMagentoCommunityEditionMetapackage(repoUrl, ref, release);
    Object.assign(packages, built);
  }

  if (instructions.magentoCommunityEditionProject) {
    console.log('Packaging Magento Community Edition Project');
    built = await createMagentoCommunityEditionProject(repoUrl, ref, release);
    Object.assign(packages, built);
  }

  repo.clearCache();
  return packages;
}

module.exports = {
  processBuildInstructions
};
