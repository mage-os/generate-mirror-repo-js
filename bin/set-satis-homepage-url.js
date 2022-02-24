/**
 * Run with
 *
 * node bin/set-satis-homepage.js satis-config-file.json http://repo.mirror.host
 */

const fs = require('fs');
const path = require('path');

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

console.log(JSON.stringify({...satisConfig, homepage: mirrorUrl}, null, 2))