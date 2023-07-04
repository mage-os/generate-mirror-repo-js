
const packagesConfig = require('./packages-config');

const branchBuildConfig = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2.git',
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
    repoUrl: 'https://github.com/mage-os/mirror-security-package.git',
    ref: 'develop',
  },
  'inventory': {
    repoUrl: 'https://github.com/mage-os/mirror-inventory.git',
    ref: 'develop',
  },
  'inventory-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mirror-inventory-composer-installer.git',
    ref: 'master',
  },
  'page-builder': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-page-builder.git',
    ref: 'develop',
  },
  // Starting from Adobe Commerce and Magento Open Source 2.4.5 release Adobe IMS Integration package became part of Magento Open Source project.
  // 'adobe-ims': {
  //   repoUrl: 'https://github.com/mage-os/mirror-adobe-ims.git',
  //   ref: 'develop',
  // },
  'adobe-stock-integration': {
    repoUrl: 'https://github.com/mage-os/mirror-adobe-stock-integration.git',
    ref: 'develop',
  },
  'magento-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-composer-installer.git',
    ref: 'master',
  },
  'composer': {
    repoUrl: 'https://github.com/mage-os/mirror-composer.git',
    ref: 'develop',
  },
  'composer-root-update-plugin': {
    repoUrl: 'https://github.com/mage-os/mirror-composer-root-update-plugin.git',
    ref: 'develop',
  },
  'composer-dependency-version-audit-plugin': {
    repoUrl: 'https://github.com/mage-os/mirror-composer-dependency-version-audit-plugin.git',
    ref: 'main',
  },
  'magento2-sample-data': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-sample-data.git',
    ref: '2.4-develop',
  },
  'commerce-data-export': {
    repoUrl: 'https://github.com/mage-os/mirror-commerce-data-export.git',
    ref: 'main'
  },
  'magento-coding-standard': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-coding-standard.git',
    ref: 'develop'
  },
  'magento2-functional-testing-framework': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-functional-testing-framework.git',
    ref: 'develop'
  },
};

module.exports = {
  buildConfig: Object.keys(branchBuildConfig).reduce((acc, key) => {
    acc.push(Object.assign({}, (packagesConfig[key] || {}), branchBuildConfig[key]));
    return acc;
  }, [])
};