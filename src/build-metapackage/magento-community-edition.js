const {
  getVersionStability,
  setDependencyVersions,
  getAdditionalDependencies
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
  const version = release.version || release.dependencyVersions[packageName] || release.ref;

  // read release history or dependencies-template for project metapackage
  const additionalDependencies = await getAdditionalDependencies(
    `${instruction.vendor}/project-community-edition`,
    release.ref
  )

  composerConfig = Object.assign({}, composerConfig, {
    description: 'Community-built eCommerce Platform for Growth',
    extra: {'magento-force': 'override'},
    repositories: [{type: 'composer', url: release.composerRepoUrl}],
    'minimum-stability': getVersionStability(version),
    require: Object.assign(
      {[`${packageName}`]: version},
      additionalDependencies
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
  const version = release.version || release.dependencyVersions[packageName] || release.ref;

  // This method is in package-modules, and checks history and falls back to composer-templates
  // We should find a way to consolidate or abstract this for other instances
  const additionalDependencies = await getAdditionalDependencies(packageName, release.ref)

  composerConfig = Object.assign({}, composerConfig, {
    description: 'eCommerce Platform for Growth (Community Edition)',
    type: 'metapackage',
    require: Object.assign(
      {},
      composerConfig.require,
      composerConfig.replace,
      additionalDependencies,
      {[`${instruction.vendor}/magento2-base`]: release.version}
    ),
  });

  for (const k of ['autoload', 'autoload-dev', 'config', 'conflict', 'extra', 'minimum-stability', 'replace', 'require-dev', 'suggest']) {
    delete composerConfig[k];
  }
  setDependencyVersions(instruction, release, composerConfig);

  return composerConfig;
}

module.exports = {
  transformMagentoCommunityEditionProject,
  transformMagentoCommunityEditionProduct,
};
