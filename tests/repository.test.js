

const sut = require('../src/repository');

test('Determines directory for repository from URL', () => {
  expect(sut.testing.dirForRepoUrl('')).toBe('');
  expect(sut.testing.dirForRepoUrl('foo')).toBe('foo');
  expect(sut.testing.dirForRepoUrl('foo/')).toBe('foo');
  expect(sut.testing.dirForRepoUrl('https://github.com/mage-os/mirror-magento2.git', 'mirror-magento2'));
  expect(sut.testing.dirForRepoUrl('git@github.com:mage-os/mirror-magento2.git', 'mirror-magento2'));
  expect(sut.testing.dirForRepoUrl('mage-os/mirror-magento2', 'mirror-magento2'));
});
