/**
 * Run with
 *
 * node bin/set-satis-homepage.js satis-config-file.json http://repo.mirror.host
 */

const fs = require('fs');

const mirrorUrl = process.argv[2] || '';
if (mirrorUrl.trim() === '') {
  console.log('No mirror base url specified');
  process.exit(1);
}

const satisConfigFile = process.argv[3] || '/build/satis.json';
if (! fs.existsSync(satisConfigFile)) {
  console.log(`Unable to find satis input configuration "${satisConfigFile}"`);
  process.exit(2);
}

const satisConfig = JSON.parse(fs.readFileSync(satisConfigFile));

// Set "name" to "mage-os/${mirrorUrl} repository" but only the lowest level domain
// (e.g. mage-os/mirror for https://mirror.mage-os.org)
const url = new URL(mirrorUrl);
const lowestLevelDomain = url.host.substr(0, url.host.indexOf('.'));
console.log(JSON.stringify({...satisConfig, homepage: mirrorUrl, name: `mage-os/${lowestLevelDomain}`}, null, 2))