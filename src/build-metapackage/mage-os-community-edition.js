const buildState = require('../type/build-state');
const metapackageDefinition = require('../type/metapackage-definition');
const repositoryBuildDefinition = require('../type/repository-build-definition');
const {compareVersions, isVersionGreaterOrEqual, sortObjectKeys} = require('../utils');
const {
  updateComposerConfigFromMagentoToMageOs
} = require('../release-build-tools');

// Pinned history files store require sorted (ksort), so we sort to match and avoid
// checksum churn at the latest->historic transition (issue #325). Releases below these
// versions predate the convention and keep their original order. Boundaries match the
// committed history files.
const PRODUCT_REQUIRE_SORTED_SINCE = '2.0.0';
const PROJECT_REQUIRE_SORTED_SINCE = '2.2.1';

// Sort numeric versions at/above the boundary; non-numeric (e.g. nightly) versions too.
function shouldSortRequire(version, sortedSince) {
  if (/^\d+\.\d+/.test(version)) {
    return isVersionGreaterOrEqual(version, sortedSince);
  }
  return true;
}

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

  // Sort require (after the magento/ -> mage-os/ rename) to match the history files.
  if (composerConfig.require && shouldSortRequire(composerConfig.version, PROJECT_REQUIRE_SORTED_SINCE)) {
    composerConfig.require = sortObjectKeys(composerConfig.require);
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

  // Sort require (after the magento/ -> mage-os/ rename) to match the history files.
  if (composerConfig.require && shouldSortRequire(composerConfig.version, PRODUCT_REQUIRE_SORTED_SINCE)) {
    composerConfig.require = sortObjectKeys(composerConfig.require);
  }

  return composerConfig
}

module.exports = {
  transformMageOSCommunityEditionProject,
  transformMageOSCommunityEditionProduct,
};
