
const packagesConfig = require('./packages-config');

const mirrorBuildConfig = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2.git',
    fromTag: '2.3.7-p3',
  },
  'security-package': {
    repoUrl: 'https://github.com/mage-os/mirror-security-package.git',
    fromTag: '1.0.0',
  },
  'inventory': {
    repoUrl: 'https://github.com/mage-os/mirror-inventory.git',
    fromTag: '1.1.5',
    extraRefToRelease: [
      // This is a workaround for a missing upstream release tag, see https://github.com/magento/inventory/issues/3354
      // This commit ref is the head for the 1.2-p1-alpha branch (at the time of writing)  
      {
        ref: '2a6fdb4e08dc307cd92ca4a7a0958128611be757',
        release: '1.2.0-p1',
        details: 'Remove extraRefToRelease from mirror build config if https://github.com/magento/inventory/issues/3354 is resolved'
      }
    ],
  },
  'inventory-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mirror-inventory-composer-installer.git',
    fromTag: '1.1.0',
  },
  'page-builder': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-page-builder.git',
    fromTag: '1.7.0',
    fixVersions: {
      "1.7.0": {
        "magento/module-aws-s3-page-builder": "1.0.1",
        "magento/module-catalog-page-builder-analytics": "1.6.1",
        "magento/module-cms-page-builder-analytics": "1.6.1",
        "magento/module-page-builder": "2.2.1",
        "magento/module-page-builder-admin-analytics": "1.1.1",
        "magento/module-page-builder-analytics": "1.6.1",
      },
      "1.7.0-p1": {
        "magento/module-aws-s3-page-builder": {
          version: "1.0.1-p1",
          localOverride: true
        },
        "magento/module-catalog-page-builder-analytics": "1.6.1-p1",
        "magento/module-cms-page-builder-analytics": "1.6.1-p1",
        "magento/module-page-builder": {
          version: "2.2.1-p1",
          localOverride: true
        },
        "magento/module-page-builder-admin-analytics": "1.1.1-p1",
        "magento/module-page-builder-analytics": "1.6.1-p1",
      }
    }
  },
  'adobe-ims': {
    repoUrl: 'https://github.com/mage-os/mirror-adobe-ims.git',
    fromTag: '2.1.0',
  },
  'adobe-stock-integration': {
    repoUrl: 'https://github.com/mage-os/mirror-adobe-stock-integration.git',
    fromTag: '1.0.0',
    fixVersions: {
      "2.1.1": {
        "magento/module-adobe-stock-admin-ui": "1.3.0",
        "magento/module-adobe-stock-asset": "1.3.0",
        "magento/module-adobe-stock-asset-api": "2.0.0",
        "magento/module-adobe-stock-client": "1.3.0",
        "magento/module-adobe-stock-client-api": "2.1.0",
        "magento/module-adobe-stock-image": "1.3.0",
        "magento/module-adobe-stock-image-admin-ui": "1.3.0",
        "magento/module-adobe-stock-image-api": "1.3.0",
      },
      "2.1.2": {
        "magento/module-adobe-stock-admin-ui": "1.3.0",
        "magento/module-adobe-stock-asset": "1.3.0",
        "magento/module-adobe-stock-asset-api": "2.0.0",
        "magento/module-adobe-stock-client": "1.3.1",
        "magento/module-adobe-stock-client-api": "2.1.0",
        "magento/module-adobe-stock-image": "1.3.1",
        "magento/module-adobe-stock-image-admin-ui": "1.3.1",
        "magento/module-adobe-stock-image-api": "1.3.0",
      },
      "2.1.2-p1": {
        "magento/module-adobe-stock-admin-ui": "1.3.0-p1",
        "magento/module-adobe-stock-asset": "1.3.0-p1",
        "magento/module-adobe-stock-asset-api": "2.0.0-p1",
        "magento/module-adobe-stock-client": {
          version: "1.3.1-p1",
          localOverride: true
        },
        "magento/module-adobe-stock-client-api": "2.1.0-p1",
        "magento/module-adobe-stock-image": {
          version: "1.3.1-p1",
          localOverride: true
        },
        "magento/module-adobe-stock-image-admin-ui": {
          version: "1.3.1-p1",
          localOverride: true
        },
        "magento/module-adobe-stock-image-api": "1.3.0-p1",
      }
    }
  },
  'magento-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-composer-installer.git',
    fromTag: '0.1.4',
  },
  'composer-root-update-plugin': {
    repoUrl: 'https://github.com/mage-os/mirror-composer-root-update-plugin.git',
    fromTag: '1.0.0',
  },
  'composer-dependency-version-audit-plugin': {
    repoUrl: 'https://github.com/mage-os/mirror-composer-dependency-version-audit-plugin.git',
    // Start from 0.1.2 to work around a wrong version in the magento/composer-dependency-version-audit-plugin:0.1.2
    // that lists version 0.1.1 in the composer.json
    // See https://github.com/magento/composer-dependency-version-audit-plugin/blob/0.1.2/composer.json#L5
    fromTag: '0.1.2',
  },
  'magento2-sample-data': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-sample-data.git',
    fromTag: '2.3.7-p3',
  }
}

module.exports = {
  buildConfig: Object.keys(mirrorBuildConfig).reduce((acc, key) => {
    acc.push(Object.assign({}, (packagesConfig[key] || {}), mirrorBuildConfig[key]));
    return acc;
  }, [])
};