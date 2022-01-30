const compareVersions = require("compare-versions");

module.exports = {
  /**
   * Given 'app/code/Magento/Catalog', return 'Magento/Catalog'
   */
  lastTwoDirs(dir, sep) {
    return dir.split('/').slice(-2).join(sep || '/');
  },
  /**
   * If a and b are the same, return 0. Return pos number if a > b, or neg number if a < b
   *
   * Adobe does not comply with semver, because according to semver 1.0 > 1.0-p1.
   * Adobe doesn't comply with semver as patch releases are > non-patch releases
   */
  compareTags(a, b) {
    const ap = a.match(/v?([0-9.]+)-p(\d+)/);
    const bp = b.match(/v?([0-9.]+)-p(\d+)/);

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
}