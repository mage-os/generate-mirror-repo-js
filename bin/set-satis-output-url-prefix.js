/**
 * Run with
 *
 * node bin/set-satis-output-url-prefix satis.json http://repo.mirror.host
 */

const fs = require('fs');
const path = require('path');

let satisOutputDir = process.argv[2] || '/build/';
if (satisOutputDir.substr(-1) !== '/') {
  satisOutputDir += '/';
}

let mirrorUrl = process.argv[3] || '';

if (mirrorUrl.trim() === '') {
  console.log('No mirror base url specified');
  process.exit(1);
}
if (mirrorUrl.substr(-1) !== '/') {
  mirrorUrl += '/';
}

if (!fs.existsSync(satisOutputDir)) {
  console.log(`Unable to find satis output dir ${satisOutputDir}`);
  process.exit(2);
}

// for local non-dockerized runs where the output dir containing the generated JSON might not match the satisOutputDir
let satisUrlPrefix = process.argv[4] || satisOutputDir;
if (satisUrlPrefix.substr(-1) !== '/') {
  satisUrlPrefix += '/';
}


const packagesFile = fs.readFileSync(path.join(satisOutputDir, 'packages.json'));
const packages = JSON.parse(packagesFile);

function writeJson(file, data) {
  fs.writeFileSync(file + '~', Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
  fs.renameSync(file + '~', file);
}

function fixUrl(o) {
  if (o.url.substr(0, satisUrlPrefix.length) === satisUrlPrefix) {
    o.url =  mirrorUrl + o.url.substr(satisUrlPrefix.length);
  }
}

function fixIncludeFileUrls(includeFileData) {
  const packageNames = Object.keys(includeFileData.packages || {});

  return packageNames.reduce((data, packageName) => {

    const packageVersions = Object.keys(data.packages[packageName]);

    data.packages[packageName] = packageVersions.reduce((newPackageAcc, version) => {
      fixUrl(newPackageAcc[version].dist);
      return newPackageAcc;
    }, data.packages[packageName]);

    return data;
  }, includeFileData);
}


for (const includeFileName in (packages.includes || {})) {
  const includeFile = path.join(satisOutputDir, includeFileName);
  const includeFileData = JSON.parse(fs.readFileSync(includeFile));
  const newIncludeData = fixIncludeFileUrls(includeFileData);
  writeJson(includeFile, newIncludeData);
}

const packagePathTemplate = packages['metadata-url'];
for (const packageName of packages['available-packages']) {
  const packageFilePath = path.join(satisOutputDir, packagePathTemplate.replace('%package%', packageName));
  
  const packageData = JSON.parse(fs.readFileSync(packageFilePath));

  packageData.packages[packageName] = (packageData.packages[packageName] || []).map(packageRelease => {
    fixUrl(packageRelease.dist);
    return packageRelease;
  });
  writeJson(packageFilePath, packageData);
}
