/**
 * Run with
 *
 * node bin/set-satis-homepage.js --satisConfig satis-config.json --repoUrl http://repo.mirror.host
 */

const fs = require('fs');
const parseOptions = require('parse-options');

const options = parseOptions(
  `$repoUrl $satisConfig @help|h`,
  process.argv
);

if (options.help || '' === (options.repoUrl || '').trim()) {
  console.log(`Print satis.config to STDOUT with given name and homepage.

Usage:
  node bin/set-satis-homepage-url.js [OPTIONS]

Options:
  --satisConfig= The satis.config file to use as an input (default: /build/satis.json)
  --repoUrl=     Repository base URL (for example https://repo.mage-os.org/)
  `);
  process.exit(1);
}

const repoUrl = options.repoUrl.substr(0, 4) !== 'http'
  ? `https://${options.repoUrl}`
  : options.repoUrl;

const satisConfigFile = options.satisConfig || '/build/satis.json';
if (! fs.existsSync(satisConfigFile)) {
  console.log(`Unable to find satis input configuration "${satisConfigFile}"`);
  process.exit(2);
}

const satisConfig = JSON.parse(fs.readFileSync(satisConfigFile));

// Set "name" to "mage-os/${repoUrl} repository" but only the lowest level domain
// (e.g. mage-os/mirror for https://mirror.mage-os.org)
const url = new URL(repoUrl);
const lowestLevelDomain = url.host.substr(0, url.host.indexOf('.'));
console.log(JSON.stringify({...satisConfig, homepage: repoUrl, name: `mage-os/${lowestLevelDomain}`}, null, 2))