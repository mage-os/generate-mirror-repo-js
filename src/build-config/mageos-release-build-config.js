
const packagesConfig = require('./packages-config');
const {mergeBuildConfigs} = require('../utils');

const releaseBuildConfig = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2.git',
    ref: '2.4-develop',
    fromTag: '1.0.0',
    packageIndividual: [
      {
        label: 'Magento Base Package',
        composerJsonPath: `${__dirname}/../../resource/composer-templates/mage-os/magento2-base/template.json`,
      }
    ],
  },
  'security-package': {
    repoUrl: 'https://github.com/mage-os/mageos-security-package.git',
    ref: 'develop',
    fromTag: '1.0.0',
  },
  'inventory': {
    repoUrl: 'https://github.com/mage-os/mageos-inventory.git',
    ref: 'develop',
    fromTag: '1.0.0',
  },
  'inventory-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mageos-inventory-composer-installer.git',
    ref: 'master',
    fromTag: '1.0.0',
  },
  'page-builder': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2-page-builder.git',
    ref: 'develop',
    fromTag: '1.0.0',
  },
  'adobe-stock-integration': {
    repoUrl: 'https://github.com/mage-os/mageos-adobe-stock-integration.git',
    ref: 'develop',
    fromTag: '1.0.0',
  },
  'magento-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-composer-installer.git',
    ref: 'master',
    fromTag: '1.0.0',
  },
  'composer': {
    repoUrl: 'https://github.com/mage-os/mageos-composer.git',
    ref: 'develop',
    fromTag: '1.0.0',
  },
  'composer-root-update-plugin': {
    repoUrl: 'https://github.com/mage-os/mageos-composer-root-update-plugin.git',
    ref: 'develop',
    fromTag: '1.0.0',
  },
  'composer-dependency-version-audit-plugin': {
    repoUrl: 'https://github.com/mage-os/mageos-composer-dependency-version-audit-plugin.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'magento2-sample-data': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2-sample-data.git',
    ref: '2.4-develop',
    fromTag: '1.0.0',
  },
  'magento-coding-standard': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-coding-standard.git',
    ref: 'develop',
    fromTag: '1.0.0',
  },
  'magento2-functional-testing-framework': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2-functional-testing-framework.git',
    ref: 'develop',
    fromTag: '1.0.0',
  },
  'magento-zend-db': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-db.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'magento-zend-loader': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-loader.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'magento-zend-pdf': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-pdf.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'magento-zend-cache': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-cache.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'magento-zend-exception': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-exception.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'magento-zend-log': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-log.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'magento-zend-memory': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-memory.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
};

module.exports = {
  buildConfig: mergeBuildConfigs(packagesConfig, releaseBuildConfig)
};
