
const sut = require('../../../src/build-config/packages-config').magento2.packageIndividual[0].excludes[1];

// This is a test for one of the exclude functions in src/build-config/packages-config.js
// It was written during a refactoring to ensure the behavior does not change.

const releases = [
  '2.4.7-beta2',
  '2.4.7-beta1',
  '2.4.6-p3',
  '2.4.6-p2',
  '2.4.6-p1',
  '2.4.6',
  '2.4.5-p5',
  '2.4.5-p4',
  '2.4.5-p3',
  '2.4.5-p2',
  '2.4.5-p1',
  '2.4.5',
  '2.4.4-p6',
  '2.4.4-p5',
  '2.4.4-p4',
  '2.4.4-p3',
  '2.4.4-p2',
  '2.4.4-p1',
  '2.4.4',
  '2.4.3-p3',
  '2.4.3-p2',
  '2.4.3-p1',
  '2.4.3',
  '2.4.2-p2',
  '2.4.2-p1',
  '2.4.2',
  '2.4.1-p1',
  '2.4.1',
  '2.4.0-p1',
  '2.4.0',
  '2.3.7-p4',
  '2.3.7-p3',
  '2.3.7-p2',
];

const oldf = (ref, file) => {
  const releasesWithoutGitIgnore = ['2.4.1', '2.4.1-p1', '2.4.2', '2.4.4-p3', '2.4.4-p4', '2.4.4-p5', '2.4.4-p6', '2.4.5-p2', '2.4.5-p3', '2.4.5-p4', '2.4.5-p5', '2.4.6', '2.4.6-p1', '2.4.6-p2', '2.4.6-p3', '2.4.4-p7', '2.4.5-p6', '2.4.6-p3'];
  if (typeof file === "undefined") {
    return releasesWithoutGitIgnore.includes(ref) ? '.gitignore' : '';
  }
  return file === '.gitignore' && releasesWithoutGitIgnore.includes(ref);
};

const newf = (ref, file) => {
  const releasesWithGitIgnore = ['2.4.0-p1', '2.4.0', '2.3.7-p4', '2.3.7-p3', '2.3.7-p2', '2.4.2-p1', '2.4.2-p2', '2.4.3', '2.4.3-p1', '2.4.3-p2', '2.4.3-p3', '2.4.4', '2.4.4-p1', '2.4.4-p2', '2.4.5', '2.4.5-p1', '2.4.7-beta2', '2.4.7-beta1']
  if (typeof file === "undefined") {
    return releasesWithGitIgnore.includes(ref) ? '' : '.gitignore'
  }
  return file === '.gitignore' && ! releasesWithGitIgnore.includes(ref);
}

describe('It has the same behavior', () => {
  for (const release of releases) {
    it(`for release ${release}`, () => {
      expect(newf(release)).toEqual(oldf(release));
      expect(newf(release, '.gitignore')).toEqual(oldf(release, '.gitignore'));

      expect(newf(release)).toEqual(sut(release));
      expect(newf(release, '.gitignore')).toEqual(sut(release, '.gitignore'));

      expect(oldf(release)).toEqual(sut(release));
      expect(oldf(release, '.gitignore')).toEqual(sut(release, '.gitignore'));
    })
  }
})
;
