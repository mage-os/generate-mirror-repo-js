/**
 * Run with
 *
 * node bin/set-satis-homepage.js --satisConfig satis-config.json --mirrorUrl http://repo.mirror.host
 */

const fs = require('fs');
const parseOptions = require('parse-options');

const options = parseOptions(
  `$mirrorUrl $satisConfig @help|h`,
  process.argv
);

if (options.help || '' === (options.mirrorUrl || '').trim()) {
  console.log(`Print satis.config to STDOUT with given name and homepage.

Usage:
  node bin/set-satis-homepage-url.js [OPTIONS]

Options:
  --satisConfig= The satis.config file to use as an input (default: /build/satis.json)
  --mirrorUrl=   Mirror base URL (for example https://mirror.mage-os.org/)
  `);
  process.exit(1);
}

const mirrorUrl = options.mirrorUrl.substr(0, 4) !== 'http'
  ? `https://${options.mirrorUrl}`
  : options.mirrorUrl;

const satisConfigFile = options.satisConfig || '/build/satis.json';
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