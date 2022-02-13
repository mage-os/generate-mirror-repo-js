const repo = require('./repository');
const {setArchiveBaseDir, createPackagesForTag, createPackageForTag} = require('./package-modules');
const {compareTags, httpSlurp} = require('./utils');

/**
 * package(s)                 | from   | modules-folder     | repo url
 * ------------------------------------------------------------------------------------------------------------------
 * magento core packages      | 2.4.0  | 'app/code/Magento' | https://github.com/mage-os/mirror-magento2.git
 * magento base package       |        | ''                 | special folder and exclude config
 * magento framework packages |        | ~ 'lib/internal'   | special folders and exclude config
 * ------------------------------------------------------------------------------------------------------------------
 * magento security packages  | 1.0.0  | ''                 | https://github.com/mage-os/mirror-security-package.git
 * ------------------------------------------------------------------------------------------------------------------
 * magento inventory packages | 1.0.3  | 'app/code/Magento' | https://github.com/mage-os/mirror-inventory.git
 *                            |        |                    | special exclude until 1.1.4
 * magento inventory packages | 1.1.5  | ''                 | https://github.com/mage-os/mirror-inventory.git
 * ------------------------------------------------------------------------------------------------------------------
 * magento/zendframework1     | 1.13.0 | ''                 | https://github.com/mage-os/mirror-zf1.git
 *                            |        |                    | single package, but requires exclude config
 *                            |        |                    | version not in release composer.json files
 * ------------------------------------------------------------------------------------------------------------------
 */


const archiveBaseDir = 'archives';

setArchiveBaseDir(archiveBaseDir);

async function listTagsFrom(url, from) {
  return (await repo.listTags(url)).filter(tag => compareTags(tag, from) >= 0);
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
    await createPackageForTag(url, modulesPath, excludes, tag, composerJsonUrl.replace('{{version}}', tag));
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
})()
