const repo = require('./repository');
const {setArchiveBaseDir, createPackagesForTag} = require('./package-modules');
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
 * magento inventory packages | 1.0.3  | ''                 | https://github.com/mage-os/mirror-inventory.git
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

async function createPackagesFromTag(url, from, modulesPath) {
  const tags = await listTagsFrom(url, from); 
  for (const tag of tags) {
    await createPackagesForTag(url, modulesPath, tag);
  }
  return tags;
}

createPackagesFromTag('https://github.com/mage-os/mirror-magento2.git', '2.4.3', 'app/code/Magento').then(console.log)
