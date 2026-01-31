/**
 * Magento/* alias metapackage generation for Mage-OS packages.
 *
 * Creates magento/* alias metapackages that require the corresponding mage-os/* packages,
 * allowing third-party extensions requiring magento/* packages to resolve against the
 * Mage-OS repository.
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const {compareVersions} = require('./utils');

const stableMtime = '2022-02-22 22:02:22.000Z';

function report() {
  console.log(...arguments);
}

/**
 * Read composer.json from a zip file.
 *
 * @param {string} zipFilePath - Path to the zip file
 * @returns {Promise<Object>} - Parsed composer.json content
 */
async function readComposerJsonFromZip(zipFilePath) {
  const zipData = fs.readFileSync(zipFilePath);
  const zip = await JSZip.loadAsync(zipData);
  const composerJsonFile = zip.file('composer.json');
  if (!composerJsonFile) {
    throw new Error(`No composer.json found in ${zipFilePath}`);
  }
  const composerJsonContent = await composerJsonFile.async('string');
  return JSON.parse(composerJsonContent);
}

/**
 * Create a magento/* alias metapackage that requires the corresponding mage-os/* package.
 *
 * @param {string} magentoPackageName - The magento/* package name (e.g., 'magento/module-catalog')
 * @param {string} magentoVersion - The magento version for the alias package
 * @param {string} mageOsPackageName - The mage-os/* package name (e.g., 'mage-os/module-catalog')
 * @param {string} mageOsVersion - The mage-os package version to require
 * @param {Object} packageModules - The package-modules module (for archiveFilePath and writePackage)
 * @returns {Promise<Object.<string, string>>} - Map of {aliasPackageName: version}
 */
async function createMagentoAliasPackage(magentoPackageName, magentoVersion, mageOsPackageName, mageOsVersion, packageModules) {
  // Only create aliases for magento/* packages
  if (!magentoPackageName.startsWith('magento/')) {
    return {};
  }

  const composerConfig = {
    name: magentoPackageName,
    description: `Alias metapackage for ${mageOsPackageName}. Allows extensions requiring ${magentoPackageName} to use the Mage-OS equivalent.`,
    type: 'metapackage',
    version: magentoVersion,
    require: {
      [mageOsPackageName]: mageOsVersion
    },
    // Add extra metadata to identify this as an alias package
    extra: {
      'mage-os-alias': {
        'original-package': mageOsPackageName,
        'original-version': mageOsVersion
      }
    }
  };

  const files = [{
    filepath: 'composer.json',
    mtime: new Date(stableMtime),
    contentBuffer: Buffer.from(JSON.stringify(composerConfig, null, 2), 'utf8'),
    isExecutable: false
  }];

  const packageFilepath = packageModules.archiveFilePath(magentoPackageName, magentoVersion);

  // Don't overwrite if package already exists (e.g., from mirror builds)
  if (!fs.existsSync(packageFilepath)) {
    await packageModules.writePackage(packageFilepath, files);
    return {[magentoPackageName]: magentoVersion};
  }

  return {};
}

/**
 * Generate magento/* alias metapackages by scanning all built mage-os/* packages.
 * Reads each package's composer.json to extract the replace entries and creates
 * corresponding alias packages. When multiple mage-os versions replace the same
 * magento version, the highest mage-os version wins.
 *
 * @param {string} archiveDir - The package output directory
 * @param {Object} packageModules - The package-modules module (for archiveFilePath and writePackage)
 * @returns {Promise<Object.<string, string>>} - Map of created aliases {name: version}
 */
async function generateAliasesFromBuiltPackages(archiveDir, packageModules) {
  const mageosDir = path.join(archiveDir, 'mage-os');

  if (!fs.existsSync(mageosDir)) {
    console.log(`No mage-os packages directory found at ${mageosDir}`);
    return {};
  }

  const zipFiles = fs.readdirSync(mageosDir)
    .filter(file => file.endsWith('.zip'))
    .map(file => path.join(mageosDir, file));

  console.log(`Scanning ${zipFiles.length} mage-os packages for alias generation...`);

  // Collect all alias candidates: key is "magentoName:magentoVersion"
  // value is {magentoName, magentoVersion, mageOsName, mageOsVersion}
  const aliasCandidates = {};

  for (const zipPath of zipFiles) {
    try {
      const composer = await readComposerJsonFromZip(zipPath);

      if (!composer.replace || typeof composer.replace !== 'object') {
        continue;
      }

      const mageOsName = composer.name;
      const mageOsVersion = composer.version;

      for (const [magentoName, magentoVersion] of Object.entries(composer.replace)) {
        // Only process magento/* packages
        if (!magentoName.startsWith('magento/')) {
          continue;
        }

        const key = `${magentoName}:${magentoVersion}`;
        const existing = aliasCandidates[key];

        // Keep the highest mage-os version for each magento alias
        if (!existing || compareVersions(mageOsVersion, existing.mageOsVersion) > 0) {
          aliasCandidates[key] = {
            magentoName,
            magentoVersion,
            mageOsName,
            mageOsVersion
          };
        }
      }
    } catch (error) {
      report(`  Warning: Failed to read ${zipPath}: ${error.message || error}`);
    }
  }

  // Create alias packages for each winning candidate
  const aliasPackages = {};

  for (const candidate of Object.values(aliasCandidates)) {
    const {magentoName, magentoVersion, mageOsName, mageOsVersion} = candidate;

    try {
      const created = await createMagentoAliasPackage(
        magentoName,
        magentoVersion,
        mageOsName,
        mageOsVersion,
        packageModules
      );
      Object.assign(aliasPackages, created);

      if (Object.keys(created).length > 0) {
        report(`  Created alias: ${magentoName}:${magentoVersion} -> ${mageOsName}:${mageOsVersion}`);
      }
    } catch (error) {
      report(`  Warning: Failed to create alias for ${magentoName}: ${error.message || error}`);
    }
  }

  console.log(`Created ${Object.keys(aliasPackages).length} magento/* alias packages.`);
  return aliasPackages;
}

module.exports = {
  createMagentoAliasPackage,
  generateAliasesFromBuiltPackages,
  readComposerJsonFromZip
};
