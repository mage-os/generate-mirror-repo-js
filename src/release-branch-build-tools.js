const repo = require("./repository");
const {
  createPackagesForRef,
  createPackageForRef,
  createMetaPackage,
  createMetaPackageFromRepoDir,
  determinePackagesForRef,
  determinePackageForRef,
  determineMetaPackageFromRepoDir,
  getLatestTag
} = require('./package-modules');
const repositoryBuildDefinition = require("./type/repository-build-definition");
const buildState = require("./type/build-state");
const {fetchPackagistList} = require("./packagist");
const {httpSlurp, compareVersions} = require("./utils");
const {getPackageVersionMap} = require("./release-build-tools");

const DEFAULT_UPSTREAM_MIRROR_URL = 'https://mirror.mage-os.org';
const UPSTREAM_VERSION_REFERENCE_PACKAGE = 'magento/product-community-edition';
// Matches plain stable releases (X.Y, X.Y.Z) and patch suffixes (-p1, -p2.3),
// rejecting pre-release labels like -alpha, -beta, -rc, -dev.
const STABLE_VERSION_RE = /^v?\d+\.\d+(?:\.\d+)?(?:-p\d+(?:\.\d+)?)?$/i;

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

  for (const pkg of (instruction.packageDirs || [])) {
    console.log(`Inspecting ${pkg.label}`);
    toBeBuilt = await determinePackagesForRef(instruction, pkg, baseVersionsOnRef);
    Object.assign(packages, toBeBuilt);
  }

  for (const pkg of (instruction.packageIndividual || [])) {
    console.log(`Inspecting ${pkg.label}`);
    toBeBuilt = await determinePackageForRef(instruction, pkg, baseVersionsOnRef);
    Object.assign(packages, toBeBuilt);
  }

  for (const pkg of (instruction.packageMetaFromDirs || [])) {
    console.log(`Inspecting ${pkg.label}`);
    toBeBuilt = await determineMetaPackageFromRepoDir(instruction.repoUrl, pkg.dir, baseVersionsOnRef, undefined);
    if (instruction.vendor && instruction.vendor !== 'magento') {
      toBeBuilt = Object.fromEntries(
        Object.entries(toBeBuilt).map(([name, ver]) => [name.replace(/^magento\//, `${instruction.vendor}/`), ver])
      );
    }
    Object.assign(packages, toBeBuilt);
  }

  for (const metapackage of (instruction.extraMetapackages || [])) {
    console.log(`Inspecting ${metapackage.name}`);
    packages[`${instruction.vendor}/${metapackage.name}`] = baseVersionsOnRef;
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
  const match = version.match(/(?<prefix>v?)(?<versions>(?:[\d]+\.?){1,4})(?<suffix>-[^+]+)?(?<legacy>\+.+)?/)
  if (match) {
    const prefix = match.groups.prefix || '';
    const legacy = match.groups.legacy || '';
    return `${prefix}${match.groups.versions}-a${buildSuffix || ''}${legacy}`
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

  release.ref = instruction.ref;
  await repo.pull(instruction.repoUrl, instruction.ref);

  for (const pkg of (instruction.packageDirs || [])) {
    console.log(`Packaging ${pkg.label}`);
    built = await createPackagesForRef(instruction, pkg, release);
    Object.assign(packages, built);
  }

  for (const pkg of (instruction.packageIndividual || [])) {
    console.log(`Packaging ${pkg.label}`);
    built = await createPackageForRef(instruction, pkg, release);
    Object.assign(packages, built);
  }

  for (const pkg of (instruction.packageMetaFromDirs || [])) {
    console.log(`Packaging ${pkg.label}`);
    built = await createMetaPackageFromRepoDir(instruction, pkg, release);
    Object.assign(packages, built);
  }

  for (const metapackage of (instruction.extraMetapackages || [])) {
    console.log(`Building metapackage ${metapackage.name}`);
    const built = await createMetaPackage(instruction, metapackage, release);
    Object.assign(packages, built);
  }

  repo.clearCache();
  return packages;
}

/**
 * Picks the highest stable magento/product-community-edition version published on
 * the given composer repo. Nightly mage-os/* packages use that version when writing
 * their `replace` map so third-party packages requiring magento/* by the original
 * name can resolve against them (e.g. `magento/framework >=103.0.7`).
 *
 * @param {string} mirrorUrl
 * @returns {Promise<string>}
 */
async function determineLatestUpstreamMagentoRelease(mirrorUrl = DEFAULT_UPSTREAM_MIRROR_URL) {
  const url = `${mirrorUrl.replace(/\/$/, '')}/p2/${UPSTREAM_VERSION_REFERENCE_PACKAGE}.json`;
  const body = await httpSlurp(url);
  let data;
  try {
    data = JSON.parse(body);
  } catch (err) {
    throw new Error(`Could not parse package metadata from ${url}: ${err.message}`);
  }
  const versions = (data?.packages?.[UPSTREAM_VERSION_REFERENCE_PACKAGE] || [])
    .map(v => v.version)
    .filter(v => STABLE_VERSION_RE.test(v));
  if (versions.length === 0) {
    throw new Error(`No stable ${UPSTREAM_VERSION_REFERENCE_PACKAGE} versions found at ${url}`);
  }
  versions.sort(compareVersions);
  return versions[versions.length - 1];
}

/**
 * @param {Array<repositoryBuildDefinition>} instructions
 * @param {string} repoUrl
 * @param {{replaceVersions?: Object<string, string>}} [options]
 * @returns {Promise<void>}
 */
async function processNightlyBuildInstructions(instructions, repoUrl, options = {}) {
  const releaseSuffix = getReleaseDateString();

  let release = new buildState({
    composerRepoUrl: repoUrl,
    fallbackVersion: transformVersionsToNightlyBuildVersion('0.0.1', releaseSuffix), // version to use for previously unreleased packages
    dependencyVersions: await getPackageVersionsForBuildInstructions(instructions, releaseSuffix),
    replaceVersions: options.replaceVersions || {},
  });

  await fetchPackagistList('mage-os');

  for (const instruction of instructions) {
    await processBuildInstruction(instruction, release);
  }
}

module.exports = {
  processNightlyBuildInstructions,
  determineLatestUpstreamMagentoRelease,
  getPackageVersionsForBuildInstructions,
  transformVersionsToNightlyBuildVersions,
  calcNightlyBuildPackageBaseVersion,
  getReleaseDateString,
  // Exported for testing
  addSuffixToVersion,
};
