const {transformMageOSBaseSortLinks} = require('../../../src/build-package/mage-os-base');

const unsortedReplace = () => ({
  'trentrichardson/jquery-timepicker-addon': '1.4.3',
  'components/jquery': '1.11.0',
  'components/jqueryui': '1.10.4',
  'twbs/bootstrap': '3.1.0',
});

const config = (over = {}) => ({name: 'mage-os/magento2-base', replace: unsortedReplace(), ...over});
const instruction = {vendor: 'mage-os'};

describe('transformMageOSBaseSortLinks', () => {
  test('sorts replace for a new release at the 3.2.1 gate', () => {
    const result = transformMageOSBaseSortLinks(config(), instruction, {version: '3.2.1'});
    expect(Object.keys(result.replace)).toEqual([
      'components/jquery', 'components/jqueryui',
      'trentrichardson/jquery-timepicker-addon', 'twbs/bootstrap',
    ]);
  });

  test('sorts replace for a historic rebuild above the gate, which sets ref not version', () => {
    const result = transformMageOSBaseSortLinks(config(), instruction, {ref: '3.3.0'});
    expect(Object.keys(result.replace)).toEqual([
      'components/jquery', 'components/jqueryui',
      'trentrichardson/jquery-timepicker-addon', 'twbs/bootstrap',
    ]);
  });

  test('leaves replace untouched for 3.2.0, which is frozen at published bytes', () => {
    const result = transformMageOSBaseSortLinks(config(), instruction, {ref: '3.2.0'});
    expect(Object.keys(result.replace)).toEqual(Object.keys(unsortedReplace()));
  });

  test('leaves replace untouched for 3.1.0', () => {
    const result = transformMageOSBaseSortLinks(config(), instruction, {ref: '3.1.0'});
    expect(Object.keys(result.replace)).toEqual(Object.keys(unsortedReplace()));
  });

  test('sorts non-numeric nightly versions', () => {
    const result = transformMageOSBaseSortLinks(config(), instruction, {version: 'dev-main'});
    expect(Object.keys(result.replace)).toEqual([
      'components/jquery', 'components/jqueryui',
      'trentrichardson/jquery-timepicker-addon', 'twbs/bootstrap',
    ]);
  });

  test('sorts every link section, not just replace', () => {
    const input = config({
      require: {'symfony/console': '^6.4', 'colinmollenhour/credis': '^1.15'},
      conflict: {'gene/bluefoot': '*'},
      suggest: {'zzz/z': 'z', 'aaa/a': 'a'},
    });
    const result = transformMageOSBaseSortLinks(input, instruction, {version: '3.2.1'});
    expect(Object.keys(result.require)).toEqual(['colinmollenhour/credis', 'symfony/console']);
    expect(Object.keys(result.suggest)).toEqual(['aaa/a', 'zzz/z']);
  });

  test('does not add sections that were absent', () => {
    const result = transformMageOSBaseSortLinks({name: 'mage-os/magento2-base'}, instruction, {version: '3.2.1'});
    expect(result['require-dev']).toBeUndefined();
    expect(result.replace).toBeUndefined();
  });
});
