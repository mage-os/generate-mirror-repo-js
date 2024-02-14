module.exports = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2.git',

    magentoCommunityEditionProject: true,
    magentoCommunityEditionMetapackage: true,

    packageDirs: [
      {label: 'Magento Core Modules', dir: 'app/code/Magento'},
      {label: 'Magento Language packages', dir: 'app/i18n/Magento'}
    ],
    packageIndividual: [
      {
        label: 'Magento Base Package',
        dir: '',
        // Excludes can either be (A) strings that are matched against the beginning of a file path, or (B) a function
        // Exclude functions are called in two ways:
        // - with a ref and a filename: it should return a boolean if the file should be excluded or not (true === excluded)
        // - with only a ref: in that case it should return a string filename that should be excluded, or an empty string if none.
        // Exclude functions will be called with both arities during a build!
        excludes: [(ref, file) => {
          if (typeof file === "undefined") {
            return ref.startsWith('2.4.0') ? '' : '.github/';
          }
          return !ref.startsWith('2.4.0') && (file === '.github' || file.startsWith('.github/'));
        }, (ref, file) => {
          const releasesWithGitIgnore = ['2.4.0-p1', '2.4.0', '2.3.7-p4', '2.3.7-p3', '2.3.7-p2', '2.4.2-p1', '2.4.2-p2', '2.4.3', '2.4.3-p1', '2.4.3-p2', '2.4.3-p3', '2.4.4', '2.4.4-p1', '2.4.4-p2', '2.4.5', '2.4.5-p1', '2.4.7-beta2', '2.4.7-beta1']
          if (typeof file === "undefined") {
            return releasesWithGitIgnore.includes(ref) ? '' : '.gitignore'
          }
          return file === '.gitignore' && ! releasesWithGitIgnore.includes(ref);
        }, "app/code/", "app/design/frontend/", "app/design/adminhtml/", "app/i18n/", "lib/internal/Magento/Framework/", "composer.lock", "app/etc/vendor_path.php", "dev/tests/static/testsuite/Magento/Test/Legacy/FilesystemTest.php"],
        composerJsonPath: `${__dirname}/../../resource/composer-templates/magento/magento2-base/template.json`,
        // The directories are required for the magento-composer-installer to properly function, otherwise it doesn't complete processing and app/etc is missing.
        emptyDirsToAdd: ['app/design/frontend/Magento', 'app/design/adminhtml/Magento', 'app/code/Magento', 'app/i18n/Magento', 'lib/internal/Magento'],
      },
      {
        label: 'Magento Framework',
        dir: 'lib/internal/Magento/Framework',
        excludes: ['lib/internal/Magento/Framework/Amqp/', 'lib/internal/Magento/Framework/Bulk/', 'lib/internal/Magento/Framework/MessageQueue/'],
      },
      {
        label: 'Magento Framework_Amqp',
        dir: 'lib/internal/Magento/Framework/Amqp',
      },
      {
        label: 'Magento Framework_Bulk',
        dir: 'lib/internal/Magento/Framework/Bulk',
      },
      {
        label: 'Magento Framework_MessageQueue',
        dir: 'lib/internal/Magento/Framework/MessageQueue',
      },
      {
        label: 'Magento Magento Admin Theme',
        dir: 'app/design/adminhtml/Magento/backend',
      },
      {
        label: 'Magento Magento Blank Theme',
        dir: 'app/design/frontend/Magento/blank',
      },
      {
        label: 'Magento Magento Luma Theme',
        dir: 'app/design/frontend/Magento/luma',
      },
    ],
    packageMetaFromDirs: [],
  },
  'security-package': {
    repoUrl: 'https://github.com/mage-os/mirror-security-package.git',

    packageDirs: [
      {
        label: 'Security Packages',
        dir: '',
        excludes: ['.github/', '_metapackage/', 'dev/', '.git/'],
      }
    ],
    packageIndividual: [],
    packageMetaFromDirs: [
      {
        label: 'Security Metapackage',
        dir: '_metapackage',
      }
    ],
  },
  'inventory': {
    repoUrl: 'https://github.com/mage-os/mirror-inventory.git',

    packageDirs: [
      {
        label: 'Inventory Packages',
        dir: '',
        excludes: ['.github/', '_metapackage/', 'dev/', '.git/'],
      }
    ],
    packageIndividual: [],
    packageMetaFromDirs: [
      {
        label: 'Inventory Metapackage',
        dir: '_metapackage',
      }
    ],
  },
  'inventory-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mirror-inventory-composer-installer.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Inventory Composer Installer Package',
        dir: '',
      },
    ],
    packageMetaFromDirs: [],
  },
  'page-builder': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-page-builder.git',

    packageDirs: [
      {
        label: 'PageBuilder Packages',
        dir: 'app/code/Magento',
        excludes: ['app/code/Magento/_metapackage/', '.git/'],
      }
    ],
    packageIndividual: [],
    packageMetaFromDirs: [
      {
        label: 'PageBuilder Metapackage',
        dir: 'app/code/Magento/_metapackage',
      },
    ],
  },
  'adobe-ims': {
    repoUrl: 'https://github.com/mage-os/mirror-adobe-ims.git',

    packageDirs: [
      {
        label: 'Adobe IMS Packages',
        dir: '',
        excludes: ['_metapackage/', '.github/', 'i18n', 'dev', '.git/'],
      }
    ],
    packageIndividual: [],
    packageMetaFromDirs: [
      {
        label: 'Adobe IMS Metapackage',
        dir: '_metapackage',
      },
    ],
  },
  'adobe-stock-integration': {
    repoUrl: 'https://github.com/mage-os/mirror-adobe-stock-integration.git',

    packageDirs: [
      {
        label: 'Stock Integration Packages',
        dir: '',
        excludes: ['_metapackage/', '.github/', 'dev/', '.git/'],
      }
    ],
    packageIndividual: [],
    packageMetaFromDirs: [
      {
        label: 'Adobe Stock Integration Metapackage',
        dir: '_metapackage',
      },
    ],
  },
  'magento-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-composer-installer.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento Composer Installer',
        dir: '',
      }
    ],
    packageMetaFromDirs: [],
  },
  'composer': {
    repoUrl: 'https://github.com/mage-os/mirror-composer.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento Composer',
        dir: '',
      }
    ],
    packageMetaFromDirs: [],
  },
  'composer-root-update-plugin': {
    repoUrl: 'https://github.com/mage-os/mirror-composer-root-update-plugin.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento Composer Root Update Plugin',
        dir: 'src/Magento/ComposerRootUpdatePlugin',
      }
    ],
    packageMetaFromDirs: [],
  },
  'composer-dependency-version-audit-plugin': {
    repoUrl: 'https://github.com/mage-os/mirror-composer-dependency-version-audit-plugin.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento Composer Dependency Version Audit Plugin',
        dir: '',
      }
    ],
    packageMetaFromDirs: [],
  },
  'magento2-sample-data': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-sample-data.git',

    packageDirs: [
      {
        label: 'Community Edition Sample Data',
        dir: 'app/code/Magento',
      }
    ],
    packageIndividual: [
      {
        label: 'Community Edition Sample Data Media',
        dir: 'pub/media',
      }
    ],
    packageMetaFromDirs: [],
  },
  'commerce-data-export': {
    repoUrl: 'https://github.com/mage-os/mirror-commerce-data-export.git',

    packageDirs: [
      {
        label: 'Commerce Data Export Packages',
        dir: '',
        excludes: ['.github/', '_metapackage/', 'dev/', '.git/'],
      }
    ],
    packageIndividual: [],
    packageMetaFromDirs: [
      {
        label: 'Commerce Data Export Metapackage',
        dir: '_metapackage',
      }
    ],
  },
  'magento-coding-standard': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-coding-standard.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento Coding Standard',
        dir: ''
      }
    ],
    packageMetaFromDirs: [],
  },
  'magento2-functional-testing-framework': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-functional-testing-framework.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento2 Functional Testing Framework',
        dir: ''
      }
    ],
    packageMetaFromDirs: [],
  },
  'magento-zend-db': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-db.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento fork of Zend_Db',
        dir: ''
      }
    ],
    packageMetaFromDirs: [],
  },
  'magento-zend-loader': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-loader.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento fork of Zend_Loader',
        dir: ''
      }
    ],
    packageMetaFromDirs: [],
  },
  'magento-zend-pdf': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-pdf.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento fork of Zend_Pdf',
        dir: ''
      }
    ],
    packageMetaFromDirs: [],
  },
  'magento-zend-cache': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-cache.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento fork of Zend_Cache',
        dir: ''
      }
    ],
    packageMetaFromDirs: [],
  },
  'magento-zend-exception': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-exception.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento fork of Zend_Exception',
        dir: ''
      }
    ],
    packageMetaFromDirs: [],
  },
  'magento-zend-log': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-log.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento fork of Zend_Log',
        dir: ''
      }
    ],
    packageMetaFromDirs: [],
  },
  'magento-zend-memory': {
    repoUrl: 'https://github.com/mage-os/mirror-magento-zend-memory.git',

    packageDirs: [],
    packageIndividual: [
      {
        label: 'Magento fork of Zend_Memory',
        dir: ''
      }
    ],
    packageMetaFromDirs: [],
  },
};
