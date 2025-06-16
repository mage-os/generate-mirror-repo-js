const packagesConfig = require('./packages-config');
const {mergeBuildConfigs} = require('../utils');

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
        },
      ],
      'magento/project-community-edition': [
        // Magento 2.4.8 forked allure-framework/allure-phpunit to magento/magento-allure-phpunit, because PHP 8.4 compat
        // Later, Allure created a new version with support for PHP 8.4
        // I believe that Magento tried to switch back to allure-framework/allure-phpunit but forgot to remove
        // magento/magento-allure-phpunit from the dev-dependencies list in the package. It is removed in githab though.
        // We add it in again here for consistency with the upstream release.
        composerJson => {
          const patch = composerJson.version === '2.4.8-p1'
            ? {'magento/magento-allure-phpunit': '^3.0.2'}
            : {}
            composerJson['require-dev'] = {...composerJson['require-dev'], ...patch}
          return composerJson;
        }
      ],
    },
    // After package generation, the files for these specific module versions will be replaced.
    packageReplacements: [
      {
        name: 'magento/module-catalog',
        version: '103.0.7-p3',
        files: ['Test/Mftf/ActionGroup/CustomOptionsActionGroup.xml']
      }
    ],
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
    transform: {
      'magento/module-inventory-catalog-frontend-ui': [
        composerJson => {
          // The version of the module didn't change but the suggested version does. Both or these are 1.0.2:
          // https://github.com/mage-os/mirror-inventory/blob/1.2.4-p5/InventoryCatalogFrontendUi/composer.json#L17
          // https://github.com/mage-os/mirror-inventory/blob/1.2.5/InventoryCatalogFrontendUi/composer.json#L17C13-L17C13
          // This affects releases 2.4.4-p1 to 2.4.5-p4.
          if (composerJson.version === '1.0.2') {
            composerJson.suggest['magento/module-inventory-catalog'] = '1.2.*';
          }
          return composerJson;
        }
      ]
    }
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
        'magento/module-page-builder':                   '2.2.1-p1', // won't be written as it is in additional-packages
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
      'magento/module-page-builder-admin-analytics': [
        composerJson => {
          // Fix 2.4.4 and 2.4.6 - 2.4.6-p2: suggested version in released package is different from tagged suggest in repo
          if (composerJson.version === '1.1.3') {
            composerJson.suggest['magento/module-admin-analytics'] = '*'
          }
          return composerJson;
        },
        composerJson => {
          // Fix 2.4.3-p1
          if (composerJson.version === '1.1.1-p1') {
            composerJson.require = {
              ...composerJson.require,
              'php':               '~7.3.0||~7.4.0',
              'magento/framework': '103.0.3-p1',
            }
            composerJson.suggest = {
              ...composerJson.suggest,
              'magento/module-admin-analytics': '100.4.3-p1',
            }
          }
          return composerJson;
        },
        composerJson => {
          // Fix 2.4.3
          if (composerJson.version === '1.1.1') {
            composerJson.require = {
              ...composerJson.require,
              'magento/framework': '~103.0.3',
            }
            composerJson.suggest = {
              ...composerJson.suggest,
              'magento/module-page-builder': '2.2.*',
            }
          }
          return composerJson;
        },
      ],
      'magento/module-catalog-page-builder-analytics': [
        composerJson => {
          // Fix 2.4.3-p1
          if (composerJson.version === '1.6.1-p1') {
            composerJson.require = {
              ...composerJson.require,
              'php':                    '~7.3.0||~7.4.0',
              'magento/module-catalog': '104.0.3-p1',
              'magento/framework':      '103.0.3-p1',
            }
          }
          // Fix 2.4.3
          if (composerJson.version === '1.6.1') {
            composerJson.require = {
              ...composerJson.require,
              'magento/module-page-builder-analytics': '1.6.*',
              'magento/module-catalog':                '~104.0.3',
              'magento/framework':                     '~103.0.3',
            }
          }
          return composerJson;
        }
      ],
      'magento/module-cms-page-builder-analytics': [
        composerJson => {
          // Fix 2.4.3-p1
          if (composerJson.version === '1.6.1-p1') {
            composerJson.require = {
              ...composerJson.require,
              'php':                '~7.3.0||~7.4.0',
              'magento/module-cms': '104.0.3-p1',
              'magento/framework':  '103.0.3-p1',
            }
          }
          // Fix 2.4.3
          if (composerJson.version === '1.6.1') {
            composerJson.require = {
              ...composerJson.require,
              'magento/framework':                     '~103.0.3',
              'magento/module-page-builder-analytics': '1.6.*',
            }
          }
          return composerJson;
        }
      ],
      'magento/module-page-builder-analytics': [
        composerJson => {
          // Fix 2.4.3-p1
          if (composerJson.version === '1.6.1-p1') {
            composerJson.require = {
              ...composerJson.require,
              'php':                      '~7.3.0||~7.4.0',
              'magento/module-analytics': '100.4.3',
              'magento/framework':        '103.0.3-p1',
            }
          }
          // Fix 2.4.3
          if (composerJson.version === '1.6.1') {
            composerJson.require = {
              ...composerJson.require,
              'magento/module-analytics':    '~100.4.3',
              'magento/module-page-builder': '2.2.*',
              'magento/framework':           '~103.0.3',
            }
          }
          return composerJson;
        }
      ],
      'magento/module-aws-s3-page-builder': [
        composerJson => {
          // Fix 2.4.3
          if (composerJson.version === '1.0.1') {
            composerJson.require = {
              ...composerJson.require,
              'magento/framework': '~103.0.3',
            }
            composerJson.suggest = {
              ...composerJson.suggest,
              'magento/module-page-builder': '2.2.*',
            }
          }
          return composerJson;
        }
      ],
      'magento/module-page-builder': [
        composerJson => {
          // Fix 2.4.3
          if (composerJson.version === '2.2.1') {
            composerJson.require = {
              ...composerJson.require,
              'magento/framework':        '~103.0.3',
              'magento/module-store':     '~101.1.3',
              'magento/module-backend':   '~102.0.3',
              'magento/module-catalog':   '~104.0.3',
              'magento/module-config':    '~101.2.3',
              'magento/module-rule':      '~100.4.2',
              'magento/module-directory': '~100.4.3',
            }
          }
          return composerJson;
        }
      ],
    }
  },
  'adobe-ims': {
    repoUrl: 'https://github.com/mage-os/mirror-adobe-ims.git',
    fromTag: '2.1.0',
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
          // Fix 2.3.7-p4 and later
          if (composerJson.version === '1.0.2' || composerJson.version === '1.0.2-p1') {
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-ims-api': '1.0.*',
            }
          }
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-admin-ui': [
        composerJson => {
          if (composerJson.version === '1.0.2') {
            // Fix 2.3.7-p4
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-ims-api':          '1.0.*',
              'magento/module-adobe-stock-client-api': '1.0.*'
            }
          }
          if (composerJson.version === '1.0.2-p1') {
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-ims-api':          '1.0.*',
              'magento/module-adobe-stock-client-api': '1.0.*'
            }
          }
          if (composerJson.version === '1.3.0-p2') {
            // This fix affects 2.4.3-p2 - 2.4.3-p3
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-stock-client-api': '2.1.0-p2'
            }
          }
          if (composerJson.version === '1.3.0-p1') {
            // This fix affects 2.4.3-p1
            composerJson.require = {
              ...composerJson.require,
              'php': '~7.3.0||~7.4.0'
            }
          }
          if (composerJson.version === '1.3.0') {
            // This fix affects 2.4.2 and 2.4.3
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-stock-client-api': '2.1.*'
            }
          }
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-asset': [
        composerJson => {
          if (composerJson.version === '1.0.2') {
            // Fix 2.3.7-p4
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-stock-asset-api':  '1.0.*',
              'magento/module-adobe-stock-client-api': '1.0.*',
            }
          }
          if (composerJson.version === '1.0.2-p1') {
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-stock-asset-api':  '1.0.*',
              'magento/module-adobe-stock-client-api': '1.0.*',
            }
          }
          if (composerJson.version === '1.3.0-p2') {
            // Fix 2.4.3-p2 - 2.4.3-p3
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-stock-asset-api':  '2.0.0-p2',
              'magento/module-adobe-stock-client-api': '2.1.0-p2',
            }
          }
          if (composerJson.version === '1.3.0-p1') {
            // Fix 2.4.3-p1
            composerJson.require = {
              ...composerJson.require,
              'php': '~7.3.0||~7.4.0',
            }
          }
          if (composerJson.version === '1.3.0') {
            // Fix 2.4.2 and 2.4.3
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-stock-asset-api': '2.0.*',
              'magento/module-adobe-stock-client-api': '2.1.*'
            }
          }
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-client': [
        composerJson => {
          if (composerJson.version === '1.0.2') {
            // Fix 2.3.7-p4
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-ims-api':          '1.0.*',
              'magento/module-adobe-stock-client-api': '1.0.*',
            }
          }
          if (composerJson.version === '1.0.2-p1') {
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-ims-api':          '1.0.*',
              'magento/module-adobe-stock-client-api': '1.0.*',
            }
          }
          if (composerJson.version === '1.3.0') {
            // Fix 2.4.2 - 2.4.2-p1
            composerJson.require['magento/module-adobe-stock-client-api'] = '2.1.*'
          }
          if (composerJson.version === '1.3.1-p2') {
            // Fix 2.4.3-p2 - 2.4.3-p3
            composerJson.require['magento/module-adobe-stock-client-api'] = '2.1.0-p2'
          }
          if (composerJson.version === '1.3.2') {
            // Fix 2.4.4-p1 to 2.4.5-p4 uses '*' in public repo, but in released package uses 2.1.*
            composerJson.require['magento/module-adobe-ims-api'] = '2.1.*'
          }
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-image': [
        composerJson => {
          if (composerJson.version === '1.0.2-p2') {
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-stock-client-api': '1.0.*',
              'magento/module-adobe-stock-asset-api':  '1.0.*',
              'magento/module-adobe-stock-image-api':  '1.0.*',
            }
          }
          if (composerJson.version === '1.3.0') {
            // Fix 2.4.2 and 2.4.2-p1
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-stock-client-api': '2.1.*',
              'magento/module-adobe-stock-asset-api':  '2.0.*',
              'magento/module-adobe-stock-image-api':  '1.3.*'
            }
          }
          if (composerJson.version === '1.3.1-p2') {
            // Fix 2.4.3-p2 - 2.4.3-p3
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-stock-client-api': '2.1.0-p2',
              'magento/module-adobe-stock-asset-api':  '2.0.0-p2',
              'magento/module-adobe-stock-image-api':  '1.3.0-p2'
            }
          }
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-image-admin-ui': [
        composerJson => {
          if (composerJson.version === '1.0.3-p2') {
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-ims':              '1.0.*',
              'magento/module-adobe-ims-api':          '1.0.*',
              'magento/module-adobe-stock-asset-api':  '1.0.*',
              'magento/module-adobe-stock-image-api':  '1.0.*',
              'magento/module-adobe-stock-client-api': '1.0.*',
            }
          }
          if (composerJson.version === '1.3.0') {
            // Fix 2.4.2 - 2.4.2-p2
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-stock-asset-api':  '2.0.*',
              'magento/module-adobe-stock-image-api':  '1.3.*',
              'magento/module-adobe-stock-client-api': '2.1.*'
            }
          }
          if (composerJson.version === '1.3.1-p2') {
            // Fix 2.4.3-p2 - 2.4.3-p3
            composerJson.require = {
              ...composerJson.require,
              'magento/module-adobe-stock-asset-api': '2.0.0-p2',
              'magento/module-adobe-stock-image-api': '1.3.0-p2',
              'magento/module-adobe-stock-client-api': '2.1.0-p2',
            }
          }
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-asset-api': [
        composerJson => {
          if (composerJson.version === '2.0.0-p1') {
            // Fix 2.4.3-p1
            composerJson.require = {
              ...composerJson.require,
              'php': '~7.3.0||~7.4.0',
            }
          }
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-client-api': [
        composerJson => {
          if (composerJson.version === '2.1.0-p1') {
            // Fix 2.4.3-p1
            composerJson.require = {
              ...composerJson.require,
              'php': '~7.3.0||~7.4.0',
            }
          }
          return composerJson;
        }
      ],
      'magento/module-adobe-stock-image-api': [
        composerJson => {
          if (composerJson.version === '1.3.0-p1') {
            // Fix 2.4.3-p1
            composerJson.require = {
              ...composerJson.require,
              'php': '~7.3.0||~7.4.0',
            }
          }
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

        // Files are different in version control than in upstream package from repo.magento.com.
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
  'composer': {
    repoUrl: 'https://github.com/mage-os/mirror-composer.git',
    fromTag: '1.0.0',
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
  'magento-allure-phpunit': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-allure-phpunit.git',
    fromTag: '3.0.2',
  },
  'magento2-sample-data': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-sample-data.git',
    fromTag: '2.3.7-p3',
  },
  'magento-coding-standard': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-coding-standard.git',
    fromTag: '1.0.0',
  },
  'magento2-functional-testing-framework': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-functional-testing-framework.git',
    fromTag: '1.0.0',
  },
  'magento-zend-db': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-db.git',
    fromTag: '1.16.0'
  },
  'magento-zend-loader': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-loader.git',
    fromTag: '1.16.0'
  },
  'magento-zend-pdf': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-pdf.git',
    fromTag: '1.16.0'
  },
  'magento-zend-cache': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-cache.git',
    fromTag: '1.16.0'
  },
  'magento-zend-exception': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-exception.git',
    fromTag: '1.16.0'
  },
  'magento-zend-log': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-log.git',
    fromTag: '1.16.0'
  },
  'magento-zend-memory': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-memory.git',
    fromTag: '1.16.0'
  },
  'magento-zf-db': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zf-db.git',
    fromTag: '3.21.0'
  },
  'php-compatibility-fork': {
    repoUrl: 'https://github.com/mage-os/mirror-PHPCompatibilityFork',
    fromTag: 'v0.1.0'
  },
}

module.exports = {
  buildConfig: mergeBuildConfigs(packagesConfig, mirrorBuildConfig)};
