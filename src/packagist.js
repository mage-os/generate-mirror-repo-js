const https = require('https');

const packagesCache = {};

/**
 * Packagist Search API
 *
 * Response format will be like:
 * {
 *  "results":[
 *    {
 *      "name":"mage-os/magento-cache-clean",
 *      "description":"A faster drop in replacement for bin/magento cache:clean with file watcher",
 *      "url":"https://packagist.org/packages/mage-os/magento-cache-clean",
 *      "repository":"https://github.com/mage-os/magento-cache-clean",
 *      "downloads":44773,
 *      "favers":29
 *    }
 *  ],
 *  "total":23,
 *  "next": "https://packagist.org/search.json?q=[query]&page=[next page number]"
 * }
 *
 * @see https://packagist.org/apidoc#search-packages
 */

/**
 * @param {string} url 
 * @returns {Promise<any>}
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch all packages for a vendor from Packagist, handling pagination.
 * @param {string} vendor
 * @returns {Promise<Set<string>>}
 */
async function fetchPackagistList(vendor) {
  if (packagesCache[vendor]) {
    return packagesCache[vendor];
  }

  let url = 'https://packagist.org/search.json?per_page=100&q=' + encodeURIComponent(vendor + '/');
  let packages = new Set();

  while (url) {
    const json = await fetchUrl(url);
    (json.results || [])
      .filter(pkg => pkg.name && pkg.name.startsWith(vendor + '/'))
      .forEach(pkg => packages.add(pkg.name));
    url = json.next || null;
  }

  packagesCache[vendor] = packages;
  return packages;
}

/**
 * Check if a package is distributed on Packagist under the given vendor.
 * @param {string} vendor
 * @param {string} packageName
 * @returns {boolean}
 */
function isOnPackagist(vendor, packageName) {
  if (vendor === 'magento') {
    return false; // Always build Magento packages
  }

  if (!packagesCache[vendor]) {
    throw new Error(`Package list for vendor ${vendor} not loaded. Call fetchPackagistList(vendor) first.`);
  }

  return packagesCache[vendor].has(packageName);
}

module.exports = {
  fetchPackagistList,
  isOnPackagist
};
