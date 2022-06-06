
const packagesConfig = require('./packages-config');

function getReleaseDate() {
  const d = new Date();
  return `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
}

const releaseDate = getReleaseDate();

const branchBuildConfig = {
  'magento2': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2.git',
    ref: '2.4-develop',
    release: `2.4.x-${releaseDate}`,
  },
  // ##### TODO: create mageos fork for the following repos: ######
  'security-package': {
    repoUrl: 'https://github.com/mage-os/mirror-security-package.git',
    ref: 'develop',
    release: `1.1.x-${releaseDate}`,
  },
  'inventory': {
    repoUrl: 'https://github.com/mage-os/mirror-inventory.git',
    ref: '1.2-develop',
    release: `1.2.x-${releaseDate}`,
  },
  'inventory-composer-installer': {
    repoUrl: 'https://github.com/mage-os/mirror-inventory-composer-installer.git',
    ref: 'master',
    release: `1.2.x-${releaseDate}`,
  },
  'page-builder': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-page-builder.git',
    ref: 'develop',
    release: `1.6.x-${releaseDate}`,
  },
  'adobe-ims': {
    repoUrl: 'https://github.com/mage-os/mirror-adobe-ims.git',
    ref: '2.1.0-develop',
    release: `2.1.x-${releaseDate}`,
  },
  'adobe-stock-integration': {
    repoUrl: 'https://github.com/mage-os/mirror-adobe-stock-integration.git',
    ref: 'develop',
    release: `1.6.x-${releaseDate}`,
  },
  'composer-root-update-plugin': {
    repoUrl: 'https://github.com/mage-os/mirror-composer-root-update-plugin.git',
    ref: 'develop',
    release: `2.0.x-${releaseDate}`,
  },
  'composer-dependency-version-audit-plugin': {
    repoUrl: 'https://github.com/mage-os/mirror-composer-dependency-version-audit-plugin.git',
    ref: 'main',
    release: `0.1.x-${releaseDate}`,
  },
  'magento2-sample-data': {
    repoUrl: 'https://github.com/mage-os/mirror-magento2-sample-data.git',
    ref: '2.4-develop',
    release: `2.4.x-${releaseDate}`,
  }
};

module.exports = {
  buildConfig: Object.keys(branchBuildConfig).reduce((acc, key) => {
    acc.push(Object.assign({}, (packagesConfig[key] || {}), branchBuildConfig[key]));
    return acc;
  }, [])
};