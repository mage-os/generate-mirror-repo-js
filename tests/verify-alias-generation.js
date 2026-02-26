#!/usr/bin/env node
/**
 * Simple verification script for alias package generation
 * Run with: node tests/verify-alias-generation.js
 *
 * TODO: Refactor to Jest tests when feature/test-suite branch is merged
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const packageModules = require('../src/package-modules');
const {setArchiveBaseDir, archiveFilePath} = packageModules;
const {
  createMagentoAliasPackage,
  generateAliasesFromBuiltPackages
} = require('../src/package-aliases');

const testDir = '/tmp/mage-os-alias-test';

/**
 * Helper to create a mock mage-os package zip with a composer.json
 */
async function createMockMageOsPackage(packageName, version, replaceEntries) {
  const composerConfig = {
    name: packageName,
    version: version,
    type: 'magento2-module',
    require: {}
  };

  if (replaceEntries) {
    composerConfig.replace = replaceEntries;
  }

  const zip = new JSZip();
  zip.file('composer.json', JSON.stringify(composerConfig, null, 2));

  const zipPath = archiveFilePath(packageName, version);
  const zipDir = path.dirname(zipPath);
  if (!fs.existsSync(zipDir)) {
    fs.mkdirSync(zipDir, { recursive: true });
  }

  const content = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(zipPath, content);

  return zipPath;
}

async function runTests() {
  console.log('=== Alias Package Generation Verification ===\n');

  // Setup test directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
  setArchiveBaseDir(testDir);

  let passed = 0;
  let failed = 0;

  // Test 1: Skip non-magento packages
  console.log('Test 1: Skip non-magento packages');
  try {
    const result = await createMagentoAliasPackage('laminas/laminas-code', '4.0.0', 'mage-os/module-catalog', '2.1.0', packageModules);
    if (Object.keys(result).length === 0) {
      console.log('  ✓ Passed: non-magento package skipped\n');
      passed++;
    } else {
      console.log('  ✗ Failed: should have skipped non-magento package\n');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ Failed with error:', e.message, '\n');
    failed++;
  }

  // Test 2: Create alias for magento package
  console.log('Test 2: Create alias for magento package');
  try {
    const result = await createMagentoAliasPackage('magento/module-catalog', '103.0.7', 'mage-os/module-catalog', '2.1.0', packageModules);
    if (result['magento/module-catalog'] === '103.0.7') {
      console.log('  ✓ Passed: alias created with correct version');

      // Wait a bit for stream to flush (same pattern as rest of codebase)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify file was created
      const filePath = archiveFilePath('magento/module-catalog', '103.0.7');
      if (fs.existsSync(filePath)) {
        console.log('  ✓ Passed: package file created at', filePath);

        // Read and verify composer.json content
        const zipData = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(zipData);
        const composerJson = JSON.parse(await zip.file('composer.json').async('string'));

        if (composerJson.name === 'magento/module-catalog' &&
            composerJson.type === 'metapackage' &&
            composerJson.version === '103.0.7' &&
            composerJson.require['mage-os/module-catalog'] === '2.1.0') {
          console.log('  ✓ Passed: composer.json content is correct');
          console.log('    - name:', composerJson.name);
          console.log('    - type:', composerJson.type);
          console.log('    - version:', composerJson.version);
          console.log('    - requires:', JSON.stringify(composerJson.require));
          passed += 3;
        } else {
          console.log('  ✗ Failed: composer.json content incorrect');
          console.log('    Content:', JSON.stringify(composerJson, null, 2));
          failed++;
        }
      } else {
        console.log('  ✗ Failed: package file not created');
        failed++;
      }
    } else {
      console.log('  ✗ Failed: incorrect result', result);
      failed++;
    }
  } catch (e) {
    console.log('  ✗ Failed with error:', e.message);
    console.log('    Stack:', e.stack);
    failed++;
  }
  console.log();

  // Test 3: Don't overwrite existing package
  console.log('Test 3: Don\'t overwrite existing package');
  try {
    // Package already exists from Test 2
    const result = await createMagentoAliasPackage('magento/module-catalog', '103.0.7', 'mage-os/module-catalog', '2.1.0', packageModules);
    if (Object.keys(result).length === 0) {
      console.log('  ✓ Passed: existing package not overwritten\n');
      passed++;
    } else {
      console.log('  ✗ Failed: should have skipped existing package\n');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ Failed with error:', e.message, '\n');
    failed++;
  }

  // Test 4: Generate aliases from built packages (scanning approach)
  console.log('Test 4: Generate aliases from built packages');
  try {
    // Clean up and recreate test directory
    fs.rmSync(testDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    setArchiveBaseDir(testDir);

    // Create mock mage-os packages with replace entries
    await createMockMageOsPackage('mage-os/module-sales', '2.1.0', {
      'magento/module-sales': '101.0.5'
    });
    await createMockMageOsPackage('mage-os/module-checkout', '2.1.0', {
      'magento/module-checkout': '100.4.3'
    });
    // Package without replace entry (should be skipped)
    await createMockMageOsPackage('mage-os/module-customer', '2.1.0', null);
    // Package with non-magento replace entry (should be skipped)
    await createMockMageOsPackage('mage-os/framework', '103.0.0', {
      'laminas/laminas-code': '4.0.0'
    });

    const result = await generateAliasesFromBuiltPackages(testDir, packageModules);

    const aliasCount = Object.keys(result).length;
    if (aliasCount === 2 &&
        result['magento/module-sales'] === '101.0.5' &&
        result['magento/module-checkout'] === '100.4.3') {
      console.log('  ✓ Passed: created', aliasCount, 'alias packages');
      console.log('  ✓ Passed: correct versions assigned');
      console.log('    - magento/module-sales:', result['magento/module-sales']);
      console.log('    - magento/module-checkout:', result['magento/module-checkout']);
      passed += 2;

      // Verify the alias packages were actually created
      await new Promise(resolve => setTimeout(resolve, 100));
      const salesAliasPath = archiveFilePath('magento/module-sales', '101.0.5');
      const checkoutAliasPath = archiveFilePath('magento/module-checkout', '100.4.3');

      if (fs.existsSync(salesAliasPath) && fs.existsSync(checkoutAliasPath)) {
        console.log('  ✓ Passed: alias package files created');
        passed++;
      } else {
        console.log('  ✗ Failed: alias package files not found');
        failed++;
      }
    } else {
      console.log('  ✗ Failed: unexpected result', result);
      failed++;
    }
  } catch (e) {
    console.log('  ✗ Failed with error:', e.message);
    console.log('    Stack:', e.stack);
    failed++;
  }
  console.log();

  // Test 5: Multiple mage-os versions replacing same magento version - highest wins
  console.log('Test 5: Highest mage-os version wins when multiple replace same magento version');
  try {
    // Clean up and recreate test directory
    fs.rmSync(testDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    setArchiveBaseDir(testDir);

    // Create multiple mage-os versions that replace the same magento version
    await createMockMageOsPackage('mage-os/module-catalog', '2.0.0', {
      'magento/module-catalog': '103.0.7'
    });
    await createMockMageOsPackage('mage-os/module-catalog', '2.1.0', {
      'magento/module-catalog': '103.0.7'
    });
    await createMockMageOsPackage('mage-os/module-catalog', '2.0.5', {
      'magento/module-catalog': '103.0.7'
    });

    const result = await generateAliasesFromBuiltPackages(testDir, packageModules);

    // Wait for file write
    await new Promise(resolve => setTimeout(resolve, 100));

    // Read the created alias to verify the highest mage-os version won
    const aliasPath = archiveFilePath('magento/module-catalog', '103.0.7');
    const zipData = fs.readFileSync(aliasPath);
    const zip = await JSZip.loadAsync(zipData);
    const composerJson = JSON.parse(await zip.file('composer.json').async('string'));

    if (composerJson.require['mage-os/module-catalog'] === '2.1.0') {
      console.log('  ✓ Passed: highest mage-os version (2.1.0) was used');
      console.log('    - requires:', JSON.stringify(composerJson.require));
      passed++;
    } else {
      console.log('  ✗ Failed: expected mage-os/module-catalog:2.1.0, got:', composerJson.require);
      failed++;
    }
  } catch (e) {
    console.log('  ✗ Failed with error:', e.message);
    console.log('    Stack:', e.stack);
    failed++;
  }
  console.log();

  // Cleanup
  fs.rmSync(testDir, { recursive: true });

  // Summary
  console.log('=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test runner failed:', e);
  process.exit(1);
});
