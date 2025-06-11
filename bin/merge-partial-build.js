#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const parseOptions = require('parse-options');

const options = parseOptions(
  `$repoUrl $buildDir $outputDir @help|h`,
  process.argv
);

if (options.help || !options.repoUrl || !options.buildDir) {
  console.log(`Merge partial build with existing repository metadata.

Usage:
  node bin/merge-partial-build.js --repoUrl=<url> --buildDir=<path> [--outputDir=<path>]

Options:
  --repoUrl=    URL of the existing repository (e.g., https://mirror.mage-os.org/)
  --buildDir=   Directory containing the new partial build
  --outputDir=  Output directory for merged result (default: same as buildDir)
  --help, -h    Show this help
`);
  process.exit(options.help ? 0 : 1);
}

const repoUrl = options.repoUrl.endsWith('/') ? options.repoUrl : options.repoUrl + '/';
const buildDir = options.buildDir;
const outputDir = options.outputDir || buildDir;

// Download a file from URL with error handling
function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 404) {
        // Return empty packages.json for new repositories
        resolve('{}');
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(data));
    }).on('error', () => {
      // Network error - return empty packages.json
      console.warn(`Warning: Could not download ${url}, creating new repository`);
      resolve('{}');
    });
  });
}

// Extract package info from Satis packages.json
function extractPackageInfo(packagesJson) {
  const packages = {};
  
  // Handle both formats: direct packages and includes
  if (packagesJson.packages) {
    for (const [name, versions] of Object.entries(packagesJson.packages)) {
      packages[name] = packages[name] || {};
      Object.assign(packages[name], versions);
    }
  }
  
  return packages;
}

// Scan build directory for new packages
function scanBuildDirectory(dir) {
  const packages = {};
  
  // Try both 'packages' subdirectory (workflow) and direct subdirectories (local)
  const possiblePaths = [path.join(dir, 'packages'), dir];
  let packagesDir = null;
  
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      const contents = fs.readdirSync(possiblePath, { withFileTypes: true });
      const hasVendorDirs = contents.some(item => 
        item.isDirectory() && ['magento', 'additional'].includes(item.name)
      );
      if (hasVendorDirs) {
        packagesDir = possiblePath;
        break;
      }
    }
  }
  
  if (!packagesDir) {
    throw new Error(`Could not find packages directory in ${dir}`);
  }
  
  console.log(`Scanning packages in: ${packagesDir}`);
  
  const vendorDirs = fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  for (const vendor of vendorDirs) {
    const vendorPath = path.join(packagesDir, vendor);
    if (!fs.existsSync(vendorPath)) continue;
    
    const packageFiles = fs.readdirSync(vendorPath)
      .filter(file => file.endsWith('.zip'));
    
    console.log(`Found ${packageFiles.length} packages in ${vendor}/`);
    
    for (const file of packageFiles) {
      // Extract package name and version from filename
      // Format: package-name-version.zip
      const match = file.match(/^(.+?)-(\d+\..+)\.zip$/);
      if (match) {
        const packageName = `${vendor}/${match[1]}`;
        const version = match[2];
        
        packages[packageName] = packages[packageName] || {};
        packages[packageName][version] = {
          name: packageName,
          version: version,
          dist: {
            type: "zip",
            url: `${repoUrl}packages/${vendor}/${file}`
          }
        };
      } else {
        console.warn(`Could not parse package filename: ${file}`);
      }
    }
  }
  
  return packages;
}

async function main() {
  try {
    console.log('Downloading existing packages.json...');
    const existingPackagesData = await download(repoUrl + 'packages.json');
    const existingPackages = JSON.parse(existingPackagesData);
    
    console.log('Scanning build directory for new packages...');
    const newPackages = scanBuildDirectory(buildDir);
    
    // Extract all existing packages
    const allPackages = extractPackageInfo(existingPackages);
    
    // Merge new packages
    let updatedCount = 0;
    let addedCount = 0;
    
    for (const [name, versions] of Object.entries(newPackages)) {
      for (const [version, data] of Object.entries(versions)) {
        if (allPackages[name] && allPackages[name][version]) {
          updatedCount++;
        } else {
          addedCount++;
        }
        
        allPackages[name] = allPackages[name] || {};
        allPackages[name][version] = data;
      }
    }
    
    console.log(`Added ${addedCount} new package versions`);
    console.log(`Updated ${updatedCount} existing package versions`);
    
    // Create new packages.json with merged data
    const mergedPackages = {
      ...existingPackages,
      packages: allPackages
    };
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write merged packages.json
    const outputPath = path.join(outputDir, 'packages.json');
    fs.writeFileSync(outputPath, JSON.stringify(mergedPackages, null, 2));
    console.log(`Merged packages.json written to ${outputPath}`);
    
    // Also download and copy index.html if it doesn't exist
    const indexPath = path.join(outputDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      try {
        console.log('Downloading index.html...');
        const indexData = await download(repoUrl + 'index.html');
        if (indexData && indexData !== '{}') {
          fs.writeFileSync(indexPath, indexData);
        }
      } catch (error) {
        console.warn('Could not download index.html, skipping...');
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();