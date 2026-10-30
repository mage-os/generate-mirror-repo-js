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
 *
 * Both versions are also resolved in full with composer, so the report covers
 * packages that arrive transitively behind a newly bundled one. A metapackage
 * diff alone cannot see those: bundling a single package can pull in a dozen.
 * Pass --no-resolve to skip it (needs composer on PATH and a few minutes).
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
    $resolve = true;

    foreach (array_slice($argv, 1) as $arg) {
        if (str_starts_with($arg, '--source=')) {
            $source = str_replace('--source=', '', $arg);
            $source = str_replace('https://', '', $source);
        } elseif ($arg === '--no-resolve') {
            $resolve = false;
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
        'resolve' => $resolve,
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

/**
 * Resolve a metapackage's require set in full, the way an install would.
 *
 * The metapackage diff only sees direct requires, so a newly bundled package
 * hides whatever it depends on. Mage-OS 4.0.0 bundled one assistant package
 * and quietly gained 24 third-party packages behind it, none of which showed
 * up in the diff. Resolving both versions is the only way to report that.
 *
 * Returns ['packages' => [name => version]] or ['error' => '...'].
 */
function resolveTree(string $repoUrl, array $require): array
{
    $dir = sys_get_temp_dir() . '/mageos-resolve-' . bin2hex(random_bytes(6));
    if (!mkdir($dir, 0777, true)) {
        return ['error' => "Could not create {$dir}"];
    }

    $root = [
        'name' => 'mageos/release-analysis',
        'require' => $require,
        'repositories' => [
            ['type' => 'composer', 'url' => $repoUrl],
            ['type' => 'composer', 'url' => 'https://repo.packagist.org'],
        ],
        'minimum-stability' => 'stable',
        'prefer-stable' => true,
    ];
    file_put_contents($dir . '/composer.json', json_encode($root, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

    // --ignore-platform-reqs so the analysis does not depend on the PHP and
    // extensions of whoever runs it; this asks about package availability.
    $cmd = 'cd ' . escapeshellarg($dir)
        . ' && COMPOSER_NO_AUDIT=1 COMPOSER_NO_INTERACTION=1 composer update'
        . ' --dry-run --ignore-platform-reqs --no-plugins 2>&1';

    exec($cmd, $output, $status);
    $text = implode("\n", $output);

    array_map('unlink', glob($dir . '/*') ?: []);
    @rmdir($dir);

    if ($status !== 0) {
        // A non-zero status here usually means the release cannot be installed
        // at all, which is worth failing loudly over rather than reporting an
        // empty tree. A version pinned from a git tag that was never published
        // to Packagist lands exactly here.
        return ['error' => 'composer could not resolve the release', 'composer_output' => $text];
    }

    $packages = [];
    foreach ($output as $line) {
        if (preg_match('/- Locking (\S+) \(([^)]+)\)/', $line, $m)) {
            $packages[$m[1]] = $m[2];
        }
    }

    if ($packages === []) {
        return ['error' => 'resolved, but no locked packages were parsed', 'composer_output' => $text];
    }

    return ['packages' => $packages];
}

/**
 * Diff two resolved trees, separating packages that are newly bundled on
 * purpose from the ones that merely came along behind them.
 */
function diffResolved(array $prev, array $new, array $directRequire): array
{
    $added = [];
    $transitiveOnly = [];
    foreach ($new as $name => $version) {
        if (!isset($prev[$name])) {
            $added[$name] = $version;
            if (!isset($directRequire[$name])) {
                $transitiveOnly[$name] = $version;
            }
        }
    }

    $removed = [];
    foreach ($prev as $name => $version) {
        if (!isset($new[$name])) {
            $removed[$name] = $version;
        }
    }

    $changed = [];
    foreach ($new as $name => $version) {
        if (isset($prev[$name]) && $prev[$name] !== $version) {
            $changed[$name] = ['old' => $prev[$name], 'new' => $version];
        }
    }

    ksort($added);
    ksort($transitiveOnly);
    ksort($removed);
    ksort($changed);

    return [
        'prev_total' => count($prev),
        'new_total' => count($new),
        'added' => $added,
        'added_transitive_only' => $transitiveOnly,
        'removed' => $removed,
        'changed' => $changed,
    ];
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

    // The resolved-tree diff. Only product-community-edition is resolved: it is
    // the metapackage that carries the bundled add-ons, and the other two sit
    // inside its tree anyway.
    if ($args['resolve']) {
        $pce = $result['packages']['product-community-edition'] ?? [];
        if (isset($pce['new_require'], $pce['prev_require'])) {
            fwrite(STDERR, "Resolving {$newVersion} in full (this takes a few minutes)...\n");
            $newTree = resolveTree($sourceUrl, $pce['new_require']);

            fwrite(STDERR, "Resolving {$prevVersion} in full...\n");
            $prevTree = resolveTree(PRODUCTION_REPO, $pce['prev_require']);

            if (isset($newTree['error']) || isset($prevTree['error'])) {
                $result['resolved'] = [
                    'error' => $newTree['error'] ?? $prevTree['error'],
                    'failed_version' => isset($newTree['error']) ? $newVersion : $prevVersion,
                    'composer_output' => $newTree['composer_output'] ?? $prevTree['composer_output'] ?? null,
                ];
                fwrite(STDERR, "WARNING: full resolution failed; see 'resolved.error' in the report\n");
            } else {
                $result['resolved'] = diffResolved(
                    $prevTree['packages'],
                    $newTree['packages'],
                    $pce['new_require']
                );
            }
        }
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

    if (isset($result['resolved']['added'])) {
        $result['summary']['resolved_packages_added'] = count($result['resolved']['added']);
        $result['summary']['resolved_packages_added_transitive_only'] =
            count($result['resolved']['added_transitive_only']);
        $result['summary']['resolved_total'] = $result['resolved']['new_total'];
    } elseif (isset($result['resolved']['error'])) {
        $result['summary']['resolution_failed'] = $result['resolved']['failed_version'];
    }

    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
}

main();
