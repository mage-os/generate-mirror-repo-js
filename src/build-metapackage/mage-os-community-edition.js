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
  const versionBeforeTransform = composerConfig.version;
  updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);
  // updateComposerConfigFromMagentoToMageOs sets version to release.version || release.ref.
  // For nightly builds release.version is not set, so restore the version already set by
  // previous transforms (e.g. the nightly version from transformMagentoCommunityEditionProject).
  if (!release.version && versionBeforeTransform) {
    composerConfig.version = versionBeforeTransform;
  }

  // Versions 2.0.0 and below had a different description
  if (/^\d+\.\d+/.test(composerConfig.version) && compareVersions(composerConfig.version, '2.0.0') <= 0) {
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
  const versionBeforeTransform = composerConfig.version;
  updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig)
  if (!release.version && versionBeforeTransform) {
    composerConfig.version = versionBeforeTransform;
  }

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
