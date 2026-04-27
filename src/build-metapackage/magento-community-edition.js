const {
  getVersionStability,
  setDependencyVersions,
  getAdditionalConfiguration
} = require('../package-modules');
const buildState = require('../type/build-state');
const metapackageDefinition = require('../type/metapackage-definition');
const repositoryBuildDefinition = require('../type/repository-build-definition');

/**
 * @param {{}} composerConfig
 * @param {repositoryBuildDefinition} instruction
 * @param {metapackageDefinition} metapackage
 * @param {buildState} release
 */
async function transformMagentoCommunityEditionProject(composerConfig, instruction, metapackage, release) {
  const packageName = `${instruction.vendor}/${metapackage.name}`;
  const productName = `${instruction.vendor}/` + metapackage.name.replace('project-', 'product-');
  const version = release.version || release.dependencyVersions[packageName] || release.ref;

  // read release history or dependencies-template for project metapackage
  const additionalConfig = await getAdditionalConfiguration(packageName, release.ref)

  // If this is not a new release, and additionalConfig looks like a full composer config, use it directly.
  if (release.dependencyVersions['*'] === undefined && additionalConfig['prefer-stable'] !== undefined) {
    return additionalConfig;
  }

  composerConfig = Object.assign({}, composerConfig, additionalConfig, {
    name: packageName,
    description: 'Community-built eCommerce Platform for Growth',
    extra: {'magento-force': 'override'},
    repositories: [{type: 'composer', url: release.composerRepoUrl}],
    'minimum-stability': getVersionStability(version),
    require: Object.assign(
      {[`${productName}`]: version},
      additionalConfig.require
    )
  });

  for (const k of ['replace', 'suggest']) {
    delete composerConfig[k];
  }

  setDependencyVersions(instruction, release, composerConfig);

  return composerConfig;
}

/**
 * @param {{}} composerConfig
 * @param {repositoryBuildDefinition} instruction
 * @param {metapackageDefinition} metapackage
 * @param {buildState} release
 */
async function transformMagentoCommunityEditionProduct(composerConfig, instruction, metapackage, release) {
  const packageName = `${instruction.vendor}/${metapackage.name}`;

  // This method is in package-modules, and checks history and falls back to composer-templates
  // We should find a way to consolidate or abstract this for other instances
  const additionalConfig = await getAdditionalConfiguration(packageName, release.ref)

  // If this is not a new release, and additionalConfig looks like a full composer config, use it directly.
  if (release.dependencyVersions['*'] === undefined && additionalConfig['prefer-stable'] !== undefined) {
    return additionalConfig;
  }

  delete composerConfig.extra;

  // For all entries in composerConfig.replace, pull all first-party replacements (magento/ modules) for requirements.
  const replace = composerConfig?.replace ?? {};
  const vendorReplacements = Object.fromEntries(
    Object.entries(replace).filter(([pkg]) => pkg.startsWith(`${instruction.vendor}/`) || pkg.startsWith('magento/'))
  );

  composerConfig = Object.assign({}, composerConfig, additionalConfig, {
    name: packageName,
    description: 'eCommerce Platform for Growth (Community Edition)',
    type: 'metapackage',
    require: Object.assign(
      {},
      composerConfig.require,
      vendorReplacements,
      additionalConfig.require,
      {[`${instruction.vendor}/magento2-base`]: release.version || composerConfig.version}
    ),
  });

  for (const k of ['autoload', 'autoload-dev', 'config', 'conflict', 'minimum-stability', 'replace', 'require-dev', 'suggest']) {
    delete composerConfig[k];
  }
  setDependencyVersions(instruction, release, composerConfig);

  return composerConfig;
}

module.exports = {
  transformMagentoCommunityEditionProject,
  transformMagentoCommunityEditionProduct,
};
