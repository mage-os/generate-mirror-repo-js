const {
  transformMagentoCommunityEditionProject,
  transformMagentoCommunityEditionProduct
} = require('../build-metapackage/magento-community-edition');
const {
  transformMageOSCommunityEditionProject,
  transformMageOSCommunityEditionProduct
} = require('../build-metapackage/mage-os-community-edition');
const {
  transformMageOSMinimalProduct
} = require('../build-metapackage/mage-os-minimal');

const packagesConfig = require('./packages-config');
const {mergeBuildConfigs} = require('../utils');

const releaseBuildConfig = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2.git',
    ref: 'main',
    fromTag: '1.0.0',
    packageIndividual: [
      {
        label: 'Magento Base Package',
        composerJsonPath: `${__dirname}/../../resource/composer-templates/mage-os/magento2-base/template.json`,
      }
    ],
    extraMetapackages: [
      {
        name: 'project-community-edition',
        type: 'project',
        fromTag: '1.0.0',
        description: 'Mage-OS Community Edition Project',
        transform: [
          transformMagentoCommunityEditionProject,
          transformMageOSCommunityEditionProject,
        ]
      },
      {
        name: 'product-community-edition',
        type: 'metapackage',
        fromTag: '1.0.0',
        description: 'Mage-OS Community Edition',
        transform: [
          transformMagentoCommunityEditionProduct,
          transformMageOSCommunityEditionProduct,
        ]
      },
      {
        name: 'project-minimal-edition',
        type: 'project',
        fromTag: '2.2.0',
        description: 'Mage-OS Minimal Edition Project',
        transform: [
          transformMagentoCommunityEditionProject,
          transformMageOSCommunityEditionProject,
        ]
      },
      {
        name: 'product-minimal-edition',
        type: 'metapackage',
        fromTag: '2.2.0',
        description: 'Mage-OS Minimal Edition',
        transform: [
          transformMagentoCommunityEditionProduct,
          transformMageOSCommunityEditionProduct,
          transformMageOSMinimalProduct
        ]
      }
    ]
  },
  'security-package': {
    repoUrl: 'https://github.com/mage-os/mageos-security-package.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'inventory': {
    repoUrl: 'https://github.com/mage-os/mageos-inventory.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'inventory-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mageos-inventory-composer-installer.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'page-builder': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2-page-builder.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'adobe-stock-integration': {
    repoUrl: 'https://github.com/mage-os/mageos-adobe-stock-integration.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'magento-allure-phpunit': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-allure-phpunit.git',
    ref: 'main',
    fromTag: '1.1.0',
  },
  'magento-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-composer-installer.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'composer': {
    repoUrl: 'https://github.com/mage-os/mageos-composer.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'composer-root-update-plugin': {
    repoUrl: 'https://github.com/mage-os/mageos-composer-root-update-plugin.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'composer-dependency-version-audit-plugin': {
    repoUrl: 'https://github.com/mage-os/mageos-composer-dependency-version-audit-plugin.git',
    ref: 'mage-os',
    fromTag: '1.0.0',
  },
  'magento2-sample-data': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2-sample-data.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'magento-coding-standard': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-coding-standard.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'magento2-functional-testing-framework': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2-functional-testing-framework.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
  'magento-zend-db': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-db.git',
    ref: 'mage-os',
    fromTag: '1.0.0',
  },
  'magento-zend-loader': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-loader.git',
    ref: 'mage-os',
    fromTag: '1.0.0',
  },
  'magento-zend-pdf': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-pdf.git',
    ref: 'mage-os',
    fromTag: '1.0.0',
  },
  'magento-zend-cache': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-cache.git',
    ref: 'mage-os',
    fromTag: '1.0.0',
  },
  'magento-zend-exception': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-exception.git',
    ref: 'mage-os',
    fromTag: '1.0.0',
  },
  'magento-zend-log': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-log.git',
    ref: 'mage-os',
    fromTag: '1.0.0',
  },
  'magento-zend-memory': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-memory.git',
    ref: 'mage-os',
    fromTag: '1.0.0',
  },
  'magento-zf-db': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zf-db.git',
    ref: 'main',
    fromTag: '1.1.0',
  },
  'php-compatibility-fork': {
    repoUrl: 'https://github.com/mage-os/mageos-PHPCompatibilityFork.git',
    ref: 'main',
    fromTag: '1.0.0',
  },
};

module.exports = {
  buildConfig: mergeBuildConfigs(packagesConfig, releaseBuildConfig)
};
