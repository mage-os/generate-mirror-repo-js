const repo = require("./repository");
const {
  createPackagesForRef,
  createPackageForRef,
  createMagentoCommunityEditionMetapackage,
  createMagentoCommunityEditionProject,
  createMetaPackageFromRepoDir,
  determinePackagesForRef,
  determinePackageForRef,
  determineMetaPackageFromRepoDir,
  determineMagentoCommunityEditionMetapackage,
  determineMagentoCommunityEditionProject,
} = require('./package-modules');

/**
 * @param {{repoUrl:String, ref:String, release:String|undefined}} instructions
 * @returns {Promise<{}>}
 */
async function getPackagesForBuildInstruction(instructions) {
  const packages = {}
  let toBeBuilt = {};

  const {repoUrl, ref, release} = instructions;

  for (const packageDir of (instructions.packageDirs || [])) {
    const {label, dir, excludes} = Object.assign({excludes: []}, packageDir);
    console.log(`Inspecting ${label}`);
    toBeBuilt = await determinePackagesForRef(repoUrl, dir, ref, {excludes, release});
    Object.assign(packages, toBeBuilt);
  }

  for (const individualPackage of (instructions.packageIndividual || [])) {
    const defaults = {excludes: [], composerJsonPath: '', emptyDirsToAdd: []};
    const {label, dir, excludes, composerJsonPath, emptyDirsToAdd} = Object.assign(defaults, individualPackage);
    console.log(`Inspecting ${label}`);
    toBeBuilt = await determinePackageForRef(repoUrl, dir, ref, {excludes, composerJsonPath, emptyDirsToAdd, release});
    Object.assign(packages, toBeBuilt);
  }

  for (const packageMeta of (instructions.packageMetaFromDirs || [])) {
    const {label, dir} = packageMeta;
    console.log(`Inspecting ${label}`);
    toBeBuilt = await determineMetaPackageFromRepoDir(repoUrl, dir, ref, release);
    Object.assign(packages, toBeBuilt);
  }

  if (instructions.magentoCommunityEditionMetapackage) {
    console.log('Inspecting Magento Community Edition Product Metapackage');
    toBeBuilt = await determineMagentoCommunityEditionMetapackage(repoUrl, ref, release);
    Object.assign(packages, toBeBuilt);
  }

  if (instructions.magentoCommunityEditionProject) {
    console.log('Inspecting Magento Community Edition Project');
    toBeBuilt = await determineMagentoCommunityEditionProject(repoUrl, ref, release);
    Object.assign(packages, toBeBuilt);
  }

  repo.clearCache();
  return packages;
}

async function getPackageVersionsForBuildInstructions(buildInstructions) {
  console.log(`Determining package versions`);
  let packages = {};
  for (const instruction of buildInstructions) {
    Object.assign(packages, await getPackagesForBuildInstruction(instruction));
  }
  return packages;
}

/**
 * @param {{}} instruction
 * @param {{}} dependencyVersions
 * @returns {Promise<{}>}
 */
async function processBuildInstruction(instruction, dependencyVersions) {
  const packages = {}
  let built = {};

  const {repoUrl, ref, release} = instruction;

  for (const packageDir of (instruction.packageDirs || [])) {
    const {label, dir, excludes} = Object.assign({excludes: []}, packageDir);
    console.log(`Packaging ${label}`);
    built = await createPackagesForRef(repoUrl, dir, ref, {excludes, release, dependencyVersions});
    Object.assign(packages, built);
  }

  for (const individualPackage of (instruction.packageIndividual || [])) {
    const defaults = {excludes: [], composerJsonPath: '', emptyDirsToAdd: []};
    const {label, dir, excludes, composerJsonPath, emptyDirsToAdd} = Object.assign(defaults, individualPackage);
    console.log(`Packaging ${label}`);
    built = await createPackageForRef(repoUrl, dir, ref, {excludes, composerJsonPath, emptyDirsToAdd, release, dependencyVersions});
    Object.assign(packages, built);
  }

  for (const packageMeta of (instruction.packageMetaFromDirs || [])) {
    const {label, dir} = packageMeta;
    console.log(`Packaging ${label}`);
    built = await createMetaPackageFromRepoDir(repoUrl, dir, ref, {release, dependencyVersions});
    Object.assign(packages, built);
  }

  if (instruction.magentoCommunityEditionMetapackage) {
    console.log('Packaging Magento Community Edition Product Metapackage');
    built = await createMagentoCommunityEditionMetapackage(repoUrl, ref, {release, dependencyVersions});
    Object.assign(packages, built);
  }

  if (instruction.magentoCommunityEditionProject) {
    console.log('Packaging Magento Community Edition Project');
    const minimumStability = 'alpha';
    built = await createMagentoCommunityEditionProject(repoUrl, ref, {release, dependencyVersions, minimumStability});
    Object.assign(packages, built);
  }

  repo.clearCache();
  return packages;
}

/**
 * @param {Array<{}>} instructions
 * @returns {Promise<void>}
 */
async function processBuildInstructions(instructions) {
  const packageVersions = await getPackageVersionsForBuildInstructions(instructions);
  for (const instruction of instructions) {
    await processBuildInstruction(instruction, packageVersions);
  }
}

module.exports = {
  processBuildInstructions,
  getPackageVersionsForBuildInstructions,
};
