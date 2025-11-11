
const packagesConfig = require('./packages-config');
const {mergeBuildConfigs} = require('../utils');
const {updateComposerConfigFromMagentoToMageOs} = require('../release-build-tools');

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
        // @TODO: Change full name to just the package name?
        name: 'mage-os/project-community-edition',
        type: 'project',
        description: 'Mage-OS Community Edition Project',
        // @TODO: I don't think this is right
        basePackage: 'magento2-base',
        historyPath: 'project-community-edition',
        transform: [
          (composerConfig, instruction, release) => {
            updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig);
            return composerConfig;
          }
        ]
      },
      {
        name: 'mage-os/product-community-edition',
        type: 'metapackage',
        description: 'Mage-OS Community Edition',
        basePackage: 'magento2-base',
        historyPath: 'product-community-edition',
        transform: [
          (composerConfig, instruction, release) => {
            updateComposerConfigFromMagentoToMageOs(instruction, release, composerConfig)

            // Add upstreamRelease to composer extra data for reference
            composerConfig.extra = composerConfig.extra || {};
            composerConfig.extra.magento_version = release.replaceVersions['magento/product-community-edition'];

            return composerConfig
          }
        ]
      },
      {
        name: 'mage-os/project-minimal',
        type: 'metapackage',
        description: 'Mage-OS Minimal Edition Project',
        basePackage: 'magento2-base',
        exclude: [
          'mage-os/module-page-builder',
          'mage-os/module-adobe-*'
        ],
        historyPath: 'project-minimal'
      },
      {
        name: 'mage-os/product-minimal',
        type: 'metapackage',
        description: 'Mage-OS Minimal Edition',
        basePackage: 'magento2-base',
        exclude: [
          'mage-os/module-page-builder',
          'mage-os/module-adobe-*'
        ],
        historyPath: 'product-minimal'
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
  // 'theme-adminhtml-m137': {
  //   repoUrl: 'https://github.com/mage-os-lab/theme-adminhtml-m137.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'theme-adminhtml-m137',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'module-theme-adminhtml-switcher': {
  //   repoUrl: 'https://github.com/mage-os-lab/module-theme-adminhtml-switcher.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'module-theme-adminhtml-switcher',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'mageos-async-events-sinks': {
  //   repoUrl: 'https://github.com/mage-os/mageos-async-events-sinks.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'mageos-async-events-sinks',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'mageos-async-events-admin-ui': {
  //   repoUrl: 'https://github.com/mage-os/mageos-async-events-admin-ui.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'mageos-async-events-admin-ui',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // // 'mageos-async-events-azure': {
  // //   repoUrl: 'https://github.com/mage-os/mageos-async-events-azure.git',
  // //   ref: 'main',
  // //   fromTag: '1.0.0',
  // //   packageDirs: [],
  // //   packageIndividual: [
  // //     {
  // //       label: 'mageos-async-events-azure',
  // //       dir: ''
  // //     }
  // //   ],
  // //   packageMetaFromDirs: [],
  // // },
  // 'mageos-async-events': {
  //   repoUrl: 'https://github.com/mage-os/mageos-async-events.git',
  //   ref: '4.x',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'mageos-async-events',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'mageos-async-events-aws': {
  //   repoUrl: 'https://github.com/mage-os/mageos-async-events-aws.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'mageos-async-events-aws',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'mageos-async-events-gcp': {
  //   repoUrl: 'https://github.com/mage-os/mageos-async-events-gcp.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'mageos-async-events-gcp',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'mageos-common-async-events': {
  //   repoUrl: 'https://github.com/mage-os/mageos-common-async-events.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'mageos-common-async-events',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'module-inventory-reservations-grid': {
  //   repoUrl: 'https://github.com/mage-os-lab/module-inventory-reservations-grid.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'module-inventory-reservations-grid',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'module-automatic-translation': {
  //   repoUrl: 'https://github.com/mage-os-lab/module-automatic-translation.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'module-automatic-translation',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'web-installer': {
  //   repoUrl: 'https://github.com/mage-os-lab/web-installer.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'web-installer',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'module-meta-robots-tag': {
  //   repoUrl: 'https://github.com/mage-os-lab/module-meta-robots-tag.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'module-meta-robots-tag',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'module-catalog-data-ai': {
  //   repoUrl: 'https://github.com/mage-os-lab/module-catalog-data-ai.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'module-catalog-data-ai',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'module-pagebuilder-template-import-export': {
  //   repoUrl: 'https://github.com/mage-os-lab/module-pagebuilder-template-import-export.git',
  //   ref: 'master',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'module-pagebuilder-template-import-export',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
  // 'module-admin-assistant': {
  //   repoUrl: 'https://github.com/mage-os-lab/module-admin-assistant.git',
  //   ref: 'main',
  //   fromTag: '1.0.0',
  //   packageDirs: [],
  //   packageIndividual: [
  //     {
  //       label: 'module-admin-assistant',
  //       dir: ''
  //     }
  //   ],
  //   packageMetaFromDirs: [],
  // },
};

module.exports = {
  buildConfig: mergeBuildConfigs(packagesConfig, releaseBuildConfig)
};
