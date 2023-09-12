const fs = require('fs');
const path = require('path');

/**
 * @param {string} vendorDir
 * @returns {object}
 */
function getComposerPackagesConfig(vendorDir) {
  let packageInfo = {};

  if (!fs.existsSync(vendorDir)) {
    throw new Error('Vendor directory not found');
  }

  const composerLockPath = path.join(vendorDir + '/..', 'composer.lock');

  let composerLockData;
  try {
    composerLockData = JSON.parse(fs.readFileSync(composerLockPath));
  } catch (e) {
    throw new Error(`Failed to read or parse composer.lock file: ${e.message}\ncomposer.lock path: ${composerLockPath} \nvendor: ${vendorDir}`
    );
  }

  fs.readdirSync(vendorDir, {withFileTypes: true}).forEach(dirEntry => {
    if (!dirEntry.isDirectory()) {
      return;
    }

    const vendorNamespaceDir = path.join(vendorDir, dirEntry.name);
    fs.readdirSync(vendorNamespaceDir, {withFileTypes: true}).forEach(subDirEntry => {
      if (!subDirEntry.isDirectory()) {
        return;
      }

      const composerJsonPath = path.join(vendorNamespaceDir, subDirEntry.name, 'composer.json');
      if (!fs.existsSync(composerJsonPath)) {
        return;
      }

      try {
        const composerJsonData = JSON.parse(fs.readFileSync(composerJsonPath));
        const packageName = composerJsonData.name;
        let lockFilePackageConfig = composerLockData.packages.find(
          composerPackage => composerPackage.name === packageName
        );

        if (lockFilePackageConfig === undefined) {
          lockFilePackageConfig = composerLockData['packages-dev'].find(
            composerPackage => composerPackage.name === packageName
          );
        }

        if (lockFilePackageConfig === undefined) {
          throw new Error(`Package ${packageName} not found in composer.lock`);
        }

        const packageVersion = lockFilePackageConfig.version;

        if (packageName && packageVersion) {
          const key = `${packageName}@${packageVersion}`;
          packageInfo[key] = {
            'path': path.relative(__dirname, path.dirname(composerJsonPath)),
            'version': packageVersion,
            'name': packageName,
            'require': composerJsonData.require,
            'require-dev': composerJsonData['require-dev'],
            'suggest': composerJsonData['suggest'],
            'replace': composerJsonData['replace'],
            'conflict': composerJsonData['conflict']
          };
        }
      } catch (e) {
        throw new Error(`Failed to read or parse ${composerJsonPath}: ${e.message}`);
      }
    });
  });

  return packageInfo;
}

/**
 * @param {object} obj1
 * @param {object} obj2
 * @returns {object}
 */
function comparePackages(obj1, obj2) {
  const comparisonResults = {};

  const packageNames1 = Object.keys(obj1);
  const packageNames2 = Object.keys(obj2);

  const commonPackageNames = packageNames1.filter(name => packageNames2.includes(name));

  commonPackageNames.forEach(packageName => {
    const package1 = obj1[packageName];
    const package2 = obj2[packageName];

    const sections = ['require', 'require-dev', 'suggest', 'replace'];

    const allKeys = new Set(sections.flatMap(section => [
      ...Object.keys(package1[section] || {}),
      ...Object.keys(package2[section] || {})
    ]));

    const differences = [];

    allKeys.forEach(key => {
      sections.forEach(section => {
        const value1 = package1[section] ? package1[section][key] : undefined;
        const value2 = package2[section] ? package2[section][key] : undefined;

        if (value1 !== value2) {
          differences.push({section, key, value1, value2});
        }
      });
    });

    if (differences.length > 0) {
      comparisonResults[packageName] = differences;
    }
  });

  return comparisonResults;
}


/**
 * @param {object} diffs
 * @param {string} originName
 * @param {string} targetName
 */
function displayDiffs(diffs, originName, targetName) {
  Object.keys(diffs).forEach(packageName => {
    console.log('\x1b[1m' + packageName + '\x1b[0m');

    diffs[packageName].forEach(diff => {
      const section = '\x1b[36m' + diff.section + '\x1b[0m';
      const key = '\x1b[32m' + diff.key + '\x1b[0m';
      const value1 = diff.value1 ? '\x1b[31m' + diff.value1 + '\x1b[0m' : '\x1b[90m' + 'undefined' + '\x1b[0m';
      const value2 = diff.value2 ? '\x1b[34m' + diff.value2 + '\x1b[0m' : '\x1b[90m' + 'undefined' + '\x1b[0m';

      console.log(`  ${section}:
    package: ${key}
        ${originName}: ${value1}
        ${targetName}: ${value2}`);
    });
    console.log('\n');
  });
}

try {
  const mageOsVendorDir = process.argv[2];
  const magentoVendorDir = process.argv[3];

  if (!mageOsVendorDir || !magentoVendorDir) {
    throw new Error('Usage: node validate-package-versions-match.js <mage-os-vendor-dir> <magento-vendor-dir>');
  }

  let mageOsPackagesConfig = getComposerPackagesConfig(mageOsVendorDir);
  let magentoPackagesConfig = getComposerPackagesConfig(magentoVendorDir);

  let compareResult = comparePackages(mageOsPackagesConfig, magentoPackagesConfig);

  if (Object.keys(compareResult).length !== 0) {
    displayDiffs(compareResult, 'mage-os', 'magento');
    process.exit(1);
  }

  console.log('\x1b[32m' + 'Done. No differences found.' + '\x1b[0m');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
