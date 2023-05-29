
const packagesConfig = require('./packages-config');
const {mergeBuildConfigs} = require('../utils');

const releaseBuildConfig = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2.git',
    ref: '2.4-develop',
    packageIndividual: [
      {
        label: 'Magento Base Package',
        composerJsonPath: `${__dirname}/../../resource/composer-templates/mage-os/magento2-base/template.json`,
      }
    ]
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
  'adobe-stock-integration': {
    repoUrl: 'https://github.com/mage-os/mageos-adobe-stock-integration.git',
    ref: 'develop',
  },
  'magento-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-composer-installer.git',
    ref: 'master',
  },
  // Keep disabled until repo exists and is integrated into upstream synchronization process
  // 'composer': {
  //   repoUrl: 'https://github.com/mage-os/mageos-composer.git',
  //   ref: 'develop',
  // },
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
  // Keep disabled until repos exist and are integrated into the upstream synchronization process
  // 'magento-coding-standard': {
  //   repoUrl: 'https://github.com/mage-os/mageos-magento-coding-standard.git',
  //   ref: 'develop'
  // },
  // 'magento2-functional-testing-framework': {
  //   repoUrl: 'https://github.com/mage-os/mageos-magento2-functional-testing-framework.git',
  //   ref: 'develop'
  // },
};

module.exports = {
  buildConfig: mergeBuildConfigs(packagesConfig, releaseBuildConfig)
};
