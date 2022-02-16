/**
 * Run with 
 * 
 * node bin/set-satis-url-prefix satis.json http://repo.mirror.host
 * 
 */

const fs = require('fs');

const inputSatisConfiguration = process.argv[2] || 'satis.json';

const mirrorUrl = process.argv[3] || '';

if (mirrorUrl.trim() === '') {
  console.log('No mirror base url specified');
  process.exit(1);
}

if (! fs.existsSync(inputSatisConfiguration)) {
  console.log(`Unable to find input satis configuration ${inputSatisConfiguration}`);
  process.exit(2);
}

const json = fs.readFileSync(inputSatisConfiguration).toString('utf8');
const satisConfig = JSON.parse(json);
satisConfig.archive = Object.assign(satisConfig.archive || {}, {'prefix-url': mirrorUrl});
console.log(JSON.stringify(satisConfig, null, 2));