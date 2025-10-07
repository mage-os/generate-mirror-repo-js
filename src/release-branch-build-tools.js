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
const repositoryBuildDefinition = require("./type/repository-build-definition");
const buildState = require("./type/build-state");
const {fetchPackagistList} = require("./packagist");

/**
 * @param {repositoryBuildDefinition} instruction
 * @returns {Promise<{}>}
 */
async function getPackagesForBuildInstruction(instruction) {
  let packages = {};
  let toBeBuilt = {};

  // use the latest tag in branch ref
  const baseVersionsOnRef = await getLatestTag(instruction.repoUrl) || instruction.ref || 'HEAD';
  console.log(`Basing ${instruction.repoUrl} package versions on those from reference ${baseVersionsOnRef}`);

  for (const package of (instruction.packageDirs || [])) {
    console.log(`Inspecting ${package.label}`);
    toBeBuilt = await determinePackagesForRef(instruction, package, baseVersionsOnRef);
    Object.assign(packages, toBeBuilt);
  }

  for (const package of (instruction.packageIndividual || [])) {
    console.log(`Inspecting ${package.label}`);
    toBeBuilt = await determinePackageForRef(instruction, package, baseVersionsOnRef);
    Object.assign(packages, toBeBuilt);
  }

  for (const package of (instruction.packageMetaFromDirs || [])) {
    console.log(`Inspecting ${package.label}`);
    toBeBuilt = await determineMetaPackageFromRepoDir(instruction.repoUrl, package.dir, baseVersionsOnRef, undefined);
    Object.assign(packages, toBeBuilt);
  }

  if (instruction.magentoCommunityEditionMetapackage) {
    console.log('Inspecting Magento Community Edition Product Metapackage');
    toBeBuilt = await determineMagentoCommunityEditionMetapackage(instruction.repoUrl, baseVersionsOnRef);
    Object.assign(packages, toBeBuilt);
  }

  if (instruction.magentoCommunityEditionProject) {
    console.log('Inspecting Magento Community Edition Project');
    toBeBuilt = await determineMagentoCommunityEditionProject(instruction.repoUrl, baseVersionsOnRef);
    Object.assign(packages, toBeBuilt);
  }

  repo.clearCache();
  return packages;
}

function getReleaseDateString() {
  const d = new Date();
  return `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
}

/**
 * @param {repositoryBuildDefinition[]} instructions 
 * @param {String} suffix 
 * @returns 
 */
async function getPackageVersionsForBuildInstructions(instructions, suffix) {
  console.log(`Determining package versions`);
  let packages = {};
  for (const instruction of instructions) {
    Object.assign(packages, await getPackagesForBuildInstruction(instruction));
  }
  return transformVersionsToNightlyBuildVersions(packages, suffix);
}

function addSuffixToVersion(version, buildSuffix) {
  // Don't add suffix to dev- branch versions
  if (version.startsWith('dev-')) {
    return version;
  }

  const match = version.match(/(?<versions>(?:[\d]+\.?){1,4})(?<suffix>-[^+]+)?(?<legacy>\+.+)?/)
  if (match) {
    return `${match.groups.versions}-a${buildSuffix}${match.groups.legacy ? match.groups.legacy : ''}`
  }
  return `${version}-a${buildSuffix || 'lpha'}`
}

function transformVersionsToNightlyBuildVersions(packageToVersionMap, buildSuffix) {
  return Object.keys(packageToVersionMap).reduce((newMap, name) => {
    newMap[name] = transformVersionsToNightlyBuildVersion(packageToVersionMap[name], buildSuffix)
    return newMap;
  }, {});
}

function transformVersionsToNightlyBuildVersion(baseVersion, buildSuffix) {
  return addSuffixToVersion(calcNightlyBuildPackageBaseVersion(baseVersion !== '' ? baseVersion : '0.0.1' ), buildSuffix);
}

function calcNightlyBuildPackageBaseVersion(version) {
  // Handle dev- branch versions (e.g., dev-develop, dev-master)
  if (version.startsWith('dev-')) {
    return version; // Return as-is, it's already a valid Composer branch version
  }

  if (! version.match(/^v?(?:\d+\.){0,3}\d+(?:-[a-z]\w*|)$/i)) {
    throw Error(`Unable to determine branch release version for input version "${version}"`)
  }
  const pos = version.indexOf('-')
  const suffix = pos !== -1 ? version.slice(pos + 1) : '';
  const versions = pos !== -1 ? version.slice(0, pos) : version;
  const parts = versions.split('.');
  if (parts.length < 4) {
    parts.push('1')
  } else {
    parts[parts.length - 1]++;
  }

  return `${parts.join('.')}${suffix ? '-alpha+' + suffix : ''}`;
}

/**
 * @param {repositoryBuildDefinition} instruction
 * @param {buildState} release
 * @returns {Promise<{}>}
 */
async function processBuildInstruction(instruction, release) {
  let packages = {};
  let built = {};

  await repo.pull(instruction.repoUrl, instruction.ref);

  for (const package of (instruction.packageDirs || [])) {
    console.log(`Packaging ${package.label}`);
    built = await createPackagesForRef(instruction, package, release);
    Object.assign(packages, built);
  }

  for (const package of (instruction.packageIndividual || [])) {
    console.log(`Packaging ${package.label}`);
    built = await createPackageForRef(instruction, package, release);
    Object.assign(packages, built);
  }

  for (const package of (instruction.packageMetaFromDirs || [])) {
    console.log(`Packaging ${package.label}`);
    built = await createMetaPackageFromRepoDir(instruction, package, release);
    Object.assign(packages, built);
  }

  if (instruction.magentoCommunityEditionMetapackage) {
    console.log('Packaging Magento Community Edition Product Metapackage');
    built = await createMagentoCommunityEditionMetapackage(instruction, release);
    Object.assign(packages, built);
  }

  if (instruction.magentoCommunityEditionProject) {
    console.log('Packaging Magento Community Edition Project');
    built = await createMagentoCommunityEditionProject(
      instruction,
      release,
      {
        minimumStability: 'alpha'
      }
    );
    Object.assign(packages, built);
  }

  repo.clearCache();
  return packages;
}

/**
 * @param {Array<repositoryBuildDefinition>} instructions
 * @returns {Promise<void>}
 */
async function processNightlyBuildInstructions(instructions) {
  const releaseSuffix = getReleaseDateString();
  let release = buildState({
    fallbackVersion: transformVersionsToNightlyBuildVersion('0.0.1', releaseSuffix), // version to use for previously unreleased packages
    dependencyVersions: await getPackageVersionsForBuildInstructions(instructions, releaseSuffix),
  });

  // @TODO/future: Mage-OS Nightly probably doesn't handle vendor properly in the first place, and this isn't relevant for upstream nightlies.
  await fetchPackagistList('mage-os');

  for (const instruction of instructions) {
    await processBuildInstruction(instruction, release);
  }
}

module.exports = {
  processNightlyBuildInstructions,
  getPackageVersionsForBuildInstructions,
  transformVersionsToNightlyBuildVersions,
  calcNightlyBuildPackageBaseVersion,
  getReleaseDateString,
};
