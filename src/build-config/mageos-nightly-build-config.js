
const {
  transformMagentoCommunityEditionProject,
  transformMagentoCommunityEditionProduct
} = require('../build-metapackage/magento-community-edition');
const {
  transformMageOSCommunityEditionProject,
  transformMageOSCommunityEditionProduct
} = require('../build-metapackage/mage-os-community-edition');
const packagesConfig = require('./packages-config');
const {mergeBuildConfigs} = require('../utils');

const branchBuildConfig = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2.git',
    ref: 'main',
    extraMetapackages: [
      {
        name: 'project-community-edition',
        type: 'project',
        description: 'Mage-OS Community Edition Project',
        transform: [
          transformMagentoCommunityEditionProject,
          transformMageOSCommunityEditionProject,
        ]
      },
      {
        name: 'product-community-edition',
        type: 'metapackage',
        description: 'Mage-OS Community Edition',
        transform: [
          transformMagentoCommunityEditionProduct,
          transformMageOSCommunityEditionProduct,
        ]
      }
    ],
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
      ],
    }
  },
  'security-package': {
    repoUrl: 'https://github.com/mage-os/mageos-security-package.git',
    ref: 'main',
  },
  'inventory': {
    repoUrl: 'https://github.com/mage-os/mageos-inventory.git',
    ref: 'main',
  },
  'inventory-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mageos-inventory-composer-installer.git',
    ref: 'main',
  },
  'page-builder': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2-page-builder.git',
    ref: 'main',
  },
  // Starting from Adobe Commerce and Magento Open Source 2.4.5 release Adobe IMS Integration package became part of Magento Open Source project.
  // 'adobe-ims': {
  //   repoUrl: 'https://github.com/mage-os/mageos-adobe-ims.git',
  //   ref: 'develop',
  // },
  'adobe-stock-integration': {
    repoUrl: 'https://github.com/mage-os/mageos-adobe-stock-integration.git',
    ref: 'main',
  },
  'magento-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-composer-installer.git',
    ref: 'main',
  },
  'composer': {
    repoUrl: 'https://github.com/mage-os/mageos-composer.git',
    ref: 'main',
  },
  'composer-root-update-plugin': {
    repoUrl: 'https://github.com/mage-os/mageos-composer-root-update-plugin.git',
    ref: 'main',
  },
  'composer-dependency-version-audit-plugin': {
    repoUrl: 'https://github.com/mage-os/mageos-composer-dependency-version-audit-plugin.git',
    ref: 'main',
  },
  'magento2-sample-data': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2-sample-data.git',
    ref: 'main',
  },
  // Keep disabled until someone takes up maintenance of commerce-data-export tags
  // 'commerce-data-export': {
  //   repoUrl: 'https://github.com/mage-os/mageos-commerce-data-export.git',
  //   ref: 'main'
  // },
  'magento-allure-phpunit': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-allure-phpunit.git',
    ref: 'main'
  },
  'magento-coding-standard': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-coding-standard.git',
    ref: 'main'
  },
  'magento2-functional-testing-framework': {
    repoUrl: 'https://github.com/mage-os/mageos-magento2-functional-testing-framework.git',
    ref: 'main'
  },
  'magento-zend-db': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-db.git',
    ref: 'main'
  },
  'magento-zend-loader': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-loader.git',
    ref: 'main'
  },
  'magento-zend-pdf': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-pdf.git',
    ref: 'main'
  },
  'magento-zend-cache': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-cache.git',
    ref: 'main'
  },
  'magento-zend-exception': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-exception.git',
    ref: 'main'
  },
  'magento-zend-log': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-log.git',
    ref: 'main'
  },
  'magento-zend-memory': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zend-memory.git',
    ref: 'main'
  },
  'magento-zf-captcha': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zf-captcha.git',
    ref: 'main',
  },
  'magento-zf-db': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zf-db.git',
    ref: 'main'
  },
  'module-automatic-translation': {
    repoUrl: 'https://github.com/mage-os/module-automatic-translation.git',
    ref: 'main'
  },
  'module-inventory-reservations-grid': {
    repoUrl: 'https://github.com/mage-os/module-inventory-reservations-grid.git',
    ref: 'main'
  },
  'module-meta-robots-tag': {
    repoUrl: 'https://github.com/mage-os/module-meta-robots-tag.git',
    ref: 'main'
  },
  'module-page-builder-template-import-export': {
    repoUrl: 'https://github.com/mage-os/module-pagebuilder-template-import-export.git',
    ref: 'master'
  },
  'module-page-builder-widget': {
    repoUrl: 'https://github.com/mage-os/module-page-builder-widget.git',
    ref: 'master'
  },
  'module-theme-optimization': {
    repoUrl: 'https://github.com/mage-os/module-theme-optimization.git',
    ref: 'main'
  },
  'theme-adminhtml-m137': {
    repoUrl: 'https://github.com/mage-os/theme-adminhtml-m137.git',
    ref: 'main'
  },
  'module-theme-adminhtml-switcher': {
    repoUrl: 'https://github.com/mage-os/module-theme-adminhtml-switcher.git',
    ref: 'main'
  },
  'magento-zf-soap': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zf-soap.git',
    ref: 'main'
  },
  'magento-zf-captcha': {
    repoUrl: 'https://github.com/mage-os/mageos-magento-zf-captcha.git',
    ref: 'main'
  },
};

module.exports = {
  buildConfig: mergeBuildConfigs(packagesConfig, branchBuildConfig)
};
