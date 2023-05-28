
const packagesConfig = require('./packages-config');
const {mergeBuildConfigs} = require('../utils');

const branchBuildConfig = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2.git',
    ref: '2.4-develop',
    transform: {
      // For magento/elasticsearch-8, remove the elasticsearch/elasticsearch dependency.
      // See https://github.com/magento/magento2/issues/36687
      'magento/module-elasticsearch-8': [
        composerJson => {
          if (composerJson?.require['elasticsearch/elasticsearch']) {
            delete composerJson.require['elasticsearch/elasticsearch'];
          }
          return composerJson;
        }
      ]
    }
  },
  'security-package': {
    repoUrl: 'https://github.com/mage-os/mageos-security-package.git',
    ref: 'develop',
  },
  'inventory': {
    repoUrl: 'https://github.com/mage-os/mageos-inventory.git',
    ref: 'develop',
  },
  'inventory-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mageos-inventory-composer-installer.git',
    ref: 'master',
  },
  'page-builder': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2-page-builder.git',
    ref: 'develop',
  },
  // Starting from Adobe Commerce and Magento Open Source 2.4.5 release Adobe IMS Integration package became part of Magento Open Source project.
  // 'adobe-ims': {
  //   repoUrl: 'https://github.com/mage-os/mageos-adobe-ims.git',
  //   ref: 'develop',
  // },
  'adobe-stock-integration': {
    repoUrl: 'https://github.com/mage-os/mageos-adobe-stock-integration.git',
    ref: 'develop',
  },
  'magento-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-composer-installer.git',
    ref: 'master',
  },
  'composer-root-update-plugin': {
    repoUrl: 'https://github.com/mage-os/mageos-composer-root-update-plugin.git',
    ref: 'develop',
  },
  'composer-dependency-version-audit-plugin': {
    repoUrl: 'https://github.com/mage-os/mageos-composer-dependency-version-audit-plugin.git',
    ref: 'main',
  },
  'magento2-sample-data': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2-sample-data.git',
    ref: '2.4-develop',
  },
  'commerce-data-export': {
    repoUrl: 'https://github.com/mage-os/mageos-commerce-data-export.git',
    ref: 'main'
  }
};

module.exports = {
  buildConfig: mergeBuildConfigs(packagesConfig, branchBuildConfig)
};
