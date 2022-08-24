const sut = require('../src/release-branch-build-tools');

test('It throws an exception for unexpected version strings', () => {
  expect(() => sut.calcNightlyBuildPackageBaseVersion('')).toThrowError('Unable to determine branch release version for input version ""')
  expect(() => sut.calcNightlyBuildPackageBaseVersion('1a')).toThrowError('Unable to determine branch release version for input version "1a"')
  expect(() => sut.calcNightlyBuildPackageBaseVersion('1.x')).toThrowError('Unable to determine branch release version for input version "1.x"')
});

test('It calculates the version', () => {
  expect(sut.calcNightlyBuildPackageBaseVersion('103')).toBe('103.1');
  expect(sut.calcNightlyBuildPackageBaseVersion('103.0')).toBe('103.0.1');
  expect(sut.calcNightlyBuildPackageBaseVersion('103.0.2')).toBe('103.0.2.1');
  expect(sut.calcNightlyBuildPackageBaseVersion('103.0.2.1')).toBe('103.0.2.2');
  expect(sut.calcNightlyBuildPackageBaseVersion('v103.0.2.1')).toBe('v103.0.2.2');
  expect(sut.calcNightlyBuildPackageBaseVersion('0.4.0-beta1')).toBe('0.4.0.1-beta1');
});


test('It updates every version in the input package->version map', () => {
  expect(sut.transformVersionsToNightlyBuildVersions({}, '')).toEqual({})
  expect(sut.transformVersionsToNightlyBuildVersions({
    'foo/bar': '103.0.2'
  }, '20220703')).toEqual({
    'foo/bar': '103.0.2.1-a20220703'
  })
  expect(sut.transformVersionsToNightlyBuildVersions({
    'foo/bar': '103.0.2',
    'baz/moo': '103.0.2',
    'moo/qux': '0.3.4-beta1',
  }, '20220704')).toEqual({
    'foo/bar': '103.0.2.1-a20220704',
    'baz/moo': '103.0.2.1-a20220704',
    'moo/qux': '0.3.4.1-beta120220704',
  })
});

