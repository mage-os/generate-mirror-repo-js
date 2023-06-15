const packagesConfig = require('./packages-config');

const mirrorBuildConfig = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2.git',
    fromTag: '2.3.7-p2',
    fixVersions: {
      // Upstream doesn't have tag 2.1.2. It does have a branch with that name but the metapackage is incorrect.
      // See https://github.com/magento/adobe-stock-integration/issues/1871
      '2.4.3': {
        'magento/adobe-stock-integration': '2.1.2'
      }
    },
    transform: {
      // Upstream correctly sets the module version to 100.3.7-p3 in the git tag, but in the actual upstream 2.3.7-p3
      // release they used 100.3.7 as the dependency.
      'magento/product-community-edition': [
        composerJson => {
          const patch = composerJson.version === '2.3.7-p3'
            ? {'magento/module-bundle': '100.3.7'}
            : {}
          composerJson.require = {...composerJson.require, ...patch}
          return composerJson;
        }
      ]
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
      // Metapackage is missing the pinned versions and also versions in the
      // tagged release for module-page-builder-admin-analytics, module-page-builder-analytics and module-page-builder
      '1.7.0': {
        'magento/module-page-builder':                   '2.2.1',
        'magento/module-aws-s3-page-builder':            '1.0.1',
        'magento/module-catalog-page-builder-analytics': '1.6.1',
        'magento/module-cms-page-builder-analytics':     '1.6.1',
        'magento/module-page-builder-admin-analytics':   '1.1.1',
        'magento/module-page-builder-analytics':         '1.6.1',
      },
      '1.7.0-p1': { // required by 2.4.3-p1
        // the upstream package contents of module-page-builder 2.2.1-p1 match 1.7.0-p2, except for the composer.json
        // use non-existent version 2.2.1-p0 so the 2.2.1-p1 package from additional packages is not overwritten, and
        // fix the composer.json dependency via transform
        'magento/module-page-builder':                   '2.2.1-p0',
        'magento/module-aws-s3-page-builder':            '1.0.1-p1',
        'magento/module-catalog-page-builder-analytics': '1.6.1-p1',
        'magento/module-cms-page-builder-analytics':     '1.6.1-p1',
        'magento/module-page-builder-admin-analytics':   '1.1.1-p1',
        'magento/module-page-builder-analytics':         '1.6.1-p1',
        // phpgt/dom is pinned as 2.2.1 in the tagged release, but the upstream package requires 2.1.6
        'phpgt/dom':                                     '2.1.6',
      }
    },
    transform: {
      // see comment in fixVersions for 1.7.0-p1 about explanation
      'magento/page-builder': [
        composerJson => {
          const patch = composerJson.version === '2.2.1-p0'
            ? {'magento/module-page-builder': '2.2.1-p1'}
            : {}
          composerJson.require = {...composerJson.require, ...patch}
          return composerJson;
        }
      ],    }
  },
  'adobe-ims': {
    repoUrl: 'https://github.com/mage-os/mirror-adobe-ims.git',
    fromTag: '2.1.0',
    // Keep the following around for reference until 2.4.6, 2.4.5-p2 and 2.4.4-p3 are done 
    // extraRefToRelease: [
    //   // This is a workaround for a wrong upstream release tag, see https://github.com/magento/adobe-ims/issues/16
    //   // This commit ref is the head for the develop branch (at the time of writing)  
    //   // An alternative might be 75e4cc4673f117bf70ddbfe6bb4902575a3bb294 (the head for the future-develop branch at the time of writing))  
    //   {
    //     ref: 'c04d9360b4e03fc61f9fef447814a40091792b51',
    //     release: '2.2.0',
    //     details: 'Remove extraRefToRelease from mirror build config if https://github.com/magento/adobe-ims/issues/16 is resolved'
    //   }
    // ],
    // fixVersions: {
    //   '2.2.0': {
    //     'magento/module-admin-adobe-ims': '100.5.0',
    //     'magento/module-admin-adobe-ims-two-factor-auth': '1.0.0',
    //     'magento/module-adobe-ims': '2.2.0',
    //     'magento/module-adobe-ims-api': '2.2.0'
    //   }
    // }
  },
  'adobe-stock-integration': {
    repoUrl: 'https://github.com/mage-os/mirror-adobe-stock-integration.git',
    fromTag: '1.0.0',
    transform: {
      // require wildcard versions to match upstream release
      'magento/adobe-stock-integration': [
        composerJson => {
          const patch = composerJson.version === '1.0.3-p2'
            ? {
              'magento/module-adobe-stock-asset':          '1.0.*',
              'magento/module-adobe-stock-asset-api':      '1.0.*',
              'magento/module-adobe-stock-image':          '1.0.*',
              'magento/module-adobe-stock-image-admin-ui': '1.0.*',
              'magento/module-adobe-stock-image-api':      '1.0.*',
              'magento/module-adobe-stock-client':         '1.0.*',
              'magento/module-adobe-stock-client-api':     '1.0.*',
              'magento/module-adobe-stock-admin-ui':       '1.0.*',
              'magento/module-adobe-ims':                  '1.0.*',
              'magento/module-adobe-ims-api':              '1.0.*'
            }
            : {}
          composerJson.require = {...composerJson.require, ...patch}
          return composerJson;
        }
      ],
      'magento/module-adobe-ims': [
        composerJson => {
          const patch = composerJson.version === '1.0.2-p1'
            ? {'magento/module-adobe-ims-api': '1.0.*',}
            : {}
          composerJson.require = {...composerJson.require, ...patch}
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-admin-ui': [
        composerJson => {
          const patch = composerJson.version === '1.0.2-p1'
            ? {
               'magento/module-adobe-ims-api':           '1.0.*',
                'magento/module-adobe-stock-client-api': '1.0.*'
              }
            : {}
          composerJson.require = {...composerJson.require, ...patch}
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-asset': [
        composerJson => {
          const patch = composerJson.version === '1.0.2-p1'
            ? {
              'magento/module-adobe-stock-asset-api':  '1.0.*',
              'magento/module-adobe-stock-client-api': '1.0.*',
            }
            : {}
          composerJson.require = {...composerJson.require, ...patch}
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-client': [
        composerJson => {
          const patch = composerJson.version === '1.0.2-p1'
            ? {
              'magento/module-adobe-ims-api':          '1.0.*',
              'magento/module-adobe-stock-client-api': '1.0.*',
            }
            : {}
          composerJson.require = {...composerJson.require, ...patch}
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-image': [
        composerJson => {
          const patch = composerJson.version === '1.0.2-p2'
            ? {
              'magento/module-adobe-stock-client-api': '1.0.*',
              'magento/module-adobe-stock-asset-api':  '1.0.*',
              'magento/module-adobe-stock-image-api':  '1.0.*',
            }
            : {}
          composerJson.require = {...composerJson.require, ...patch}
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-image-admin-ui': [
        composerJson => {
          const patch = composerJson.version === '1.0.3-p2'
            ? {
              'magento/module-adobe-ims':              '1.0.*',
              'magento/module-adobe-ims-api':          '1.0.*',
              'magento/module-adobe-stock-asset-api':  '1.0.*',
              'magento/module-adobe-stock-image-api':  '1.0.*',
              'magento/module-adobe-stock-client-api': '1.0.*',
            }
            : {}
          composerJson.require = {...composerJson.require, ...patch}
          return composerJson;
        }
      ],
    },
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
      '1.0.3-p3': {
        // Upstream release ships with these deps, but in the tagged release * dependencies are used in the metapackage
        'magento/module-adobe-ims':                  '1.0.2',
        'magento/module-adobe-ims-api':              '1.0.2',
        'magento/module-adobe-stock-admin-ui':       '1.0.2',
        'magento/module-adobe-stock-asset':          '1.0.2',
        'magento/module-adobe-stock-asset-api':      '1.0.2',
        'magento/module-adobe-stock-client':         '1.0.2',
        'magento/module-adobe-stock-client-api':     '1.0.2',
        'magento/module-adobe-stock-image-api':      '1.0.2',
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
        'magento/module-adobe-stock-admin-ui':   '1.3.0-p1',
        'magento/module-adobe-stock-asset':      '1.3.0-p1',
        'magento/module-adobe-stock-asset-api':  '2.0.0-p1',
        'magento/module-adobe-stock-client-api': '2.1.0-p1',
        'magento/module-adobe-stock-image-api':  '1.3.0-p1',

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
    // The composer.json is missing the version in all tagged releases
    fixVersions: {
      '0.1.10': {'magento/magento-composer-installer': '0.1.10'},
      '0.1.11': {'magento/magento-composer-installer': '0.1.11'},
      '0.1.12': {'magento/magento-composer-installer': '0.1.12'},
      '0.1.13': {'magento/magento-composer-installer': '0.1.13'},
      '0.1.4': {'magento/magento-composer-installer': '0.1.4'},
      '0.1.5': {'magento/magento-composer-installer': '0.1.5'},
      '0.1.6': {'magento/magento-composer-installer': '0.1.6'},
      '0.1.7': {'magento/magento-composer-installer': '0.1.7'},
      '0.1.8': {'magento/magento-composer-installer': '0.1.8'},
      '0.1.9': {'magento/magento-composer-installer': '0.1.9'},
      '0.2.0': {'magento/magento-composer-installer': '0.2.0'},
      '0.2.1': {'magento/magento-composer-installer': '0.2.1'},
      '0.2.1-beta1': {'magento/magento-composer-installer': '0.2.1-beta1'},
      '0.3.0': {'magento/magento-composer-installer': '0.3.0'},
      '0.3.0-beta.1': {'magento/magento-composer-installer': '0.3.0-beta.1'},
      '0.4.0': {'magento/magento-composer-installer': '0.4.0'},
      '0.4.0-beta1': {'magento/magento-composer-installer': '0.4.0-beta1'},
      '0.4.0-beta2': {'magento/magento-composer-installer': '0.4.0-beta2'},
    }
  },
  // Disable temporarily since it seems to cause a lot of breakage
  // 'composer': {
  //   repoUrl: 'https://github.com/mage-os/mirror-composer.git',
  //   fromTag: '1.0.0',
  // },
  'composer-root-update-plugin': {
    repoUrl: 'https://github.com/mage-os/mirror-composer-root-update-plugin.git',
    fromTag: '1.0.0',
    // Skip tag 2.0.3 until the expected release date of 2.4.6 because it probably was tagged by accident in upstream
    // See issue https://github.com/magento/composer-root-update-plugin/issues/37
    //skipTags: {'2.0.3': () => (new Date('2023-03-14')).getTime() < Date.now()},
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
  },
  // Keep disabled until the mirror repos exist and are integrated into the upstream synchronization process
  // 'magento-coding-standard': {
  //   repoUrl: 'https://github.com/mage-os/mirror-magento-coding-standard.git',
  //   fromTag: '1.0.0'
  // },
  // 'magento2-functional-testing-framework': {
  //   repoUrl: 'https://github.com/mage-os/mirror-magento2-functional-testing-framework.git',
  //   fromTag: '1.0.0'
  // },
}

module.exports = {
  buildConfig: Object.keys(mirrorBuildConfig).reduce((acc, key) => {
    acc.push(Object.assign({}, (packagesConfig[key] || {}), mirrorBuildConfig[key]));
    return acc;
  }, [])
};