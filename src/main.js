const repo = require('./repository');
const {compareTags} = require('./utils');
const {
  setArchiveBaseDir,
  createPackagesForTag,
  createPackageForTag,
  createMagentoCommunityEditionMetapackage,
  createMagentoCommunityEditionProject,
  createMetaPackageFromRepoDir
} = require('./package-modules');

setArchiveBaseDir(process.argv[2] || 'packages');
if (process.argv[3]) {
  repo.setStorageDir(process.argv[3]);
}

async function listTagsFrom(url, from) {
  return (await repo.listTags(url)).filter(tag => compareTags(tag, from) >= 0);
}

async function createMetaPackagesSinceTag(url, from) {
  const tags = await listTagsFrom(url, from);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    await createMagentoCommunityEditionMetapackage(url, tag);
  }
  return tags;
}

async function createProjectPackagesSinceTag(url, from) {
  const tags = await listTagsFrom(url, from);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    await createMagentoCommunityEditionProject(url, tag);
  }
  return tags;
}

async function createMetaPackagesFromRepoDir(url, from, path) {
  const tags = await listTagsFrom(url, from);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    await createMetaPackageFromRepoDir(url, path, tag);
  }
  return tags;
}

async function createPackagesSinceTag(url, from, modulesPath, excludes) {
  const tags = await listTagsFrom(url, from);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    try {
      await createPackagesForTag(url, modulesPath, excludes, tag);
      built.push(tag)
    } catch (exception) {
      console.log(exception.message);
    }
  }
  return built;
}

async function createPackageSinceTag(url, from, modulesPath, excludes, composerJsonUrl) {
  const tags = await listTagsFrom(url, from);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    try {
      await createPackageForTag(url, modulesPath, excludes, tag, (composerJsonUrl || '').replace('{{version}}', tag));
      built.push(tag);
    } catch (exception) {
      console.log(exception.message);
    }
  }
  return built;
}

(async function () {
  let tags, exclude, composerJsonUrl;

  let repoUrl = 'https://github.com/mage-os/mirror-magento2.git';
  
  console.log('Packaging Magento Core Modules');
  exclude = [];
  tags = await createPackagesSinceTag(repoUrl, '2.4.0', 'app/code/Magento', exclude)
  console.log('core module packages built', tags)

  console.log('Packaging Magento Base Package');
  exclude = [".github/", "app/code/", "app/design/frontend/", "app/design/adminhtml/", "app/i18n/", "lib/internal/Magento/Framework/", "composer.lock"];
  composerJsonUrl = 'https://raw.githubusercontent.com/mage-os/magento2-base-composer-json/main/{{version}}/magento2-base/composer.json';
  tags = await createPackageSinceTag(repoUrl, '2.4.0', '', exclude, composerJsonUrl)
  console.log('magento2-base packages built', tags)

  console.log('Packaging Magento Framework');
  exclude = ['lib/internal/Magento/Framework/Amqp/', 'lib/internal/Magento/Framework/Bulk/', 'lib/internal/Magento/Framework/MessageQueue/'];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework', exclude)
  console.log('magento2 framework packages built', tags)

  console.log('Packaging Magento Framework_Amqp');
  exclude = [];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework/Amqp', exclude)
  console.log('magento/framework-amqp packages built', tags)

  console.log('Packaging Magento Framework_Bulk');
  exclude = [];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework/Bulk', exclude)
  console.log('magento/framework-bulk packages built', tags);

  console.log('Packaging Magento Framework_MessageQueue');
  exclude = [];
  tags = await createPackageSinceTag(repoUrl, '2.4.0', 'lib/internal/Magento/Framework/MessageQueue', exclude)
  console.log('magento/framework-message-queue packages built', tags)

  console.log('Packaging Magento Community Edition Metapackage');
  tags = await createMetaPackagesSinceTag(repoUrl, '2.4.0');
  console.log('product-community-edition metapackage packages built', tags);

  console.log('Packaging Magento Community Edition Project');
  tags = await createProjectPackagesSinceTag(repoUrl, '2.4.0');
  console.log('project-community-edition packages built', tags);

  console.log('Packaging Magento Language packages');
  exclude = [];
  tags = await createPackagesSinceTag(repoUrl, '2.4.0', 'app/i18n/Magento', exclude)
  console.log('language packages built', tags)
  
  repo.clearCache();

  console.log('Packaging Security Packages');
  exclude = ['.github/', '_metapackage/'];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-security-package.git', '1.0.0', '', exclude)
  console.log('security packages packages built', tags)

  console.log('Packaging Security Metapackage');
  tags = await createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-security-package.git', '1.0.0', '_metapackage')
  console.log('security metapackages packages built', tags)

  repo.clearCache();

  console.log('Packaging Inventory Packages');
  exclude = ['.github/', '_metapackage/', 'dev/'];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-inventory.git', '1.1.5', '', exclude)
  console.log('inventory packages packages built', tags)
  
  console.log('Packaging Inventory Metapackage');
  tags = await createMetaPackagesFromRepoDir('https://github.com/mage-os/mirror-inventory.git', '1.1.5', '_metapackage')
  console.log('inventory metapackages packages built', tags)

  repo.clearCache();

  console.log('Packaging Magento Composer Root Update Plugin');
  exclude = [];
  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-composer-root-update-plugin.git', '1.0.0', 'src/Magento/ComposerRootUpdatePlugin', exclude)
  console.log('composer-root-update-plugin packages built', tags)

  repo.clearCache();

  console.log('Packaging Magento Composer Dependency Version Audit Plugin');
  exclude = [];
  tags = await createPackageSinceTag('https://github.com/mage-os/composer-dependency-version-audit-plugin.git', '0.1.0', '', exclude)
  console.log('composer-dependency-version-audit-plugin packages built', tags);

  repo.clearCache();
  
  console.log('Packaging Community Edition Sample Data');
  exclude = [];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-magento2-sample-data.git', '2.4.0', 'app/code/Magento', exclude)
  console.log('magento2-sample-data packages built', tags)
  
})()
