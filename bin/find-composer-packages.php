#!/usr/bin/env php
<?php

/*
 * Reads PHP classes from stdin, separated by newlines. Prints composer package name for each class.
 *
 * Each package is only printed once.
 * Classes for which no composer package can be found are ignored.
 */

/** @var ClassLoader $loader */

use Composer\Autoload\ClassLoader;

if (! isset($argv[1])) {
    fwrite(STDERR, sprintf("ERROR: Required argument missing:\n"));
    fwrite(STDERR, sprintf("Specify the path to vendor/autoload.php as an argument to %s\n", basename($argv[0])));
    exit(1);
}

if (! file_exists($argv[1])) {
    fwrite(STDERR, sprintf("ERROR: Unable to find composer autoload.php file \"%s\"\n", $argv[1]));
    exit(2);
}

$loader = require($argv[1]);

// Get length of file path (returned by $loader) up to package dir inside composer
$needle = 'vendor/composer/../';
$prefix = strstr($loader->findFile(get_class($loader)), $needle, /* before_needle */ true) . $needle;
define('PATH_PREFIX_LEN', strlen($prefix));

function getPackageForClass(ClassLoader $loader, string $class)
{
    if ('' === $class || !($file = $loader->findFile($class))) {
        return false;
    }

    $pathInVendor    = substr($file, PATH_PREFIX_LEN);
    $isOutsideVendor = substr($pathInVendor, 0, 3) === '../';
    if ($isOutsideVendor) {
        return false;
    }
    $firstSlashPos  = strpos($pathInVendor, '/');
    $secondSlashPos = strpos($pathInVendor, '/', $firstSlashPos + 1);

    return substr($pathInVendor, 0, $secondSlashPos);
}

$done = [];
while (!feof(STDIN)) {
    $class   = ltrim(trim(fgets(STDIN)), '\\');
    $classes = [$class];

    // build base name variations for generated classes based on dependency
    if (preg_match('/^(.+)Factory$/', $class, $m)) {
        $classes[] = $m[1];
    }
    $packages = array_map(fn($class) => getPackageForClass($loader, $class), $classes);
    foreach ($packages as $package) {
        if ($package === false || array_key_exists($package, $done)) {
            continue;
        }
        try {
            $version = \Composer\InstalledVersions::getVersion($package);
            $done[$package] = true;
            $depVersion = substr($version, 0, strrpos($version, '.'));
            echo "\"$package\": \"$depVersion\"\n";
        } catch (OutOfBoundsException $exception) {
            // ignore package
        }
    }
}
