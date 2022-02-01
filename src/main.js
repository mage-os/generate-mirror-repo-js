const repo = require('./repository');
const {setArchiveBaseDir, createPackagesForTag, createPackageForTag} = require('./package-modules');
const {compareTags} = require('./utils');

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

async function createPackageSinceTag(url, from, modulesPath, excludes) {
  const tags = await listTagsFrom(url, from);
  for (const tag of tags) {
    await createPackageForTag(url, modulesPath, excludes, tag);
  }
  return tags;
}

(async function () {
  let tags;
  
  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', 'app/code/Magento')
  console.log('app/code/Magento modules', tags)

  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', '', [".github/", "app/code/", "app/design/frontend/", "app/design/adminhtml/", "app/i18n/", "lib/internal/Magento/Framework/", "composer.lock",])
  console.log('magento/magento2ce', tags);

  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', 'lib/internal/Magento/Framework', ['lib/internal/Magento/Framework/Amqp/', 'lib/internal/Magento/Framework/Bulk/', 'lib/internal/Magento/Framework/MessageQueue/'])
  console.log('magento/framework', tags)

  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', 'lib/internal/Magento/Framework/Amqp', [])
  console.log('magento/framework-amqp', tags)

  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', 'lib/internal/Magento/Framework/Bulk', [])
  console.log('magento/framework-bulk', tags);

  tags = await createPackageSinceTag('https://github.com/mage-os/mirror-magento2.git', '2.4.0', 'lib/internal/Magento/Framework/MessageQueue', [])
  console.log('magento/framework-message-queue', tags)

  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-security-package.git', '1.0.0', '', ['.github/', '_metapackage/'])
  console.log('security packages', tags)

  tags = await createPackagesSinceTag('https://github.com/mage-os/mirror-inventory.git', '1.1.5', '', ['.github/', '_metapackage/', 'dev/'])
  console.log('inventory packages', tags)
})()