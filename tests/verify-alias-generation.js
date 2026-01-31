#!/usr/bin/env node
/**
 * Simple verification script for alias package generation
 * Run with: node tests/verify-alias-generation.js
 *
 * TODO: Refactor to Jest tests when feature/test-suite branch is merged
 */

const fs = require('fs');
const path = require('path');
const {
  createMagentoAliasPackage,
  createMagentoAliasPackages,
  setArchiveBaseDir,
  archiveFilePath
} = require('../src/package-modules');

const testDir = '/tmp/mage-os-alias-test';

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

  // Test 1: Skip non-mage-os packages
  console.log('Test 1: Skip non-mage-os packages');
  try {
    const result = await createMagentoAliasPackage('magento/module-catalog', '103.0.7', '103.0.7');
    if (Object.keys(result).length === 0) {
      console.log('  ✓ Passed: non-mage-os package skipped\n');
      passed++;
    } else {
      console.log('  ✗ Failed: should have skipped non-mage-os package\n');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ Failed with error:', e.message, '\n');
    failed++;
  }

  // Test 2: Create alias for mage-os package
  console.log('Test 2: Create alias for mage-os package');
  try {
    const result = await createMagentoAliasPackage('mage-os/module-catalog', '2.1.0', '103.0.7');
    if (result['magento/module-catalog'] === '103.0.7') {
      console.log('  ✓ Passed: alias created with correct version');

      // Wait a bit for stream to flush (same pattern as rest of codebase)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify file was created
      const filePath = archiveFilePath('magento/module-catalog', '103.0.7');
      if (fs.existsSync(filePath)) {
        console.log('  ✓ Passed: package file created at', filePath);

        // Read and verify composer.json content
        const JSZip = require('jszip');
        const zipData = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(zipData);
        const composerJson = JSON.parse(await zip.file('composer.json').async('string'));

        if (composerJson.name === 'magento/module-catalog' &&
            composerJson.type === 'metapackage' &&
            composerJson.require['mage-os/module-catalog'] === '2.1.0') {
          console.log('  ✓ Passed: composer.json content is correct');
          console.log('    - name:', composerJson.name);
          console.log('    - type:', composerJson.type);
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
    const result = await createMagentoAliasPackage('mage-os/module-catalog', '2.1.0', '103.0.7');
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

  // Test 4: Fall back to mage-os version when magento version not provided
  console.log('Test 4: Fall back to mage-os version');
  try {
    const result = await createMagentoAliasPackage('mage-os/module-customer', '2.1.0', null);
    if (result['magento/module-customer'] === '2.1.0') {
      console.log('  ✓ Passed: fell back to mage-os version\n');
      passed++;
    } else {
      console.log('  ✗ Failed: incorrect version', result, '\n');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ Failed with error:', e.message, '\n');
    failed++;
  }

  // Test 5: Batch create aliases
  console.log('Test 5: Batch create aliases');
  try {
    const builtPackages = {
      'mage-os/module-sales': '2.1.0',
      'mage-os/module-checkout': '2.1.0',
      'magento/framework': '103.0.0', // Should be skipped
      'laminas/laminas-code': '4.0.0' // Should be skipped
    };
    const replaceVersions = {
      'magento/module-sales': '101.0.0',
      'magento/module-checkout': '100.0.0'
    };

    const result = await createMagentoAliasPackages(builtPackages, replaceVersions);

    const aliasCount = Object.keys(result).length;
    if (aliasCount === 2 &&
        result['magento/module-sales'] === '101.0.0' &&
        result['magento/module-checkout'] === '100.0.0') {
      console.log('  ✓ Passed: created', aliasCount, 'alias packages');
      console.log('  ✓ Passed: correct versions assigned\n');
      passed += 2;
    } else {
      console.log('  ✗ Failed: unexpected result', result, '\n');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ Failed with error:', e.message, '\n');
    failed++;
  }

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
