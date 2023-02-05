
const packagesConfig = require('./packages-config');

const mirrorBuildConfig = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2.git',
    fromTag: '2.3.7-p2',
    fixVersions: {
      // Upstream correctly sets the module version to 100.3.7-p3 in the git tag, but in the actual upstream 2.3.7-p3
      // release they used 100.3.7 as the dependency.
      '2.3.7-p3': {
        // The result of this configuration is that anywhere the module magento/module-bundle is referenced, the version
        // 100.3.7 is used, both for building the package and when it is referenced as a dependency.
        'magento/module-bundle': '100.3.7'
      },

      // Upstream doesn't have tag 2.1.2. It does have a branch with that name but the metapackage is incorrect.
      // See https://github.com/magento/adobe-stock-integration/issues/1871
      '2.4.3': {
        'magento/adobe-stock-integration': '2.1.2'
      }
    }
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
      '1.7.0': {
        'magento/module-page-builder':                   '2.2.1',
        'magento/module-aws-s3-page-builder':            '1.0.1',
        'magento/module-catalog-page-builder-analytics': '1.6.1',
        'magento/module-cms-page-builder-analytics':     '1.6.1',
        'magento/module-page-builder-admin-analytics':   '1.1.1',
        'magento/module-page-builder-analytics':         '1.6.1',
      },
      '1.7.0-p1': {
        'magento/module-page-builder':                   '2.2.1-p1',
        'magento/module-aws-s3-page-builder':            '1.0.1-p1',
        'magento/module-catalog-page-builder-analytics': '1.6.1-p1',
        'magento/module-cms-page-builder-analytics':     '1.6.1-p1',
        'magento/module-page-builder-admin-analytics':   '1.1.1-p1',
        'magento/module-page-builder-analytics':         '1.6.1-p1',
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
      '1.0.3-p2': {
        // Upstream release ships with these deps, but in the tagged release * dependencies are used in the metapackage
        'magento/module-adobe-ims':                  '1.0.2-p1',
        'magento/module-adobe-ims-api':              '1.0.2-p1',
        'magento/module-adobe-stock-admin-ui':       '1.0.2-p1',
        'magento/module-adobe-stock-asset':          '1.0.2-p1',
        'magento/module-adobe-stock-asset-api':      '1.0.2-p1',
        'magento/module-adobe-stock-client':         '1.0.2-p1',
        'magento/module-adobe-stock-client-api':     '1.0.2-p1',
        'magento/module-adobe-stock-image-api':      '1.0.2-p1',
        'magento/module-adobe-stock-image':          '1.0.2-p2',
        'magento/module-adobe-stock-image-admin-ui': '1.0.3-p2',
      },
      '2.1.1': {
        // Metapackage missing pinned versions.
        'magento/module-adobe-stock-admin-ui':       '1.3.0',
        'magento/module-adobe-stock-asset':          '1.3.0',
        'magento/module-adobe-stock-asset-api':      '2.0.0',
        'magento/module-adobe-stock-client':         '1.3.0',
        'magento/module-adobe-stock-client-api':     '2.1.0',
        'magento/module-adobe-stock-image':          '1.3.0',
        'magento/module-adobe-stock-image-admin-ui': '1.3.0',
        'magento/module-adobe-stock-image-api':      '1.3.0',
      },
      '2.1.2-p1': {
        // Metapackage missing pinned versions.
        'magento/module-adobe-stock-admin-ui':       '1.3.0-p1',
        'magento/module-adobe-stock-asset':          '1.3.0-p1',
        'magento/module-adobe-stock-asset-api':      '2.0.0-p1',
        'magento/module-adobe-stock-client-api':     '2.1.0-p1',
        'magento/module-adobe-stock-image-api':      '1.3.0-p1',

        // Files are different in version control.
        'magento/module-adobe-stock-client':         '1.3.1-p1',
        'magento/module-adobe-stock-image':          '1.3.1-p1',
        'magento/module-adobe-stock-image-admin-ui': '1.3.1-p1',
      }
    },
  },
  'magento-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-composer-installer.git',
    fromTag: '0.1.4',
  },
  'composer-root-update-plugin': {
    repoUrl: 'https://github.com/mage-os/mirror-composer-root-update-plugin.git',
    fromTag: '1.0.0',
    // Skip tag 2.0.3 until the expected release date of 2.4.6 because it probably was tagged by accident in upstream
    // See issue https://github.com/magento/composer-root-update-plugin/issues/37
    skipTags: {'2.0.3': () => (new Date('2023-03-14')).getTime() < Date.now()},
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