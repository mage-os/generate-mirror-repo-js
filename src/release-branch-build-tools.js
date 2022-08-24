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
  getLatestTag
} = require('./package-modules');

/**
 * @param {{repoUrl:String}} instructions
 * @returns {Promise<{}>}
 */
async function getPackagesForBuildInstruction(instructions) {
  const packages = {}
  let toBeBuilt = {};

  const {repoUrl} = instructions;
  
  
  // use the latest tag in branch ref
  const baseVersionsOnRef = await getLatestTag(repoUrl);
  console.log(`Basing ${repoUrl} package versions on those from tag ${baseVersionsOnRef}`);

  for (const packageDir of (instructions.packageDirs || [])) {
    const {label, dir, excludes} = Object.assign({excludes: []}, packageDir);
    console.log(`Inspecting ${label}`);
    toBeBuilt = await determinePackagesForRef(repoUrl, dir, baseVersionsOnRef, {excludes});
    Object.assign(packages, toBeBuilt);
  }
  
  for (const individualPackage of (instructions.packageIndividual || [])) {
    const defaults = {excludes: [], composerJsonPath: '', emptyDirsToAdd: []};
    const {label, dir, excludes, composerJsonPath, emptyDirsToAdd} = Object.assign(defaults, individualPackage);
    console.log(`Inspecting ${label}`);
    toBeBuilt = await determinePackageForRef(repoUrl, dir, baseVersionsOnRef, {excludes, composerJsonPath, emptyDirsToAdd});
    Object.assign(packages, toBeBuilt);
  }

  for (const packageMeta of (instructions.packageMetaFromDirs || [])) {
    const {label, dir} = packageMeta;
    console.log(`Inspecting ${label}`);
    toBeBuilt = await determineMetaPackageFromRepoDir(repoUrl, dir, baseVersionsOnRef, undefined);
    Object.assign(packages, toBeBuilt);
  }

  if (instructions.magentoCommunityEditionMetapackage) {
    console.log('Inspecting Magento Community Edition Product Metapackage');
    toBeBuilt = await determineMagentoCommunityEditionMetapackage(repoUrl, baseVersionsOnRef);
    Object.assign(packages, toBeBuilt);
  }

  if (instructions.magentoCommunityEditionProject) {
    console.log('Inspecting Magento Community Edition Project');
    toBeBuilt = await determineMagentoCommunityEditionProject(repoUrl, baseVersionsOnRef);
    Object.assign(packages, toBeBuilt);
  }
  
  repo.clearCache();
  return packages;
}

function getReleaseDateString() {
  const d = new Date();
  return `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
}

async function getPackageVersionsForBuildInstructions(buildInstructions, suffix) {
  console.log(`Determining package versions`);
  let packages = {};
  for (const instruction of buildInstructions) {
    Object.assign(packages, await getPackagesForBuildInstruction(instruction));
  }
  return transformVersionsToNightlyBuildVersions(packages, suffix);
}

function addSuffixToVersion(version, buildSuffix) {
  const pos = version.indexOf('-');
  if (pos !== -1) {
    return `${version.slice(0, pos)}${version.slice(pos)}${buildSuffix}`
  }
  return `${version}-a${buildSuffix || 'lpha'}`
}

function transformVersionsToNightlyBuildVersions(packageToVersionMap, buildSuffix) {
  return Object.keys(packageToVersionMap).reduce((newMap, name) => {
    const baseVersion = calcNightlyBuildPackageBaseVersion(packageToVersionMap[name]);
    newMap[name] = addSuffixToVersion(baseVersion, buildSuffix);
    return newMap;
  }, {});
}

function calcNightlyBuildPackageBaseVersion(version) {
  if (! version.match(/^v?(?:\d+\.){0,3}\d+(?:-[a-z]\w*|)$/i)) {
    throw Error(`Unable to determine branch release version for input version "${version}"`)
  }
  const suffix = version.includes('-') ? version.slice(version.indexOf('-')) : '';
  const versions = version.includes('-') ? version.slice(0, version.indexOf('-')) : version;
  const parts = versions.split('.');
  if (parts.length < 4) {
    parts.push('1')
  } else {
    parts[parts.length - 1]++;
  }
  
  return `${parts.join('.')}${suffix}`;
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
  const packageVersions = await getPackageVersionsForBuildInstructions(instructions, getReleaseDateString());
  for (const instruction of instructions) {
    await processBuildInstruction(instruction, packageVersions);
  }
}

module.exports = {
  processBuildInstructions,
  getPackageVersionsForBuildInstructions,
  transformVersionsToNightlyBuildVersions,
  calcNightlyBuildPackageBaseVersion,
  getReleaseDateString,
};