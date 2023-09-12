const sut = require('../src/utils');


test('Compares regular semver versions', () => {
  expect(sut.compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
  expect(sut.compareVersions('1.2.4', '1.2.3')).toBeGreaterThan(0);
  expect(sut.compareVersions('1.2.3', '1.2.3')).toBe(0);
})

test('Compares versions using -p tag as patches', () => {
  expect(sut.compareVersions('1.2.3', '1.2.3-p1')).toBeLessThan(0);
  expect(sut.compareVersions('1.2.3-p1', '1.2.3')).toBeGreaterThan(0);
  expect(sut.compareVersions('1.2.3-p1', '1.2.3-p1')).toBe(0);

  expect(sut.compareVersions('1.2.3-p1', '1.2.3-p2')).toBeLessThan(0);
  expect(sut.compareVersions('1.2.3-p2', '1.2.3-p1')).toBeGreaterThan(0);

  expect(sut.compareVersions('1.2.3-p1', '1.2.3-p1.1')).toBeLessThan(0);
  expect(sut.compareVersions('1.2.3-p1.1', '1.2.3-p1')).toBeGreaterThan(0);
  expect(sut.compareVersions('1.2.3-p1.1', '1.2.3-p1.1')).toBe(0);

  expect(sut.compareVersions('1.2.3-p1.1', '1.2.3-p1.2')).toBeLessThan(0);
  expect(sut.compareVersions('1.2.3-p1.2', '1.2.3-p1.1')).toBeGreaterThan(0);

  expect(sut.compareVersions('1.2.3-p1.1', '1.2.3-p2')).toBeLessThan(0);
  expect(sut.compareVersions('1.2.3-p2', '1.2.3-p1.1')).toBeGreaterThan(0);
  expect(sut.compareVersions('1.2.3-p2.1', '1.2.3-p1.1')).toBeGreaterThan(0);

  expect(sut.compareVersions('1.2.3-p0.1', '1.2.3')).toBeGreaterThan(0);
  expect(sut.compareVersions('1.2.3-p0.1', '1.2.3-p1')).toBeLessThan(0);
  expect(sut.compareVersions('1.2.3-p0.1', '1.2.3-p0')).toBeGreaterThan(0);
})

test('Provides semantic comparison methods', () => {
  expect(sut.isVersionLessOrEqual('1.2.3', '1.2.3-p1')).toBeTruthy();
  expect(sut.isVersionGreaterOrEqual('1.2.3-p1', '1.2.3')).toBeTruthy();
  expect(sut.isVersionEqual('1.2.3-p1.2', '1.2.3-p1.2')).toBeTruthy();

  expect(sut.isVersionLessOrEqual('1.2.3-p2', '1.2.3-p1')).toBeFalsy();
  expect(sut.isVersionGreaterOrEqual('1.2.3-p1.1', '1.2.3-p1.2')).toBeFalsy();
})

test('Merges build configs prioritizing the later', () => {
  expect(sut.mergeBuildConfigs({}, {})).toEqual([])
  expect(sut.mergeBuildConfigs(
    {
      'composer-root-update-plugin': {
        repoUrl: 'https://github.com/mage-os/mirror-composer-root-update-plugin.git',
        packageDirs: [{label: 'Community Edition Sample Data', dir: 'app/code/Magento'}],
        packageIndividual: [{label: 'Magento Composer Root Update Plugin', dir: 'src/Magento/ComposerRootUpdatePlugin'}],
        packageMetaFromDirs: [],
      }
    },
    {
      'composer-root-update-plugin': {
        repoUrl: 'https://github.com/mage-os/mageos-composer-root-update-plugin.git',
        ref: 'develop',
        packageDirs: [
          {
            label: 'Community Edition Sample Data',
            foo: 'bar' // new key in record using the label as the id field
          }
        ],
      }
    })).toEqual([
    {
      repoUrl: 'https://github.com/mage-os/mageos-composer-root-update-plugin.git',
      ref: 'develop',
      packageDirs: [{label: 'Community Edition Sample Data', dir: 'app/code/Magento', foo: 'bar'}],
      packageIndividual: [{label: 'Magento Composer Root Update Plugin', dir: 'src/Magento/ComposerRootUpdatePlugin'}],
      packageMetaFromDirs: [],
    }])

  expect(sut.mergeBuildConfigs(
    {
      'commerce-data-export': {
        repoUrl: 'https://github.com/mage-os/mirror-commerce-data-export.git',
        packageIndividual: [
          {
            label: 'Community Edition Sample Data Media',
            dir: 'pub/media',
          },
          {
            label: 'Package Individual Dummy',
            dir: 'foo',
            excludes: [],
          }
        ]
      }
    },
    {
      'commerce-data-export': {
        repoUrl: 'https://github.com/mage-os/mageos-commerce-data-export.git',
        ref: 'main',
        packageIndividual: [
          {
            dir: 'foo',
            composerJsonPath: 'bar/buz/composer.json' // add key composerJsonPath
          },
          {
            label: 'BAZ', // change label to BAZ
            dir: 'pub/media',
          },
          {
            label: 'Moo', // new record not present in first build config
            dir: 'moo',
          }
        ]
      }
    }
  )).toEqual([{
    repoUrl: 'https://github.com/mage-os/mageos-commerce-data-export.git',
    ref: 'main',

    packageIndividual: [
      {
        label: 'BAZ',
        dir: 'pub/media',
      },
      {
        label: 'Package Individual Dummy',
        dir: 'foo',
        excludes: [],
        composerJsonPath: 'bar/buz/composer.json'
      },
      {
        label: 'Moo', // new record
        dir: 'moo',
      }
    ]
  }])
})
