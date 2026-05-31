const buildState = require('../type/build-state');
const metapackageDefinition = require('../type/metapackage-definition');
const repositoryBuildDefinition = require('../type/repository-build-definition');
const {compareVersions, isVersionGreaterOrEqual, sortObjectKeys} = require('../utils');
const {
  updateComposerConfigFromMagentoToMageOs
} = require('../release-build-tools');

// The pinned history files store the require section sorted (PHP ksort), so freshly
// generated release packages are sorted to match and stay byte-identical when they
// transition from a "latest" to a pinned historic release (issue #325). Releases
// below these versions predate the sorted convention and were published with their
// require in insertion order; they are left untouched so already-published checksums
// do not change. The boundaries are derived from the committed history files:
// mage-os/product-community-edition is sorted from 2.0.0, project-community-edition
// from 2.2.1.
const PRODUCT_REQUIRE_SORTED_SINCE = '2.0.0';
const PROJECT_REQUIRE_SORTED_SINCE = '2.2.1';

/**
 * Whether the require section of a community-edition metapackage should be sorted for
 * the given release version. Numeric versions below the sorted-convention boundary keep
 * their original order; newer and non-numeric (e.g. nightly) versions are sorted.
 *
 * @param {string} version
 * @param {string} sortedSince
 * @returns {boolean}
 */
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

  // Re-sort require after the magento/ -> mage-os/ rename so the final key order
  // matches the sorted pinned history files (see sortObjectKeys), gated to releases
  // that adopted the sorted convention.
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

  // Re-sort require after the magento/ -> mage-os/ rename so the final key order
  // matches the sorted pinned history files (see sortObjectKeys), gated to releases
  // that adopted the sorted convention.
  if (composerConfig.require && shouldSortRequire(composerConfig.version, PRODUCT_REQUIRE_SORTED_SINCE)) {
    composerConfig.require = sortObjectKeys(composerConfig.require);
  }

  return composerConfig
}

module.exports = {
  transformMageOSCommunityEditionProject,
  transformMageOSCommunityEditionProduct,
};
