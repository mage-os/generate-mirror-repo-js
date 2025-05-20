#!/usr/bin/env php
<?php

/**
 * Script to download the latest Magento packages
 * This script:
 * 1. Finds the latest version for each major.minor release in resource/history/magento/magento2-base
 * 2. Uses composer to create a project with each version
 * 3. Uses the download-missing-packages-from-repo-magento-com.php script to download missing packages
 * 4. Removes the project directory
 * 5. Adds the downloaded packages to git
 */

// Set error reporting
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Directory containing version files
$versionDir = "resource/history/magento/magento2-base";

// Get all version files
$versionFiles = glob("$versionDir/*.json");
if (empty($versionFiles)) {
    echo "Error: No version files found in $versionDir\n";
    exit(1);
}

// Collect all versions
$versions = [];
foreach ($versionFiles as $file) {
    $versions[] = basename($file, '.json');
}

usort($versions, function($a, $b) {
    return version_compare($a, $b);
});

$latestVersions = [];
foreach ($versions as $version) {
    $versionAndPatch = explode('-', $version);
    $latestVersions[$versionAndPatch[0]] = $version;
}

// Process each version
foreach ($latestVersions as $version) {
    echo "Processing version: $version\n";

    // Create project directory using composer
    echo "Creating Magento project with version $version...\n";
    $command = "composer create-project --repository-url=https://repo.magento.com/ magento/project-community-edition:$version --ignore-platform-reqs --no-progress -q -n --no-plugins";
    passthru($command, $returnCode);

    if ($returnCode !== 0) {
        echo "Error: Composer command failed with return code $returnCode\n";
        continue;
    }

    // Download missing packages
    echo "Downloading missing packages...\n";
    $command = "php bin/download-missing-packages-from-repo-magento-com.php project-community-edition/composer.lock build resource/additional-packages";
    passthru($command, $returnCode);

    // Remove project directory
    echo "Cleaning up project directory...\n";
    $command = "rm -rf project-community-edition";
    passthru($command);

    echo "\n\n";
}

echo "Done!\n";
