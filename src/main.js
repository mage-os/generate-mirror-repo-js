const repo = require('./repository');
const {compareTags} = require('./utils');
const {
  setArchiveBaseDir,
  createPackagesForTag,
  createPackageForTag,
  createMagentoCommunityEditionMetapackage,
  createMagentoCommunityEditionProject
} = require('./package-modules');

const archiveBaseDir = 'archives';

setArchiveBaseDir(archiveBaseDir);

async function listTagsFrom(url, from) {
  return (await repo.listTags(url)).filter(tag => compareTags(tag, from) >= 0);
}

async function createMetaPackagesSinceTag(url, from) {
  const tags = await listTagsFrom(url, from);
  for (const tag of tags) {
    await createMagentoCommunityEditionMetapackage(url, tag);
  }
  return tags;
}

async function createProjectPackagesSinceTag(url, from) {
  const tags = await listTagsFrom(url, from);
  for (const tag of tags) {
    await createMagentoCommunityEditionProject(url, tag);
  }
  return tags;
}

async function createPackagesSinceTag(url, from, modulesPath, excludes) {
  const tags = await listTagsFrom(url, from);
  for (const tag of tags) {
    await createPackagesForTag(url, modulesPath, excludes, tag);
  }
  return tags;
}

async function createPackageSinceTag(url, from, modulesPath, excludes, composerJsonUrl) {
  const tags = await listTagsFrom(url, from);
  for (const tag of tags) {
    await createPackageForTag(url, modulesPath, excludes, tag, (composerJsonUrl || '').replace('{{version}}', tag));
  }
  return tags;
}

(async function () {
  let tags, exclude, composerJsonUrl;

  exclude = [];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', 'app/code/Magento', exclude)
  console.log('app/code/Magento modules', tags)

  exclude = [".github/", "app/code/", "app/design/frontend/", "app/design/adminhtml/", "app/i18n/", "lib/internal/Magento/Framework/", "composer.lock"];
  composerJsonUrl = 'https://raw.githubusercontent.com/mage-os/magento2-base-composer-json/main/{{version}}/magento2-base/composer.json';
  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', '', exclude, composerJsonUrl)
  console.log('magento/magento2-base', tags)

  exclude = ['lib/internal/Magento/Framework/Amqp/', 'lib/internal/Magento/Framework/Bulk/', 'lib/internal/Magento/Framework/MessageQueue/'];
  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', 'lib/internal/Magento/Framework', exclude)
  console.log('magento/framework', tags)

  exclude = [];
  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', 'lib/internal/Magento/Framework/Amqp', exclude)
  console.log('magento/framework-amqp', tags)

  exclude = [];
  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', 'lib/internal/Magento/Framework/Bulk', exclude)
  console.log('magento/framework-bulk', tags);

  exclude = [];
  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', 'lib/internal/Magento/Framework/MessageQueue', exclude)
  console.log('magento/framework-message-queue', tags)

  exclude = ['.github/', '_metapackage/'];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-security-package.git', '1.0.0', '', exclude)
  console.log('security packages', tags)

  exclude = ['.github/', '_metapackage/', 'dev/'];
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-inventory.git', '1.1.5', '', exclude)
  console.log('inventory packages', tags)

  exclude = [];
  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-composer-root-update-plugin.git', '1.0.0', 'src/Magento/ComposerRootUpdatePlugin', exclude)
  console.log('mirror-composer-root-update-plugin', tags)

  exclude = [];
  tags = await createPackageSinceTag('https://github.com/mage-os/composer-dependency-version-audit-plugin.git', '0.1.0', '', exclude)
  console.log('composer-dependency-version-audit-plugin', tags)

  // create metapackage
  tags = await createMetaPackagesSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0');
  console.log('product-community-edition metapackage', tags);

  // create project package
  tags = await createProjectPackagesSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0');
  console.log('project-community-edition', tags);

})()
