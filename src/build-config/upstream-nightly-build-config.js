
const packagesConfig = require('./packages-config');

const branchBuildConfig = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2.git',
    ref: '2.4-develop',
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
  }
};

module.exports = {
  buildConfig: Object.keys(branchBuildConfig).reduce((acc, key) => {
    acc.push(Object.assign({}, (packagesConfig[key] || {}), branchBuildConfig[key]));
    return acc;
  }, [])
};