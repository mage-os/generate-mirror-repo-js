#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Fetch release history data from a composer repository and write history files.
 *
 * Usage:
 *     php fetch-release.php <version> [--vendor=mage-os|magento] [--dry-run]
 *
 * Sources:
 *   mage-os  → repo.mage-os.org (Composer v2 / p2 API, public)
 *   magento  → repo.magento.com (Composer v1 / provider API, requires auth
 *              via ~/.composer/auth.json)
 */

const HISTORY_ROOT = 'resource/history';

class VendorConfig
{
    public function __construct(
        public readonly string $vendor,
        public readonly string $repo,
        public readonly string $api,
        public readonly int $baseIndent,
    ) {}

    public static function get(string $vendor): self
    {
        return match ($vendor) {
            'mage-os' => new self('mage-os', 'https://repo.mage-os.org', 'v2', 2),
            'magento' => new self('magento', 'https://repo.magento.com', 'v1', 4),
            default => throw new \InvalidArgumentException("Unknown vendor '{$vendor}'. Use 'mage-os' or 'magento'."),
        };
    }
}

class HttpClient
{
    private ?string $authHeader = null;

    public function get(string $url, bool $needsAuth = false): string
    {
        $headers = [];
        if ($needsAuth) {
            $headers[] = $this->getAuthHeader();
        }

        $context = stream_context_create([
            'http' => [
                'header' => implode("\r\n", $headers),
                'timeout' => 30,
                'ignore_errors' => false,
            ],
        ]);

        $raw = @file_get_contents($url, false, $context);
        if ($raw === false) {
            throw new \RuntimeException("Failed to fetch {$url}");
        }

        $decoded = @gzdecode($raw);
        return $decoded !== false ? $decoded : $raw;
    }

    public function getJson(string $url, bool $needsAuth = false): array
    {
        return json_decode($this->get($url, $needsAuth), true, 512, JSON_THROW_ON_ERROR);
    }

    private function getAuthHeader(): string
    {
        if ($this->authHeader !== null) {
            return $this->authHeader;
        }

        $paths = array_filter([
            getenv('COMPOSER_HOME') ? getenv('COMPOSER_HOME') . '/auth.json' : null,
            getenv('HOME') . '/.composer/auth.json',
        ]);

        foreach ($paths as $path) {
            if (!file_exists($path)) {
                continue;
            }
            $auth = json_decode(file_get_contents($path), true);
            $creds = $auth['http-basic']['repo.magento.com'] ?? null;
            if ($creds) {
                $this->authHeader = 'Authorization: Basic '
                    . base64_encode($creds['username'] . ':' . $creds['password']);
                return $this->authHeader;
            }
        }

        throw new \RuntimeException('No credentials found for repo.magento.com in ~/.composer/auth.json');
    }
}

class PackageFetcher
{
    private array $providerCache = [];

    public function __construct(
        private readonly VendorConfig $config,
        private readonly HttpClient $http,
    ) {}

    public function fetch(string $packageName, string $version): array
    {
        return match ($this->config->api) {
            'v2' => $this->fetchV2($packageName, $version),
            'v1' => $this->fetchV1($packageName, $version),
        };
    }

    /**
     * Composer v2 (p2) API — repo.mage-os.org.
     * Packages listed as an array, keyed by version in each entry.
     */
    private function fetchV2(string $packageName, string $version): array
    {
        $url = "{$this->config->repo}/p2/{$packageName}.json";
        $data = $this->http->getJson($url);

        foreach ($data['packages'][$packageName] ?? [] as $pkg) {
            if (($pkg['version'] ?? '') === $version) {
                return $pkg;
            }
        }

        $this->throwNotFound($packageName, $version, array_map(
            fn($p) => $p['version'] ?? '?',
            $data['packages'][$packageName] ?? []
        ));
    }

    /**
     * Composer v1 (provider) API — repo.magento.com.
     * Requires resolving provider hashes from packages.json, returns
     * gzip-compressed JSON with versions keyed by version string.
     */
    private function fetchV1(string $packageName, string $version): array
    {
        $this->loadProviderCache();

        $pkgHash = $this->providerCache[$packageName] ?? null;
        if ($pkgHash === null) {
            throw new \RuntimeException("Package {$packageName} not found in repository provider index.");
        }

        $url = "{$this->config->repo}/p/{$packageName}\${$pkgHash}.json";
        $data = $this->http->getJson($url, needsAuth: true);

        $packages = $data['packages'][$packageName] ?? [];
        if (isset($packages[$version])) {
            return $packages[$version];
        }

        $this->throwNotFound($packageName, $version, array_keys($packages));
    }

    private function loadProviderCache(): void
    {
        if (!empty($this->providerCache)) {
            return;
        }

        $root = $this->http->getJson("{$this->config->repo}/packages.json", needsAuth: true);

        foreach ($root['provider-includes'] ?? [] as $template => $hashData) {
            $hash = $hashData['sha256'] ?? '';
            $url = $this->config->repo . '/' . str_replace('%hash%', $hash, $template);
            $providerData = $this->http->getJson($url, needsAuth: true);
            foreach ($providerData['providers'] ?? [] as $name => $nameHash) {
                $this->providerCache[$name] = $nameHash['sha256'] ?? '';
            }
        }
    }

    private function throwNotFound(string $packageName, string $version, array $available): never
    {
        $available = array_unique($available);
        sort($available, SORT_NATURAL);
        $recent = array_slice($available, -20);

        throw new \RuntimeException(sprintf(
            "Version %s not found for %s.\nAvailable versions: %s",
            $version,
            $packageName,
            implode(', ', $recent)
        ));
    }
}

class HistoryFileBuilder
{
    public function __construct(
        private readonly string $vendor,
    ) {}

    public function buildMagento2Base(array $pkg): array
    {
        return [
            'name' => $pkg['name'],
            'description' => $pkg['description'] ?? '',
            'type' => $pkg['type'] ?? '',
            'license' => $pkg['license'] ?? [],
            'version' => $pkg['version'],
            'require' => $pkg['require'] ?? [],
            'conflict' => $pkg['conflict'] ?? (object)[],
            'replace' => $pkg['replace'] ?? (object)[],
            'extra' => $pkg['extra'] ?? (object)[],
        ];
    }

    /**
     * @param array $pkg           Upstream product-community-edition package data
     * @param array $basePkg       The full magento2-base package data for this version
     * @param ?array $prevData     Previous version's product-community-edition history (or null)
     */
    public function buildProductCommunityEdition(array $pkg, array $basePkg, ?array $prevData): array
    {
        $req = $pkg['require'] ?? [];

        // Add-on = anything in product-ce require that is NOT already provided by
        // magento2-base (via its require or replace sections). The generation code
        // also injects {vendor}/magento2-base explicitly, so exclude that too.
        $basePackages = ($basePkg['require'] ?? []) + ($basePkg['replace'] ?? []);
        $basePackages["{$this->vendor}/magento2-base"] = true;
        $addons = array_diff_key($req, $basePackages);

        // Report new/removed relative to previous version history.
        $prevKeys = array_keys($prevData['require'] ?? []);
        $newPackages = array_diff(array_keys($addons), $prevKeys);
        if ($newPackages) {
            sort($newPackages);
            echo "  New add-on packages detected: " . implode(', ', $newPackages) . "\n";
        }

        $removed = array_diff($prevKeys, array_keys($addons));
        if ($removed) {
            sort($removed);
            echo "  Removed add-on packages: " . implode(', ', $removed) . "\n";
        }

        ksort($addons);

        $result = ['require' => $addons];

        $magentoVersion = $pkg['extra']['magento_version'] ?? '';
        if ($this->vendor === 'mage-os' && $magentoVersion !== '') {
            $result['extra'] = ['magento_version' => $magentoVersion];
        }

        return $result;
    }

    public function buildProjectCommunityEdition(array $pkg): array
    {
        $req = $pkg['require'] ?? [];
        unset($req["{$this->vendor}/product-community-edition"]);
        return ['require' => $req];
    }
}

class HistoryFileWriter
{
    public function __construct(
        private readonly string $vendor,
    ) {}

    public function write(string $subdir, string $version, array $data, int $indent, bool $dryRun): string
    {
        $path = HISTORY_ROOT . '/' . $this->vendor . '/' . $subdir . '/' . $version . '.json';
        $content = $this->formatJson($data, $indent) . "\n";

        if ($dryRun) {
            echo "  Would write: {$path} (" . strlen($content) . " bytes)\n";
            return $path;
        }

        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        file_put_contents($path, $content);
        echo "  Wrote: {$path} (" . strlen($content) . " bytes)\n";
        return $path;
    }

    public function validate(string $path): void
    {
        json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    private function formatJson(array $data, int $indentSpaces): string
    {
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($indentSpaces === 4) {
            return $json;
        }
        return str_replace('    ', str_repeat(' ', $indentSpaces), $json);
    }
}

class ReleaseHistoryCommand
{
    private VendorConfig $config;
    private PackageFetcher $fetcher;
    private HistoryFileBuilder $builder;
    private HistoryFileWriter $writer;

    public function __construct(
        private readonly string $vendor,
        private readonly string $version,
        private readonly bool $dryRun,
    ) {
        $this->config = VendorConfig::get($vendor);
        $http = new HttpClient();
        $this->fetcher = new PackageFetcher($this->config, $http);
        $this->writer = new HistoryFileWriter($vendor);
    }

    public function run(): int
    {
        if (!$this->checkExistingFiles()) {
            return 1;
        }

        [$prevName, $prevData] = $this->getPreviousVersion();

        $this->builder = new HistoryFileBuilder($this->vendor);

        return $this->fetchAndWrite($prevData);
    }

    private function checkExistingFiles(): bool
    {
        foreach (['magento2-base', 'product-community-edition', 'project-community-edition'] as $subdir) {
            $path = HISTORY_ROOT . '/' . $this->vendor . '/' . $subdir . '/' . $this->version . '.json';
            if (file_exists($path)) {
                fwrite(STDERR, "ERROR: {$path} already exists. Remove it first to regenerate.\n");
                return false;
            }
        }
        return true;
    }

    private function getPreviousVersion(): array
    {
        $historyDir = HISTORY_ROOT . '/' . $this->vendor . '/product-community-edition';
        if (!is_dir($historyDir)) {
            echo "No previous version found — will include all non-core packages\n";
            return [null, null];
        }

        $versions = [];
        foreach (glob($historyDir . '/*.json') as $file) {
            $versions[basename($file, '.json')] = $file;
        }
        uksort($versions, 'version_compare');

        $prior = null;
        $priorPath = null;
        foreach ($versions as $v => $path) {
            if (version_compare($v, $this->version, '>=')) {
                break;
            }
            $prior = $v;
            $priorPath = $path;
        }

        if ($prior === null) {
            echo "No previous version found — will include all non-core packages\n";
            return [null, null];
        }

        echo "Previous version: {$prior}\n";
        $data = json_decode(file_get_contents($priorPath), true, 512, JSON_THROW_ON_ERROR);
        return [$prior, $data];
    }

    /**
     * Get the Magento upstream composer.json that drives the generation process.
     *
     * The generation code reads the root composer.json from the Magento git repo.
     * Its require + replace sections define what's "core" — anything in
     * product-ce's require that ISN'T in the upstream is an add-on.
     *
     * For Magento vendor the tag is the release version itself.
     * For Mage-OS vendor the tag is extra.magento_version from product-ce.
     */
    private function getUpstreamBase(array $productCePkg): array
    {
        if ($this->vendor === 'mage-os') {
            $tag = $productCePkg['extra']['magento_version'] ?? '';
            if ($tag === '') {
                throw new \RuntimeException('No magento_version in product-ce extra; cannot determine upstream.');
            }
        } else {
            $tag = $this->version;
        }

        echo "  Fetching Magento upstream composer.json for tag {$tag}...\n";
        $url = "https://raw.githubusercontent.com/magento/magento2/refs/tags/{$tag}/composer.json";
        $http = new HttpClient();
        $upstream = $http->getJson($url);

        // Rename magento/ → {vendor}/ so the diff matches product-ce package names.
        $renamed = [];
        foreach (($upstream['require'] ?? []) + ($upstream['replace'] ?? []) as $name => $ver) {
            $renamedName = str_starts_with($name, 'magento/')
                ? "{$this->vendor}/" . substr($name, 8)
                : $name;
            $renamed[$renamedName] = $ver;
        }

        return ['require' => $renamed, 'replace' => []];
    }

    private function fetchAndWrite(?array $prevData): int
    {
        $v = $this->vendor;
        echo "\nFetching packages for {$v} {$this->version}...\n";

        try {
            echo "\n1. {$v}/magento2-base\n";
            $basePkg = $this->fetcher->fetch("{$v}/magento2-base", $this->version);
            $baseData = $this->builder->buildMagento2Base($basePkg);

            echo "\n2. {$v}/product-community-edition\n";
            $productCePkg = $this->fetcher->fetch("{$v}/product-community-edition", $this->version);
            $upstreamBase = $this->getUpstreamBase($productCePkg);
            $productData = $this->builder->buildProductCommunityEdition(
                $productCePkg,
                $upstreamBase,
                $prevData
            );

            echo "\n3. {$v}/project-community-edition\n";
            $projectData = $this->builder->buildProjectCommunityEdition(
                $this->fetcher->fetch("{$v}/project-community-edition", $this->version)
            );
        } catch (\RuntimeException $e) {
            fwrite(STDERR, "ERROR: {$e->getMessage()}\n");
            return 1;
        }

        $label = $this->dryRun ? ' (dry run)' : '';
        echo "\nWriting history files{$label}...\n";

        $baseIndent = $this->config->baseIndent;
        $paths = [];
        $paths[] = $this->writer->write('magento2-base', $this->version, $baseData, $baseIndent, $this->dryRun);
        $paths[] = $this->writer->write('product-community-edition', $this->version, $productData, 2, $this->dryRun);
        $paths[] = $this->writer->write('project-community-edition', $this->version, $projectData, 2, $this->dryRun);

        if (!$this->dryRun) {
            echo "\nValidating JSON...\n";
            foreach ($paths as $path) {
                try {
                    $this->writer->validate($path);
                    echo "  OK: {$path}\n";
                } catch (\JsonException $e) {
                    fwrite(STDERR, "  INVALID: {$path}: {$e->getMessage()}\n");
                    return 1;
                }
            }
        }

        echo "\nDone.\n";
        return 0;
    }
}

// ── CLI entry point ─────────────────────────────────────────────────────

$vendor = 'mage-os';
$version = null;
$dryRun = false;

foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--dry-run') {
        $dryRun = true;
    } elseif (str_starts_with($arg, '--vendor=')) {
        $vendor = substr($arg, 9);
    } elseif ($arg === '--help' || $arg === '-h') {
        echo "Usage: php fetch-release.php <version> [--vendor=mage-os|magento] [--dry-run]\n";
        exit(0);
    } elseif ($version === null) {
        $version = $arg;
    }
}

if ($version === null) {
    fwrite(STDERR, "Usage: php fetch-release.php <version> [--vendor=mage-os|magento] [--dry-run]\n");
    exit(1);
}

try {
    $command = new ReleaseHistoryCommand($vendor, $version, $dryRun);
    exit($command->run());
} catch (\InvalidArgumentException $e) {
    fwrite(STDERR, "ERROR: {$e->getMessage()}\n");
    exit(1);
}
