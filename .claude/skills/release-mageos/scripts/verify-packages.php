#!/usr/bin/env php
<?php
/**
 * Verify what actually changed between two Mage-OS releases by diffing the
 * built package archives, rather than trusting git history.
 *
 * Release tags sit on a diverged lineage (push-release-tag.yml creates a
 * "Release X.Y.Z" commit that is not on main), so `git compare <tag>...main`
 * reports already-shipped commits as "ahead". Comparing the published zips is
 * the only reliable way to establish the real change surface.
 *
 * Usage:
 *   verify-packages.php <PREV> <NEW> [options]
 *
 * Options:
 *   --source=HOST        where to fetch NEW from (default preview-repo.mage-os.org)
 *   --packages=a,b,c     only these packages (short names, without the mage-os/ prefix)
 *   --all                every package present in both releases (slow: 2 downloads each)
 *   --keep               keep the working directory for manual inspection
 *
 * Exit codes: 0 ok, 1 error, 64 usage.
 */

const PROD_REPO = 'repo.mage-os.org';
const DEFAULT_SOURCE = 'preview-repo.mage-os.org';
const VENDOR = 'mage-os';

// composer.json always differs (version bump), so it is never signal.
const IGNORED = ['composer.json'];

// ---------------------------------------------------------------- arguments

$args = array_slice($argv, 1);
$positional = [];
$opts = ['source' => DEFAULT_SOURCE, 'packages' => null, 'all' => false, 'keep' => false];

foreach ($args as $arg) {
    if (str_starts_with($arg, '--source=')) {
        $opts['source'] = substr($arg, 9);
    } elseif (str_starts_with($arg, '--packages=')) {
        $opts['packages'] = array_values(array_filter(array_map('trim', explode(',', substr($arg, 11)))));
    } elseif ($arg === '--all') {
        $opts['all'] = true;
    } elseif ($arg === '--keep') {
        $opts['keep'] = true;
    } elseif (str_starts_with($arg, '--')) {
        fwrite(STDERR, "Unknown option: $arg\n");
        exit(64);
    } else {
        $positional[] = $arg;
    }
}

if (count($positional) < 2) {
    fwrite(STDERR, "Usage: verify-packages.php <PREV> <NEW> [--source=HOST] [--packages=a,b,c] [--all] [--keep]\n");
    exit(64);
}

[$prev, $new] = $positional;

if (!$opts['all'] && $opts['packages'] === null) {
    fwrite(STDERR, "Specify --packages=... or --all.\n");
    fwrite(STDERR, "Start from the PRs this release should contain, map each to its package, and verify those.\n");
    exit(64);
}

// ---------------------------------------------------------------- helpers

function fetchJson(string $url): ?array
{
    $ctx = stream_context_create(['http' => ['timeout' => 60, 'ignore_errors' => true]]);
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) {
        return null;
    }
    $decoded = json_decode($body, true);
    return is_array($decoded) ? $decoded : null;
}

/** Resolve a package version's dist URL from the Composer v2 metadata. */
function distUrl(string $host, string $package, string $version): ?string
{
    $meta = fetchJson("https://$host/p2/$package.json");
    foreach ($meta['packages'][$package] ?? [] as $release) {
        if (($release['version'] ?? null) === $version) {
            return $release['dist']['url'] ?? null;
        }
    }
    return null;
}

function download(string $url, string $dest): bool
{
    $ctx = stream_context_create(['http' => ['timeout' => 300, 'ignore_errors' => true]]);
    $data = @file_get_contents($url, false, $ctx);
    if ($data === false || $data === '') {
        return false;
    }
    return file_put_contents($dest, $data) !== false;
}

function unzipTo(string $zip, string $dir): bool
{
    $archive = new ZipArchive();
    if ($archive->open($zip) !== true) {
        return false;
    }
    $ok = $archive->extractTo($dir);
    $archive->close();
    return $ok;
}

/** Relative path => sha1, for every file in a tree. */
function hashTree(string $root): array
{
    $out = [];
    if (!is_dir($root)) {
        return $out;
    }
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($it as $file) {
        if (!$file->isFile()) {
            continue;
        }
        $rel = ltrim(substr($file->getPathname(), strlen($root)), '/');
        $out[$rel] = sha1_file($file->getPathname());
    }
    ksort($out);
    return $out;
}

function rmrf(string $path): void
{
    if (!is_dir($path)) {
        @unlink($path);
        return;
    }
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($it as $entry) {
        $entry->isDir() ? @rmdir($entry->getPathname()) : @unlink($entry->getPathname());
    }
    @rmdir($path);
}

/** Every mage-os/* package present in both releases. */
function packagesInBoth(string $newHost, string $prevVersion, string $newVersion): array
{
    $names = [];
    foreach (['product-community-edition', 'magento2-base'] as $meta) {
        $data = fetchJson("https://$newHost/p2/" . VENDOR . "/$meta.json");
        foreach ($data['packages'][VENDOR . "/$meta"] ?? [] as $release) {
            if (($release['version'] ?? null) !== $newVersion) {
                continue;
            }
            foreach (array_keys($release['require'] ?? []) as $dep) {
                if (str_starts_with($dep, VENDOR . '/')) {
                    $names[] = substr($dep, strlen(VENDOR) + 1);
                }
            }
        }
    }
    $names = array_values(array_unique($names));
    sort($names);
    return $names;
}

// ---------------------------------------------------------------- run

$newHost = $opts['source'];

fwrite(STDERR, "Comparing " . VENDOR . "/* packages: $prev (" . PROD_REPO . ") -> $new ($newHost)\n");

$shortNames = $opts['all']
    ? packagesInBoth($newHost, $prev, $new)
    : $opts['packages'];

if (!$shortNames) {
    fwrite(STDERR, "No packages resolved to compare.\n");
    exit(1);
}

fwrite(STDERR, count($shortNames) . " package(s) to check\n\n");

$work = sys_get_temp_dir() . '/mageos-verify-' . getmypid();
@mkdir($work, 0777, true);

$changed = [];
$identical = [];
$skipped = [];

foreach ($shortNames as $i => $short) {
    $package = VENDOR . "/$short";
    fwrite(STDERR, sprintf("[%d/%d] %s ... ", $i + 1, count($shortNames), $package));

    $prevUrl = distUrl(PROD_REPO, $package, $prev);
    $newUrl = distUrl($newHost, $package, $new);

    if ($prevUrl === null || $newUrl === null) {
        $reason = $prevUrl === null && $newUrl === null ? 'absent from both'
            : ($prevUrl === null ? "new in $new" : "removed in $new");
        $skipped[$short] = $reason;
        fwrite(STDERR, "skip ($reason)\n");
        continue;
    }

    $base = "$work/$short";
    @mkdir($base, 0777, true);

    if (!download($prevUrl, "$base/prev.zip") || !download($newUrl, "$base/new.zip")) {
        $skipped[$short] = 'download failed';
        fwrite(STDERR, "skip (download failed)\n");
        continue;
    }

    if (!unzipTo("$base/prev.zip", "$base/prev") || !unzipTo("$base/new.zip", "$base/new")) {
        $skipped[$short] = 'unzip failed';
        fwrite(STDERR, "skip (unzip failed)\n");
        continue;
    }

    $before = hashTree("$base/prev");
    $after = hashTree("$base/new");

    foreach (IGNORED as $ignore) {
        unset($before[$ignore], $after[$ignore]);
    }

    $added = array_diff_key($after, $before);
    $removed = array_diff_key($before, $after);
    $modified = [];
    foreach ($before as $path => $hash) {
        if (isset($after[$path]) && $after[$path] !== $hash) {
            $modified[] = $path;
        }
    }

    if (!$added && !$removed && !$modified) {
        $identical[] = $short;
        fwrite(STDERR, "identical\n");
    } else {
        $changed[$short] = [
            'added' => array_keys($added),
            'removed' => array_keys($removed),
            'modified' => $modified,
        ];
        fwrite(STDERR, sprintf("CHANGED (+%d -%d ~%d)\n", count($added), count($removed), count($modified)));
    }

    if (!$opts['keep']) {
        rmrf($base);
    }
}

// ---------------------------------------------------------------- report

echo "\n";
echo "Package content changes: $prev -> $new\n";
echo str_repeat('=', 60) . "\n\n";

if ($changed) {
    foreach ($changed as $short => $delta) {
        echo VENDOR . "/$short\n";
        foreach (['added' => '+', 'removed' => '-', 'modified' => '~'] as $key => $sigil) {
            foreach ($delta[$key] as $path) {
                echo "  $sigil $path\n";
            }
        }
        echo "\n";
    }
} else {
    echo "No content changes found (composer.json version bumps excluded).\n\n";
}

echo str_repeat('-', 60) . "\n";
printf("changed: %d   identical: %d   skipped: %d\n", count($changed), count($identical), count($skipped));

if ($skipped) {
    echo "\nSkipped:\n";
    foreach ($skipped as $short => $reason) {
        echo "  " . VENDOR . "/$short — $reason\n";
    }
}

echo "\nEvery changed file above should be explained by a PR in this release.\n";
echo "Anything unexplained needs an answer before shipping.\n";

if ($opts['keep']) {
    echo "\nWorking directory kept: $work\n";
} else {
    rmrf($work);
}

exit(0);
