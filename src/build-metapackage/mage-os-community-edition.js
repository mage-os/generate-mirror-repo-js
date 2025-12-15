const buildState = require('../type/build-state');
const metapackageDefinition = require('../type/metapackage-definition');
const repositoryBuildDefinition = require('../type/repository-build-definition');
const {compareVersions} = require('../utils');
const {
  updateComposerConfigFromMagentoToMageOs
} = require('../release-build-tools');

/**
 * @param {{}} composerConfig 
 * @param {repositoryBuildDefinition} instruction 
 * @param {metapackageDefinition} metapackage
 * @param {buildState} release 
 */
async function transformMageOSCommunityEditionProject(composerConfig, instruction, metapackage, release) {
  updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);

  // Versions 2.0.0 and below had a different description
  if (compareVersions(composerConfig.version, '2.0.0') <= 0) {
    composerConfig.description = 'eCommerce Platform for Growth (Community Edition)';
  }

  return composerConfig;
}

/**
 * @param {{}} composerConfig 
 * @param {repositoryBuildDefinition} instruction 
 * @param {metapackageDefinition} metapackage
 * @param {buildState} release 
 */
async function transformMageOSCommunityEditionProduct(composerConfig, instruction, metapackage, release) {
  updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig)

  if (release.replaceVersions['magento/product-community-edition']) {
    // Add upstreamRelease to composer extra data for reference
    composerConfig.extra = composerConfig.extra || {};
    composerConfig.extra.magento_version = release.replaceVersions['magento/product-community-edition'];
  }

  return composerConfig
}

module.exports = {
  transformMageOSCommunityEditionProject,
  transformMageOSCommunityEditionProduct,
};
