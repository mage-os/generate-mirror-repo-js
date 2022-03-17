const repo = require('./repository');
const fs = require('fs');
const {isVersionGreaterOrEqual} = require('./utils');
const {
  setArchiveBaseDir,
  setMageosPackageRepoUrl,
  createPackagesForTag,
  createPackageForTag,
  createMagentoCommunityEditionMetapackage,
  createMagentoCommunityEditionProject,
  createMetaPackageFromRepoDir
} = require('./package-modules');

const archiveDir = process.argv[2] || 'packages';
setArchiveBaseDir(archiveDir);
if (process.argv[3]) {
  repo.setStorageDir(process.argv[3]);
}

if (process.argv[4]) {
  setMageosPackageRepoUrl(process.argv[4]);
}

async function listTagsFrom(url, from) {
  return (await repo.listTags(url)).filter(tag => isVersionGreaterOrEqual(tag, from));
}

async function copyAdditionalPackages() {
  const dir = `${__dirname}/../resource/additional-packages`;
  const dest = `${archiveDir}/additional`
  
  if (fs.existsSync(dir)) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, {recursive: true});
    
    fs.readdir(dir, (err, files) => {
      if (err) {
        console.log('' + err);
        return;
      }
      const archives = (files || [])
        .filter(file => file.substr(-4) === '.zip')
        .filter(file => ! fs.existsSync(`${dest}/${file}`));
      console.log(`Copying ${archives.length} additional archive(s) into build directory.`);
      archives.map(file => {
        fs.copyFile(`${dir}/${file}`, `${dest}/${file}`, err => err && console.log(err))
      })
    })
  }
}

async function createMagentoCommunityEditionMetapackagesSinceTag(url, from) {
  const tags = await listTagsFrom(url, from);
  console.log(`Versions to process: ${tags.join(', ')}`);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    await createMagentoCommunityEditionMetapackage(url, tag);
  }
  return tags;
}

async function createProjectPackagesSinceTag(url, from) {
  const tags = await listTagsFrom(url, from);
  console.log(`Versions to process: ${tags.join(', ')}`);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    await createMagentoCommunityEditionProject(url, tag);
  }
  return tags;
}

async function createMetaPackagesFromRepoDir(url, from, path) {
  const tags = await listTagsFrom(url, from);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    try {
      await createMetaPackageFromRepoDir(url, path, tag);
      built.push(tag);
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

async function createPackagesSinceTag(url, from, modulesPath, excludes) {
  const tags = await listTagsFrom(url, from);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    try {
      await createPackagesForTag(url, modulesPath, excludes, tag);
      built.push(tag)
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

async function createPackageSinceTag(url, from, modulesPath, excludes, composerJsonPath, emptyDirsToAdd) {
  const tags = await listTagsFrom(url, from);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    let composerJsonFile = '';
    if (composerJsonPath && composerJsonPath.length) {
      composerJsonFile = (composerJsonPath || '').replace('{{version}}', tag);
      composerJsonFile = fs.existsSync(composerJsonFile)
        ? composerJsonFile
        : (composerJsonPath || '').replace('{{version}}', 'template')
    }
    try {
      await createPackageForTag(url, modulesPath, excludes, tag, composerJsonFile, emptyDirsToAdd);
      built.push(tag);
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

(async function () {
  
  let tags, exclude, composerJsonPath, emptyDirsToAdd;

  let repoUrl = 'https://github.com/mage-os/mirror-magento2.git';

  console.log('Packaging Magento Core Modules');
  exclude = [];
  tags = await createPackagesSinceTag(repoUrl, '2.4.0', 'app/code/Magento', exclude)
  console.log('core module packages', tags)

  console.log('Packaging Magento Base Package');
  exclude = [".github/", "app/code/", "app/design/frontend/", "app/design/adminhtml/", "app/i18n/", "lib/internal/Magento/Framework/", "composer.lock", "app/etc/vendor_path.php"];
  composerJsonPath = `${__dirname}/../resource/history/magento/magento2-base/{{version}}.json`;
  // The directories are required for the magento-composer-installer to properly function, otherwise it doesn't complete processing and app/etc is missing.
  emptyDirsToAdd = ['app/design/frontend/Magento', 'app/design/adminhtml/Magento', 'app/code/Magento', 'app/i18n/Magento', 'lib/internal/Magento'];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', '', exclude, composerJsonPath, emptyDirsToAdd)
  console.log('magento2-base packages', tags)

  console.log('Packaging Magento Framework');
  exclude = ['lib/internal/Magento/Framework/Amqp/', 'lib/internal/Magento/Framework/Bulk/', 'lib/internal/Magento/Framework/MessageQueue/'];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework', exclude)
  console.log('magento2 framework packages', tags)

  console.log('Packaging Magento Framework_Amqp');
  exclude = [];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework/Amqp', exclude)
  console.log('magento/framework-amqp packages', tags)

  console.log('Packaging Magento Framework_Bulk');
  exclude = [];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework/Bulk', exclude)
  console.log('magento/framework-bulk packages', tags);

  console.log('Packaging Magento Framework_MessageQueue');
  exclude = [];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework/MessageQueue', exclude)
  console.log('magento/framework-message-queue packages', tags)

  console.log('Packaging Magento Admin Theme');
  exclude = [];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', 'app/design/adminhtml/Magento/backend', exclude)
  console.log('magento/theme-adminhtml-backend packages', tags)

  console.log('Packaging Magento Blank Theme');
  exclude = [];
  exclude = [];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', 'app/design/frontend/Magento/blank', exclude)
  console.log('magento/theme-frontend-blank packages', tags)

  console.log('Packaging Magento Luma Theme');
  exclude = [];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', 'app/design/frontend/Magento/luma', exclude)
  console.log('magento/theme-frontend-luma packages', tags)

  console.log('Packaging Magento Community Edition Metapackage');
  tags = await createMagentoCommunityEditionMetapackagesSinceTag(repoUrl, '2.4.0');
  console.log('product-community-edition metapackage packages', tags);

  console.log('Packaging Magento Community Edition Project');
  tags = await createProjectPackagesSinceTag(repoUrl, '2.4.0');
  console.log('project-community-edition packages', tags);

  console.log('Packaging Magento Language packages');
  exclude = [];
  tags = await createPackagesSinceTag(repoUrl, '2.4.0', 'app/i18n/Magento', exclude)
  console.log('language packages', tags)

  repo.clearCache();

  console.log('Packaging Security Packages');
  exclude = ['.github/', '_metapackage/'];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-security-package.git', '1.0.0', '', exclude)
  console.log('security packages packages', tags)

  console.log('Packaging Security Metapackage');
  tags = await createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-security-package.git', '1.0.0', '_metapackage')
  console.log('security metapackages packages', tags)

  repo.clearCache();

  console.log('Packaging Inventory Packages');
  exclude = ['.github/', '_metapackage/', 'dev/'];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-inventory.git', '1.1.5', '', exclude)
  console.log('inventory packages packages', tags)

  console.log('Packaging Inventory Metapackage');
  tags = await createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-inventory.git', '1.1.5', '_metapackage')
  console.log('inventory metapackages packages', tags)

  repo.clearCache();

  console.log('Packaging Inventory Composer Installer Packages');
  exclude = [];
  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-inventory-composer-installer.git', '1.1.0', '', exclude)
  console.log('inventory-composer-installer packages', tags)

  repo.clearCache();

  console.log('Packaging PageBuilder Packages');
  exclude = ['app/code/Magento/_metapackage/'];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-magento2-page-builder.git', '1.7.0', 'app/code/Magento', exclude)
  console.log('page-builder packages', tags)

  console.log('Packaging PageBuilder Metapackage');
  tags = await createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-magento2-page-builder.git', '1.7.0', 'app/code/Magento/_metapackage')
  console.log('page-builder metapackage packages', tags)

  repo.clearCache();

  console.log('Packaging Adobe IMS Packages');
  exclude = ['_metapackage/', '.github/'];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-adobe-ims.git', '2.1.0', '', exclude)
  console.log('adobe-ims packages', tags)

  console.log('Packaging Adobe IMS Metapackage');
  tags = await createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-adobe-ims.git', '2.1.0', '_metapackage')
  console.log('adobe-ims metapackage packages', tags)

  repo.clearCache();

  console.log('Packaging Stock Integration Packages');
  exclude = ['_metapackage/', '.github/', 'dev/'];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-adobe-stock-integration.git', '1.0.0', '', exclude)
  console.log('adobe-stock-integration packages', tags)

  console.log('Packaging Adobe Stock Integration Metapackage');
  tags = await createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-adobe-stock-integration.git', '1.0.0', '_metapackage')
  console.log('adobe-stock-integration metapackage packages', tags)

  repo.clearCache();

  console.log('Packaging Magento Composer Root Update Plugin');
  exclude = [];
  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-composer-root-update-plugin.git', '1.0.0', 'src/Magento/ComposerRootUpdatePlugin', exclude)
  console.log('composer-root-update-plugin packages', tags)

  repo.clearCache();

  console.log('Packaging Magento Composer Dependency Version Audit Plugin');
  exclude = [];
  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-composer-dependency-version-audit-plugin.git', '0.1.2', '', exclude)
  console.log('composer-dependency-version-audit-plugin packages', tags);

  repo.clearCache();

  console.log('Packaging Community Edition Sample Data');
  exclude = [];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-magento2-sample-data.git', '2.4.0', 'app/code/Magento', exclude)
  console.log('magento/sample-data module packages', tags)

  console.log('Packaging Community Edition Sample Data Media');
  exclude = [];
  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-magento2-sample-data.git', '2.4.0', 'pub/media', exclude)
  console.log('magento/sample-data-media packages', tags)

  await copyAdditionalPackages();
  
})()
