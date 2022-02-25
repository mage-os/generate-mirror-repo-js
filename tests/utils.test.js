
const sut = require('../src/utils');


test('Compares regular semver versions', () => {
  expect(sut.compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
  expect(sut.compareVersions('1.2.4', '1.2.3')).toBeGreaterThan(0);
  expect(sut.compareVersions('1.2.3', '1.2.3')).toBe(0);
});

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
});

test('Provides semantic comparison methods', () => {
  expect(sut.isVersionLessOrEqual('1.2.3', '1.2.3-p1')).toBeTruthy();
  expect(sut.isVersionGreaterOrEqual('1.2.3-p1', '1.2.3')).toBeTruthy();
  expect(sut.isVersionEqual('1.2.3-p1.2', '1.2.3-p1.2')).toBeTruthy();
  
  expect(sut.isVersionLessOrEqual('1.2.3-p2', '1.2.3-p1')).toBeFalsy();
  expect(sut.isVersionGreaterOrEqual('1.2.3-p1.1', '1.2.3-p1.2')).toBeFalsy();
});