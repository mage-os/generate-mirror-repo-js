const {buildConfig} = require('../../../src/build-config/mageos-release-build-config');
const {transformMageOSBaseSortLinks} = require('../../../src/build-package/mage-os-base');

describe('mageos-release-build-config wiring', () => {
  test('registers transformMageOSBaseSortLinks under the magento/magento2-base instruction-level transform key', () => {
    // repositoryBuildDefinition's constructor does not copy options.key onto the instance,
    // so instruction.key is always undefined here; match on repoUrl instead.
    const magento2Instruction = buildConfig.find(instruction => instruction.repoUrl === 'https://github.com/mage-os/mageos-magento2.git');
    expect(magento2Instruction).toBeDefined();
    // Keyed as magento/ (not mage-os/): package-modules.js resolves transforms via
    // instruction.transform[name] || instruction.transform[originalName], and originalName
    // is always the magento/ form regardless of --mageosVendor.
    expect(magento2Instruction.transform['magento/magento2-base']).toContain(transformMageOSBaseSortLinks);
  });
});
