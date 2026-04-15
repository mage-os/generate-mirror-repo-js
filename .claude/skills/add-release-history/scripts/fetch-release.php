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

class CorePackageDetector
{
    private const CORE_PREFIXES = [
        'colinmollenhour/', 'composer/', 'duosecurity/', 'elasticsearch/',
        'ext-', 'ezyang/', 'guzzlehttp/', 'laminas/', 'league/', 'lib-',
        'monolog/', 'opensearch-', 'pelago/', 'php-amqplib/', 'phpseclib/',
        'psr/', 'ramsey/', 'symfony/', 'tedivm/', 'tubalmartin/',
        'web-token/', 'webonyx/', 'wikimedia/',
    ];

    private const CORE_SUFFIXES = [
        'composer', 'composer-dependency-version-audit-plugin',
        'framework', 'framework-amqp', 'framework-bulk', 'framework-message-queue',
        'magento-composer-installer', 'magento-zf-db', 'magento2-base',
        'theme-adminhtml-backend', 'theme-frontend-blank', 'theme-frontend-luma',
        'zend-cache', 'zend-db', 'zend-pdf',
    ];

    /** @param list<string> $addonModuleNames module-* packages that are known add-ons */
    public function __construct(
        private readonly string $vendor,
        private readonly array $addonModuleNames = [],
    ) {}

    public function isCore(string $name): bool
    {
        if ($name === 'php') {
            return true;
        }

        foreach (self::CORE_PREFIXES as $prefix) {
            if (str_starts_with($name, $prefix)) {
                return true;
            }
        }

        foreach (self::CORE_SUFFIXES as $suffix) {
            if ($name === "{$this->vendor}/{$suffix}") {
                return true;
            }
        }

        if (str_starts_with($name, "{$this->vendor}/language-")) {
            return true;
        }

        if (str_starts_with($name, "{$this->vendor}/module-")
            && !in_array($name, $this->addonModuleNames, true)) {
            return true;
        }

        // For magento vendor, all magento/* packages are core
        if ($this->vendor === 'magento' && str_starts_with($name, 'magento/')) {
            return true;
        }

        return false;
    }
}

class HistoryFileBuilder
{
    public function __construct(
        private readonly string $vendor,
        private readonly CorePackageDetector $detector,
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

    public function buildProductCommunityEdition(array $pkg, ?array $prevData): array
    {
        $req = $pkg['require'] ?? [];

        $addonKeys = [];
        if ($prevData !== null) {
            $addonKeys = array_keys($prevData['require'] ?? []);
        }
        $addonKeys = array_flip($addonKeys);

        $newPackages = [];
        foreach ($req as $name => $ver) {
            if (!isset($addonKeys[$name]) && !$this->detector->isCore($name)) {
                $addonKeys[$name] = true;
                $newPackages[] = $name;
            }
        }

        if ($newPackages) {
            sort($newPackages);
            echo "  New add-on packages detected: " . implode(', ', $newPackages) . "\n";
        }

        $removed = array_diff(array_keys($addonKeys), array_keys($req));
        if ($removed) {
            sort($removed);
            echo "  Removed add-on packages: " . implode(', ', $removed) . "\n";
            foreach ($removed as $r) {
                unset($addonKeys[$r]);
            }
        }

        $filtered = [];
        $keys = array_keys($addonKeys);
        sort($keys);
        foreach ($keys as $key) {
            if (isset($req[$key])) {
                $filtered[$key] = $req[$key];
            }
        }

        $result = ['require' => $filtered];

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

        $addonModuleNames = [];
        if ($prevData !== null) {
            foreach (array_keys($prevData['require'] ?? []) as $key) {
                if (str_starts_with($key, "{$this->vendor}/module-")) {
                    $addonModuleNames[] = $key;
                }
            }
        }

        $detector = new CorePackageDetector($this->vendor, $addonModuleNames);
        $this->builder = new HistoryFileBuilder($this->vendor, $detector);

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

    private function fetchAndWrite(?array $prevData): int
    {
        $v = $this->vendor;
        echo "\nFetching packages for {$v} {$this->version}...\n";

        try {
            echo "\n1. {$v}/magento2-base\n";
            $baseData = $this->builder->buildMagento2Base(
                $this->fetcher->fetch("{$v}/magento2-base", $this->version)
            );

            echo "\n2. {$v}/product-community-edition\n";
            $productData = $this->builder->buildProductCommunityEdition(
                $this->fetcher->fetch("{$v}/product-community-edition", $this->version),
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
