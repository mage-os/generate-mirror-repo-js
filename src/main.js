const repo = require('./repository');
const parseOptions = require('parse-options');
const {setArchiveBaseDir, setMageosPackageRepoUrl} = require('./package-modules');
const build = require('./build');

const options = parseOptions(
  `$outputDir $gitRepoDir $mirrorUrl @help|h`,
  process.argv
);


if (options.help) {
  console.log(`Build Mage-OS composer packages from github.com/mage-os git repositories.

Usage:
  node src/main [OPTIONS]
  
Options:
  --outputDir=   Dir to contain the built packages (default: packages)
  --gitRepoDir=  Dir to clone repositories into (default: repositories)
  --mirrorUrl=   Composer repository URL to use in base package (default: https://mirror.mage-os.org/)
`);
  process.exit(1);
}

const archiveDir = options.outputDir || 'packages';
setArchiveBaseDir(archiveDir);

if (options.gitRepoDir) {
  repo.setStorageDir(options.gitRepoDir);
}

if (options.mirrorUrl) {
  setMageosPackageRepoUrl(options.mirrorUrl);
}

(async function () {
  
  let tags, exclude, composerJsonPath, emptyDirsToAdd;

  let repoUrl = 'https://github.com/mage-os/mirror-magento2.git';

  console.log('Packaging Magento Core Modules');
  exclude = [];
  tags = await build.createPackagesSinceTag(repoUrl, '2.4.0', 'app/code/Magento', exclude)
  console.log('core module packages', tags)

  console.log('Packaging Magento Base Package');
  exclude = [".github/", "app/code/", "app/design/frontend/", "app/design/adminhtml/", "app/i18n/", "lib/internal/Magento/Framework/", "composer.lock", "app/etc/vendor_path.php"];
  composerJsonPath = `${__dirname}/../resource/history/magento/magento2-base/{{version}}.json`;
  // The directories are required for the magento-composer-installer to properly function, otherwise it doesn't complete processing and app/etc is missing.
  emptyDirsToAdd = ['app/design/frontend/Magento', 'app/design/adminhtml/Magento', 'app/code/Magento', 'app/i18n/Magento', 'lib/internal/Magento'];
  tags = await build.createPackageSinceTag(repoUrl, '2.4.0', '', exclude, composerJsonPath, emptyDirsToAdd)
  console.log('magento2-base packages', tags)

  console.log('Packaging Magento Framework');
  exclude = ['lib/internal/Magento/Framework/Amqp/', 'lib/internal/Magento/Framework/Bulk/', 'lib/internal/Magento/Framework/MessageQueue/'];
  tags = await build.createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework', exclude)
  console.log('magento2 framework packages', tags)

  console.log('Packaging Magento Framework_Amqp');
  exclude = [];
  tags = await build.createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework/Amqp', exclude)
  console.log('magento/framework-amqp packages', tags)

  console.log('Packaging Magento Framework_Bulk');
  exclude = [];
  tags = await build.createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework/Bulk', exclude)
  console.log('magento/framework-bulk packages', tags);

  console.log('Packaging Magento Framework_MessageQueue');
  exclude = [];
  tags = await build.createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework/MessageQueue', exclude)
  console.log('magento/framework-message-queue packages', tags)

  console.log('Packaging Magento Admin Theme');
  exclude = [];
  tags = await build.createPackageSinceTag(repoUrl, '2.4.0', 'app/design/adminhtml/Magento/backend', exclude)
  console.log('magento/theme-adminhtml-backend packages', tags)

  console.log('Packaging Magento Blank Theme');
  exclude = [];
  tags = await build.createPackageSinceTag(repoUrl, '2.4.0', 'app/design/frontend/Magento/blank', exclude)
  console.log('magento/theme-frontend-blank packages', tags)

  console.log('Packaging Magento Luma Theme');
  exclude = [];
  tags = await build.createPackageSinceTag(repoUrl, '2.4.0', 'app/design/frontend/Magento/luma', exclude)
  console.log('magento/theme-frontend-luma packages', tags)

  console.log('Packaging Magento Community Edition Metapackage');
  tags = await build.createMagentoCommunityEditionMetapackagesSinceTag(repoUrl, '2.4.0');
  console.log('product-community-edition metapackage packages', tags);

  console.log('Packaging Magento Community Edition Project');
  tags = await build.createProjectPackagesSinceTag(repoUrl, '2.4.0');
  console.log('project-community-edition packages', tags);

  console.log('Packaging Magento Language packages');
  exclude = [];
  tags = await build.createPackagesSinceTag(repoUrl, '2.4.0', 'app/i18n/Magento', exclude)
  console.log('language packages', tags)

  repo.clearCache();

  console.log('Packaging Security Packages');
  exclude = ['.github/', '_metapackage/'];
  tags = await build.createPackagesSinceTag('https://github.com/mage-os/mirror-security-package.git', '1.0.0', '', exclude)
  console.log('security packages packages', tags)

  console.log('Packaging Security Metapackage');
  tags = await build.createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-security-package.git', '1.0.0', '_metapackage')
  console.log('security metapackages packages', tags)

  repo.clearCache();

  console.log('Packaging Inventory Packages');
  exclude = ['.github/', '_metapackage/', 'dev/'];
  tags = await build.createPackagesSinceTag('https://github.com/mage-os/mirror-inventory.git', '1.1.5', '', exclude)
  console.log('inventory packages packages', tags)

  console.log('Packaging Inventory Metapackage');
  tags = await build.createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-inventory.git', '1.1.5', '_metapackage')
  console.log('inventory metapackages packages', tags)

  repo.clearCache();

  console.log('Packaging Inventory Composer Installer Packages');
  exclude = [];
  tags = await build.createPackageSinceTag('https://github.com/mage-os/mirror-inventory-composer-installer.git', '1.1.0', '', exclude)
  console.log('inventory-composer-installer packages', tags)

  repo.clearCache();

  console.log('Packaging PageBuilder Packages');
  exclude = ['app/code/Magento/_metapackage/'];
  tags = await build.createPackagesSinceTag('https://github.com/mage-os/mirror-magento2-page-builder.git', '1.7.0', 'app/code/Magento', exclude)
  console.log('page-builder packages', tags)

  console.log('Packaging PageBuilder Metapackage');
  tags = await build.createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-magento2-page-builder.git', '1.7.0', 'app/code/Magento/_metapackage')
  console.log('page-builder metapackage packages', tags)

  repo.clearCache();

  console.log('Packaging Adobe IMS Packages');
  exclude = ['_metapackage/', '.github/'];
  tags = await build.createPackagesSinceTag('https://github.com/mage-os/mirror-adobe-ims.git', '2.1.0', '', exclude)
  console.log('adobe-ims packages', tags)

  console.log('Packaging Adobe IMS Metapackage');
  tags = await build.createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-adobe-ims.git', '2.1.0', '_metapackage')
  console.log('adobe-ims metapackage packages', tags)

  repo.clearCache();

  console.log('Packaging Stock Integration Packages');
  exclude = ['_metapackage/', '.github/', 'dev/'];
  tags = await build.createPackagesSinceTag('https://github.com/mage-os/mirror-adobe-stock-integration.git', '1.0.0', '', exclude)
  console.log('adobe-stock-integration packages', tags)

  console.log('Packaging Adobe Stock Integration Metapackage');
  tags = await build.createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-adobe-stock-integration.git', '1.0.0', '_metapackage')
  console.log('adobe-stock-integration metapackage packages', tags)

  repo.clearCache();

  console.log('Packaging Magento Composer Root Update Plugin');
  exclude = [];
  tags = await build.createPackageSinceTag('https://github.com/mage-os/mirror-composer-root-update-plugin.git', '1.0.0', 'src/Magento/ComposerRootUpdatePlugin', exclude)
  console.log('composer-root-update-plugin packages', tags)

  repo.clearCache();

  console.log('Packaging Magento Composer Dependency Version Audit Plugin');
  exclude = [];
  tags = await build.createPackageSinceTag('https://github.com/mage-os/mirror-composer-dependency-version-audit-plugin.git', '0.1.2', '', exclude)
  console.log('composer-dependency-version-audit-plugin packages', tags);

  repo.clearCache();

  console.log('Packaging Community Edition Sample Data');
  exclude = [];
  tags = await build.createPackagesSinceTag('https://github.com/mage-os/mirror-magento2-sample-data.git', '2.4.0', 'app/code/Magento', exclude)
  console.log('magento/sample-data module packages', tags)

  console.log('Packaging Community Edition Sample Data Media');
  exclude = [];
  tags = await build.createPackageSinceTag('https://github.com/mage-os/mirror-magento2-sample-data.git', '2.4.0', 'pub/media', exclude)
  console.log('magento/sample-data-media packages', tags)

  await build.copyAdditionalPackages(archiveDir);
  
})()
