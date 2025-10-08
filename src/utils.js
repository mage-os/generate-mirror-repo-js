const compareVersions = require("compare-versions");
const http = require('https');
const {URL} = require('url');
const repositoryBuildDefinition = require('./type/repository-build-definition');
const packagesConfig = require("./build-config/packages-config");

/**
 * If a and b are the same, return 0. Return pos number if a > b, or neg number if a < b
 *
 * Adobe does not comply with semver, because according to semver 1.0 > 1.0-p1.
 * Adobe doesn't comply with semver as patch releases are > non-patch releases
 */
function compareTags(a, b) {
  const ap = a.match(/v?([0-9.]+)-p([\d.]+)/);
  const bp = b.match(/v?([0-9.]+)-p([\d.]+)/);

  // compare only base versions using semver
  if (ap) a = ap[1];
  if (bp) b = bp[1];

  const r = compareVersions(a, b);
  if (r !== 0) return r;

  // base versions are the same
  if (ap && bp) {
    return ap[2] - bp[2]; // both a and b have patch versions
  } else if (ap) {
    return 1; // only a has a patch version, so a is larger
  } else if (bp) {
    return -1; // only b has a patch version, so b is larger
  }
  return 0; // same base and patch versions
}

/**
 * Merge given build configurations, prioritizing values from the second parameter
 * @returns {Array<repositoryBuildDefinition>}
 */
function mergeBuildConfigs(a, b) {
  return Object.keys(b).reduce((acc, key) => {
    const repoInstruction = b[key] || {};
    ['packageDirs', 'packageIndividual', 'packageMetaFromDirs'].forEach(type => {
      if (! repoInstruction[type]) return
      repoInstruction[type].map(bx => {
        const idField = bx.dir ? 'dir' : 'label'
        const targetIdx = (a[key]?.[type] || []).findIndex(ax => ax[idField] === bx[idField])
        a[key] = a[key] || {};
        if (targetIdx > -1) {
          a[key][type][targetIdx] = Object.assign(a[key][type][targetIdx], bx)
        } else {
          a[key][type] = (a[key]?.[type] || []).concat([bx])
        }
      })
      delete b[key][type];
    })

    acc.push(
      new repositoryBuildDefinition(
        Object.assign({key}, (a[key] || {}), b[key])
      )
    );
    return acc;
  }, [])
}

module.exports = {
  /**
   * Given 'app/code/Magento/Catalog', return 'Magento/Catalog'
   */
  lastTwoDirs(dir, sep) {
    return dir.split('/').slice(-2).join(sep || '/');
  },
  compareVersions: compareTags,
  isVersionGreaterOrEqual(a, b) {
    return compareTags(a, b) >= 0;
  },
  isVersionLessOrEqual(a, b) {
    return compareTags(a, b) <= 0;
  },
  isVersionEqual(a, b) {
    return compareTags(a, b) === 0;
  },
  async httpSlurp(url) {
    return new Promise((resolve, reject) => {
      const request = http.request(new URL(url), function (res) {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      request.on('error', err => reject(e.message));
      request.end();
    });
  },
  mergeBuildConfigs
}
