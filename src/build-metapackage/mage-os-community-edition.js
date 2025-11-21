const buildState = require('../type/build-state');
const metapackageDefinition = require('../type/metapackage-definition');
const repositoryBuildDefinition = require('../type/repository-build-definition');
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

  // Add upstreamRelease to composer extra data for reference
  composerConfig.extra = composerConfig.extra || {};
  composerConfig.extra.magento_version = release.replaceVersions['magento/product-community-edition'];

  return composerConfig
}

module.exports = {
  transformMageOSCommunityEditionProject,
  transformMageOSCommunityEditionProduct,
};
