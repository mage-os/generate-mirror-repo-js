const fs = require('fs');
const chalk = require('chalk');
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
        throw new Error(`Failed to read or parse composer.lock file: ${e.message}`);
    }

    fs.readdirSync(vendorDir, { withFileTypes: true }).forEach(dirEntry => {
        if (!dirEntry.isDirectory()) {
            return;
        }

        const packageDir = path.join(vendorDir, dirEntry.name);
        fs.readdirSync(packageDir, { withFileTypes: true }).forEach(subDirEntry => {
            if (!subDirEntry.isDirectory()) {
                return;
            }

            const composerJsonPath = path.join(packageDir, subDirEntry.name, 'composer.json');
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

        const requireKeys1 = Object.keys(package1.require || {});
        const requireKeys2 = Object.keys(package2.require || {});

        const requireDevKeys1 = Object.keys(package1['require-dev'] || {});
        const requireDevKeys2 = Object.keys(package2['require-dev'] || {});

        const allKeys = new Set([...requireKeys1, ...requireKeys2, ...requireDevKeys1, ...requireDevKeys2]);

        const differences = [];

        allKeys.forEach(key => {
            const req1 = package1.require ? package1.require[key] : undefined;
            const req2 = package2.require ? package2.require[key] : undefined;
            const reqDev1 = package1['require-dev'] ? package1['require-dev'][key] : undefined;
            const reqDev2 = package2['require-dev'] ? package2['require-dev'][key] : undefined;

            if (req1 !== req2) {
                differences.push({ section: 'require', key, value1: req1, value2: req2 });
            }
            if (reqDev1 !== reqDev2) {
                differences.push({ section: 'require-dev', key, value1: reqDev1, value2: reqDev2 });
            }
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
        console.log(chalk.bold(packageName));

        diffs[packageName].forEach(diff => {
            const section = chalk.cyan(diff.section);
            const key = chalk.green(diff.key);
            const value1 = diff.value1 ? chalk.red(diff.value1) : chalk.gray('undefined');
            const value2 = diff.value2 ? chalk.blue(diff.value2) : chalk.gray('undefined');

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

    console.log(chalk.green('Done. No differences found.'));
} catch (error) {
    console.error(error.message);
}
