#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Fetch and compare Mage-OS release data from composer repositories.
 *
 * Fetches the three metapackages (product-community-edition, magento2-base,
 * project-community-edition) for two versions and produces a structured JSON
 * diff of all dependency changes.
 *
 * Usage:
 *     php fetch-release-data.php <previous-version> <new-version> [--source=<repo-url>]
 *
 * Examples:
 *     php fetch-release-data.php 2.2.1 2.2.2
 *     php fetch-release-data.php 2.2.1 2.2.2 --source=repo.mage-os.org
 *
 * The --source flag controls where the NEW version is fetched from.
 * The previous version is always fetched from repo.mage-os.org (production).
 * Default source: preview-repo.mage-os.org
 */

const PACKAGES = [
    'mage-os/product-community-edition',
    'mage-os/magento2-base',
    'mage-os/project-community-edition',
];

const PRODUCTION_REPO = 'https://repo.mage-os.org';
const PREVIEW_REPO = 'https://preview-repo.mage-os.org';

function parseArgs(array $argv): array
{
    $positional = [];
    $source = 'preview-repo.mage-os.org';

    foreach (array_slice($argv, 1) as $arg) {
        if (str_starts_with($arg, '--source=')) {
            $source = str_replace('--source=', '', $arg);
            $source = str_replace('https://', '', $source);
        } elseif (!str_starts_with($arg, '-')) {
            $positional[] = $arg;
        }
    }

    if (count($positional) < 2) {
        fwrite(STDERR, "Usage: php fetch-release-data.php <previous-version> <new-version> [--source=<repo-url>]\n");
        fwrite(STDERR, "Example: php fetch-release-data.php 2.2.1 2.2.2\n");
        exit(1);
    }

    return [
        'prevVersion' => $positional[0],
        'newVersion' => $positional[1],
        'sourceUrl' => str_starts_with($source, 'https://') ? $source : 'https://' . $source,
    ];
}

function fetchJson(string $url): array
{
    $context = stream_context_create([
        'http' => [
            'timeout' => 30,
            'header' => "User-Agent: MageOS-Release-Analyzer/1.0\r\n",
        ],
    ]);

    $content = @file_get_contents($url, false, $context);
    if ($content === false) {
        throw new RuntimeException("Failed to fetch: {$url}");
    }

    $decoded = json_decode($content, true, 512, JSON_THROW_ON_ERROR);
    return $decoded;
}

function fetchPackageVersion(string $repoUrl, string $packageName, string $version): ?array
{
    $encodedName = str_replace('/', '/', $packageName);
    $url = "{$repoUrl}/p2/{$encodedName}.json";

    try {
        $data = fetchJson($url);
    } catch (RuntimeException $e) {
        fwrite(STDERR, "Warning: Could not fetch {$packageName} from {$repoUrl}: {$e->getMessage()}\n");
        return null;
    }

    $packages = $data['packages'][$packageName] ?? [];

    foreach ($packages as $entry) {
        if (($entry['version'] ?? '') === $version) {
            return $entry;
        }
    }

    fwrite(STDERR, "Warning: Version {$version} of {$packageName} not found at {$repoUrl}\n");
    return null;
}

function diffRequire(array $oldRequire, array $newRequire): array
{
    $added = [];
    $removed = [];
    $changed = [];
    $unchanged = [];

    foreach ($newRequire as $pkg => $constraint) {
        if (!isset($oldRequire[$pkg])) {
            $added[$pkg] = $constraint;
        } elseif ($oldRequire[$pkg] !== $constraint) {
            $changed[$pkg] = [
                'old' => $oldRequire[$pkg],
                'new' => $constraint,
            ];
        } else {
            $unchanged[$pkg] = $constraint;
        }
    }

    foreach ($oldRequire as $pkg => $constraint) {
        if (!isset($newRequire[$pkg])) {
            $removed[$pkg] = $constraint;
        }
    }

    return compact('added', 'removed', 'changed', 'unchanged');
}

function classifyChange(string $old, string $new, string $prevVersion, string $newVersion): string
{
    // Trivial version pin bump (e.g. "2.2.1" → "2.2.2")
    if ($old === $prevVersion && $new === $newVersion) {
        return 'version-bump';
    }

    return 'constraint-change';
}

function main(): void
{
    $args = parseArgs($GLOBALS['argv']);
    $newVersion = $args['newVersion'];
    $prevVersion = $args['prevVersion'];
    $sourceUrl = $args['sourceUrl'];

    $result = [
        'new_version' => $newVersion,
        'previous_version' => $prevVersion,
        'source' => $sourceUrl,
        'production_repo' => PRODUCTION_REPO,
        'packages' => [],
    ];

    foreach (PACKAGES as $packageName) {
        $shortName = basename($packageName);

        fwrite(STDERR, "Fetching {$shortName} {$newVersion} from {$sourceUrl}...\n");
        $newPkg = fetchPackageVersion($sourceUrl, $packageName, $newVersion);

        fwrite(STDERR, "Fetching {$shortName} {$prevVersion} from " . PRODUCTION_REPO . "...\n");
        $prevPkg = fetchPackageVersion(PRODUCTION_REPO, $packageName, $prevVersion);

        if (!$newPkg || !$prevPkg) {
            $result['packages'][$shortName] = [
                'error' => 'Could not fetch one or both versions',
                'new_found' => $newPkg !== null,
                'prev_found' => $prevPkg !== null,
            ];
            continue;
        }

        $newRequire = $newPkg['require'] ?? [];
        $prevRequire = $prevPkg['require'] ?? [];

        $diff = diffRequire($prevRequire, $newRequire);

        // Classify changes as trivial version bumps vs meaningful
        $meaningfulChanges = [];
        $trivialBumps = [];
        foreach ($diff['changed'] as $pkg => $change) {
            $type = classifyChange($change['old'], $change['new'], $prevVersion, $newVersion);
            if ($type === 'version-bump') {
                $trivialBumps[$pkg] = $change;
            } else {
                $meaningfulChanges[$pkg] = $change;
            }
        }

        $packageResult = [
            'new_require' => $newRequire,
            'prev_require' => $prevRequire,
            'diff' => [
                'added' => $diff['added'],
                'removed' => $diff['removed'],
                'meaningful_changes' => $meaningfulChanges,
                'trivial_version_bumps' => $trivialBumps,
                'trivial_bump_count' => count($trivialBumps),
                'unchanged' => $diff['unchanged'],
            ],
        ];

        // Include extra metadata if present
        $newExtra = $newPkg['extra'] ?? [];
        $prevExtra = $prevPkg['extra'] ?? [];
        if (isset($newExtra['magento_version']) || isset($prevExtra['magento_version'])) {
            $packageResult['magento_version'] = [
                'new' => $newExtra['magento_version'] ?? null,
                'prev' => $prevExtra['magento_version'] ?? null,
                'changed' => ($newExtra['magento_version'] ?? null) !== ($prevExtra['magento_version'] ?? null),
            ];
        }

        $result['packages'][$shortName] = $packageResult;
    }

    // Summary
    $totalMeaningful = 0;
    $totalAdded = 0;
    $totalRemoved = 0;
    foreach ($result['packages'] as $pkg) {
        if (isset($pkg['error'])) {
            continue;
        }
        $totalMeaningful += count($pkg['diff']['meaningful_changes']);
        $totalAdded += count($pkg['diff']['added']);
        $totalRemoved += count($pkg['diff']['removed']);
    }

    $result['summary'] = [
        'meaningful_changes' => $totalMeaningful,
        'added_dependencies' => $totalAdded,
        'removed_dependencies' => $totalRemoved,
    ];

    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
}

main();
