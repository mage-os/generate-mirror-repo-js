#!/usr/bin/env php
<?php

/*
 * Download all packages referenced in a given composer.lock file that were installed from repo.magento.com but are not present in a given directory.
 *
 * Example:
 * ./bin/download-missing-packages-from-repo-magento-com.php ../m2-install/composer.lock output/mirror/packages resource/additional-packages
 *
 * Usage:
 * 1. Build all mirror packages using the repo-generator script into package-dir
 * 2. Install the target m2 version from repo.magento.com
 * 3. Run this script with the m2 composer.lock file from the installation with the package-dir as an argument (and resource/additional-packages as the output-dir)
 * 4. The script will download all packages from repo.magento.com that were not generated
 * 5. Run `git status` to see the downloaded packages, then add and commit
 */

// Input validation ----------------

if (!file_exists($argv[0])) {
    fwrite(STDERR, sprintf("ERROR: Unable to find composer autoload.php file \"%s\"\n", $argv[0]));
    exit(2);
}

if (!isset($argv[1])) {
    fwrite(STDERR, sprintf("ERROR: Required argument missing:\n"));
    fwrite(STDERR, sprintf("Specify the path to a composer.lock file as the first argument to %s\n", basename($argv[0])));
    exit(1);
}

if (!file_exists($argv[1])) {
    fwrite(STDERR, sprintf("ERROR: Unable to find composer.lock file \"%s\"\n", $argv[1]));
    exit(2);
}

if (!isset($argv[2])) {
    fwrite(STDERR, sprintf("ERROR: Required argument missing:\n"));
    fwrite(STDERR, sprintf("Specify the path to a package dir as the second argument to %s\n", basename($argv[0])));
    exit(1);
}

if (!file_exists($argv[2])) {
    fwrite(STDERR, sprintf("ERROR: Unable to find packages directory \"%s\"\n", $argv[2]));
    exit(2);
}

if (!is_dir($argv[2])) {
    fwrite(STDERR, sprintf("ERROR: Packages directory argument \"%s\" is not a directory\n", $argv[2]));
    exit(2);
}

if (!isset($argv[3])) {
    fwrite(STDERR, sprintf("ERROR: Required argument missing:\n"));
    fwrite(STDERR, sprintf("Specify the path to a output dir as the third argument to %s\n", basename($argv[0])));
    exit(1);
}

if (!file_exists($argv[3])) {
    fwrite(STDERR, sprintf("ERROR: Unable to find output directory \"%s\"\n", $argv[3]));
    exit(2);
}

if (!is_dir($argv[3])) {
    fwrite(STDERR, sprintf("ERROR: Output directory argument \"%s\" is not a directory\n", $argv[3]));
    exit(2);
}

// Determine missing packages ----------------

[$process, $composerLock, $packageDir, $outputDir] = $argv;

$composerState = json_decode(file_get_contents($composerLock), true);

$toDownload = [];

foreach ($composerState['packages'] as $package) {
    if (!isset($package['dist'])) {
        // Not the right kind of package source
        continue;
    }
    $url = $package['dist']['url'] ?? '';
    if ($package['dist']['type'] !== 'zip' || strpos($url, 'https://repo.magento.com/archives/') !== 0) {
        // Not an archive from repo.magento.com
        continue;
    }
    [$vendor, $name] = explode('/', $package['name']);
    // Check if it was generated from an open-source repo and already exists in the package-dir
    if (file_exists(sprintf('%s/%s/%s-%s.zip', $packageDir, $vendor, $name, $package['version']))) {
        continue;
    }

    // Check if it exists in output-dir already
    if (file_exists(sprintf('%s/%s', $outputDir, basename($url)))) {
        continue;
    }

    $toDownload[] = $url;
}

if (empty($toDownload)) {
    fwrite(STDERR, sprintf("Nothing to download.\n"));
    exit(0);
}

// Download missing packages ----------------

$authFileCandidates = ['./auth.json', $_SERVER['HOME'] . '/.composer/auth.json'];
foreach ($authFileCandidates as $candidate) {
    if (file_exists($candidate)) {
        $authFile = $candidate;
        break;
    }
}
if (!isset($authFile)) {
    fwrite(STDERR, sprintf("ERROR: Unable to download %d packages:\n", count($toDownload)));
    fwrite(STDERR, sprintf("Unable to find one of the composer auth.json files at %s\n", implode(', ', $authFileCandidates)));
    exit(1);
}

$authData = json_decode(file_get_contents($authFile), true)['http-basic']['repo.magento.com'] ?? [];

if (!$authData) {
    fwrite(STDERR, sprintf("ERROR: Unable to download %d packages:\n", count($toDownload)));
    fwrite(STDERR, sprintf("No composer credentials for repo.magento.com found in %s.\n", $authFile));
    exit(1);
}

$credentials = base64_encode($authData['username'] . ':' . $authData['password']);
$opts = ['http' => [
    'header' => [
        sprintf('Authorization: Basic %s', $credentials),
        'User-Agent: composer-php/2.7.0'
    ]
]];
$context = stream_context_create($opts);

// Set error handler to catch PHP warnings triggered by the stream wrapper, e.g. http authorization errors
set_error_handler(function (int $errno, string $errstr) {
    throw new RuntimeException($errstr);
}, E_WARNING);

foreach ($toDownload as $url) {
    try {
        fwrite(STDOUT, basename($url) . "\n");
        $fp = fopen($url, 'r', false, $context);
        $data = '';
        while (!feof($fp)) {
            $data .= fread($fp, 1024);
        }
        fclose($fp);
        file_put_contents(sprintf('%s/%s', $outputDir, basename($url)), $data);
    } catch (\RuntimeException $exception) {
        fwrite(STDERR, sprintf("ERROR: %s", $exception->getMessage()));
    }
}

