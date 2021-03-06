/**
 * Run with
 *
 * node bin/set-satis-output-url-prefix.js --satisOutputDir=/build/ --mirrorUrl=http://repo.mirror.host
 */

const fs = require('fs');
const path = require('path');
const parseOptions = require('parse-options');

const options = parseOptions(
  `@help|h $satisOutputDir $repoUrl`,
  process.argv
);

if (options.help || (options.repoUrl || '').trim() === '') {
  console.log(`Set repository base URL JSON files generated by satis.
Usage:
  node bin/set-satis-output-url-prefix.js [OPTIONS]

Options:
  --satisOutputDir=  The directory containing the files generated by satis (default: /build/)
  --repoUrl=         The mirror repository base URL
  `);
  process.exit(1);
}


function writeJson(file, data) {
  fs.writeFileSync(file + '~', Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
  fs.renameSync(file + '~', file);
}

let satisOutputDir = options.satisOutputDir || '/build/';
if (satisOutputDir.substr(-1) !== '/') {
  satisOutputDir += '/';
}

if (!fs.existsSync(satisOutputDir)) {
  console.log(`Unable to find satis output dir ${satisOutputDir}`);
  process.exit(2);
}


let repoUrl = options.repoUrl;
if (repoUrl.substr(-1) !== '/') {
  repoUrl += '/';
}

const packagesFile = fs.readFileSync(path.join(satisOutputDir, 'packages.json'));
const packages = JSON.parse(packagesFile);

const parsedUrl = new URL(repoUrl);

function fixUrl(o) {
  if (o.url.substr(0, satisOutputDir.length) === satisOutputDir) {
    o.url =  repoUrl + o.url.substr(satisOutputDir.length);
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

let packagePathTemplate = packages['metadata-url'];

// Satis uses the path of the homepage URL as the start of the path path in the package metadata-url.
// We need the actual name inside the build/ dir, so we remove the mirrorUrl pathname
if (packagePathTemplate.startsWith(parsedUrl.pathname)) {
    packagePathTemplate = '/' + packagePathTemplate.slice(parsedUrl.pathname.length);
}

for (const packageName of packages['available-packages']) {
  const packageFilePath = path.join(satisOutputDir, packagePathTemplate.replace('%package%', packageName));
  const packageData = JSON.parse(fs.readFileSync(packageFilePath));

  packageData.packages[packageName] = (packageData.packages[packageName] || []).map(packageRelease => {
    fixUrl(packageRelease.dist);
    return packageRelease;
  });
  writeJson(packageFilePath, packageData);
}
