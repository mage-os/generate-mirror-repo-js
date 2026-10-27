const {translatePatch} = require('../../src/patch-translate');

// A stand-in for what buildPackageMap reads out of a git ref, covering the three
// shapes that matter: a module, a nested package, and the parent that contains it.
const packageMap = new Map([
  ['magento/module-cms', 'app/code/Magento/Cms'],
  ['magento/module-media-gallery-ui-api', 'app/code/Magento/MediaGalleryUiApi'],
  ['magento/framework', 'lib/internal/Magento/Framework'],
  ['magento/framework-amqp', 'lib/internal/Magento/Framework/Amqp'],
  ['magento/theme-frontend-luma', 'app/design/frontend/Magento/luma'],
]);

const toSource = (patch) => translatePatch(patch, packageMap, 'to-source');
const toVendor = (patch) => translatePatch(patch, packageMap, 'to-vendor');

describe('translatePatch to-source', () => {
  it('rewrites git diff headers and file markers', () => {
    const patch = [
      'diff --git a/vendor/magento/module-cms/Model/Page.php b/vendor/magento/module-cms/Model/Page.php',
      'index 7acd00c..396b08a 100644',
      '--- a/vendor/magento/module-cms/Model/Page.php',
      '+++ b/vendor/magento/module-cms/Model/Page.php',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    const {text, stats} = toSource(patch);

    expect(text).toContain('diff --git a/app/code/Magento/Cms/Model/Page.php b/app/code/Magento/Cms/Model/Page.php');
    expect(text).toContain('--- a/app/code/Magento/Cms/Model/Page.php');
    expect(text).toContain('+++ b/app/code/Magento/Cms/Model/Page.php');
    expect(stats.translated).toBe(4);
    expect(stats.untranslated).toEqual([]);
  });

  it('handles markers without a/ b/ prefixes', () => {
    const patch = [
      '--- vendor/magento/module-cms/Model/Page.php',
      '+++ vendor/magento/module-cms/Model/Page.php',
    ].join('\n');

    expect(toSource(patch).text).toBe([
      '--- app/code/Magento/Cms/Model/Page.php',
      '+++ app/code/Magento/Cms/Model/Page.php',
    ].join('\n'));
  });

  it('preserves trailing timestamps on file markers', () => {
    const patch = '--- vendor/magento/module-cms/Model/Page.php\t2026-08-11 10:00:00.000000000 +0000';

    expect(toSource(patch).text)
      .toBe('--- app/code/Magento/Cms/Model/Page.php\t2026-08-11 10:00:00.000000000 +0000');
  });

  it('leaves /dev/null alone for added files', () => {
    const patch = [
      '--- /dev/null',
      '+++ b/vendor/magento/module-cms/Model/New.php',
    ].join('\n');

    const {text, stats} = toSource(patch);

    expect(text).toContain('--- /dev/null');
    expect(text).toContain('+++ b/app/code/Magento/Cms/Model/New.php');
    expect(stats.untranslated).toEqual([]);
  });

  it('prefers the deepest matching package', () => {
    const patch = '--- a/vendor/magento/framework-amqp/Config.php';

    expect(toSource(patch).text).toBe('--- a/lib/internal/Magento/Framework/Amqp/Config.php');
  });

  it('accepts mage-os vendor names for packages declared as magento in source', () => {
    const patch = '--- a/vendor/mage-os/module-cms/Model/Page.php';

    expect(toSource(patch).text).toBe('--- a/app/code/Magento/Cms/Model/Page.php');
  });

  it('rewrites rename headers', () => {
    const patch = [
      'rename from vendor/magento/module-cms/Model/Old.php',
      'rename to vendor/magento/module-cms/Model/New.php',
    ].join('\n');

    expect(toSource(patch).text).toBe([
      'rename from app/code/Magento/Cms/Model/Old.php',
      'rename to app/code/Magento/Cms/Model/New.php',
    ].join('\n'));
  });

  it('rewrites binary file markers', () => {
    const patch = 'Binary files a/vendor/magento/module-cms/logo.png and b/vendor/magento/module-cms/logo.png differ';

    expect(toSource(patch).text)
      .toBe('Binary files a/app/code/Magento/Cms/logo.png and b/app/code/Magento/Cms/logo.png differ');
  });

  it('reports unknown packages instead of mangling them', () => {
    const patch = '--- a/vendor/acme/module-unknown/Model/Thing.php';
    const {text, stats} = toSource(patch);

    expect(text).toBe(patch);
    expect(stats.translated).toBe(0);
    expect(stats.untranslated).toEqual(['vendor/acme/module-unknown/Model/Thing.php']);
  });

  it('leaves hunk bodies untouched even when they look like paths', () => {
    const patch = [
      '--- a/vendor/magento/module-cms/Model/Page.php',
      '+++ b/vendor/magento/module-cms/Model/Page.php',
      '@@ -1,2 +1,2 @@',
      "-require 'vendor/magento/module-cms/bootstrap.php';",
      "+require 'vendor/magento/module-cms/bootstrap2.php';",
    ].join('\n');

    const {text} = toSource(patch);

    expect(text).toContain("-require 'vendor/magento/module-cms/bootstrap.php';");
    expect(text).toContain("+require 'vendor/magento/module-cms/bootstrap2.php';");
  });
});

describe('translatePatch to-vendor', () => {
  it('inverts the source mapping', () => {
    const patch = '--- a/app/code/Magento/MediaGalleryUiApi/etc/acl.xml';

    expect(toVendor(patch).text).toBe('--- a/vendor/magento/module-media-gallery-ui-api/etc/acl.xml');
  });

  it('round-trips without loss', () => {
    const original = [
      'diff --git a/app/code/Magento/Cms/Model/Page.php b/app/code/Magento/Cms/Model/Page.php',
      '--- a/app/code/Magento/Cms/Model/Page.php',
      '+++ b/app/code/Magento/Cms/Model/Page.php',
      '--- a/lib/internal/Magento/Framework/Amqp/Config.php',
      '--- a/app/design/frontend/Magento/luma/web/css/source/_theme.less',
    ].join('\n');

    const vendored = toVendor(original).text;

    expect(vendored).not.toBe(original);
    expect(toSource(vendored).text).toBe(original);
  });
});

describe('translatePatch validation', () => {
  it('rejects an unknown direction', () => {
    expect(() => translatePatch('', packageMap, 'sideways')).toThrow(/Unknown direction/);
  });
});

describe('translatePatch cases found in the upstream quality-patches corpus', () => {
  // Packages whose repository root is the package container, so the module
  // directory sits at the top level rather than under app/code/Magento.
  const withRootPackages = new Map([
    ...packageMap,
    ['magento/module-inventory-catalog', 'InventoryCatalog'],
    ['magento/magento2-base', ''],
  ]);

  const toSourceWith = (patch, map = withRootPackages) =>
    translatePatch(patch, map, 'to-source');

  it('maps a package that lives at a repository root', () => {
    const patch = '--- a/vendor/magento/module-inventory-catalog/Model/Source.php';

    expect(toSourceWith(patch).text).toBe('--- a/InventoryCatalog/Model/Source.php');
  });

  it('maps the base package without leaving a leading slash', () => {
    const patch = '--- a/vendor/magento/magento2-base/app/etc/di.xml';

    expect(toSourceWith(patch).text).toBe('--- a/app/etc/di.xml');
  });

  it('passes through paths that are already source relative', () => {
    const patch = [
      'diff --git a/lib/web/mage/menu.js b/lib/web/mage/menu.js',
      '--- a/lib/web/mage/menu.js',
      '+++ b/lib/web/mage/menu.js',
    ].join('\n');

    const {text, stats} = toSourceWith(patch);

    expect(text).toBe(patch);
    expect(stats.untranslated).toEqual([]);
  });

  it('passes through a root level file the repository really has', () => {
    const roots = new Set(['app', 'lib', 'nginx.conf.sample']);
    const patch = '--- a/nginx.conf.sample';

    const {text, stats} = translatePatch(patch, packageMap, 'to-source', roots);

    expect(text).toBe(patch);
    expect(stats.untranslated).toEqual([]);
  });

  it('refuses a module relative path instead of passing it through', () => {
    // Adobe's July 2026 quote supplement is written relative to the module
    // directory, so every path looks source relative and none of it is. Passing
    // these through reported a clean translation for a patch git apply rejects.
    const roots = new Set(['app', 'lib', 'setup']);
    const patch = [
      '--- a/Model/GuestCart/GuestCartRepository.php',
      '+++ b/etc/di.xml',
    ].join('\n');

    const {stats} = translatePatch(patch, packageMap, 'to-source', roots);

    expect(stats.untranslated).toEqual([
      'Model/GuestCart/GuestCartRepository.php',
      'etc/di.xml',
    ]);
  });

  it('still refuses an unknown third party vendor package', () => {
    const patch = '--- a/vendor/paypal/module-braintree-core/Model/Ui.php';
    const {stats} = toSourceWith(patch);

    expect(stats.untranslated).toEqual(['vendor/paypal/module-braintree-core/Model/Ui.php']);
  });
});

describe('translatePatch install-only paths', () => {
  const patch = [
    'diff --git a/vendor/magento/module-cms/Model/Page.php b/vendor/magento/module-cms/Model/Page.php',
    '--- a/vendor/magento/module-cms/Model/Page.php',
    '+++ b/vendor/magento/module-cms/Model/Page.php',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    'diff --git a/vendor/bin/patch-status b/vendor/bin/patch-status',
    '--- a/vendor/bin/patch-status',
    '+++ b/vendor/bin/patch-status',
    '@@ -1 +1 @@',
    '-marker',
    '+marker2',
  ].join('\n');

  it('drops vendor/bin hunks instead of failing the whole patch', () => {
    const {text, stats} = translatePatch(patch, packageMap, 'to-source');

    expect(stats.untranslated).toEqual([]);
    expect(stats.dropped).toEqual(['vendor/bin/patch-status']);
    expect(text).not.toContain('patch-status');
    expect(text).not.toContain('-marker');
  });

  it('keeps the rest of the patch intact', () => {
    const {text} = translatePatch(patch, packageMap, 'to-source');

    expect(text).toContain('--- a/app/code/Magento/Cms/Model/Page.php');
    expect(text).toContain('+new');
  });
});

describe('translatePatch output framing', () => {
  it('keeps the trailing newline when the dropped section was last', () => {
    const patch = [
      'diff --git a/vendor/magento/module-cms/Model/Page.php b/vendor/magento/module-cms/Model/Page.php',
      '--- a/vendor/magento/module-cms/Model/Page.php',
      '+++ b/vendor/magento/module-cms/Model/Page.php',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/vendor/bin/patch-status b/vendor/bin/patch-status',
      '--- a/vendor/bin/patch-status',
      '+++ b/vendor/bin/patch-status',
      '@@ -1 +1 @@',
      '-marker',
      '+marker2',
      '',
    ].join('\n');

    const {text, stats} = translatePatch(patch, packageMap, 'to-source');

    expect(stats.dropped).toEqual(['vendor/bin/patch-status']);
    // git apply reports "corrupt patch" without this.
    expect(text.endsWith('\n')).toBe(true);
  });

  it('does not invent a trailing newline the input lacked', () => {
    const patch = '--- a/vendor/magento/module-cms/Model/Page.php';

    expect(translatePatch(patch, packageMap, 'to-source').text.endsWith('\n')).toBe(false);
  });
});

describe('translatePatch hunk bodies', () => {
  const withBase = new Map([...packageMap, ['magento/magento2-base', '']]);

  it('leaves a removed line alone when its own content starts with two dashes', () => {
    // The file's line is the SQL comment "-- vendor/...", so its removed form in
    // the diff is "--- vendor/...", which has the exact shape of a file marker.
    const patch = [
      'diff --git a/vendor/magento/module-cms/setup.sql b/vendor/magento/module-cms/setup.sql',
      '--- a/vendor/magento/module-cms/setup.sql',
      '+++ b/vendor/magento/module-cms/setup.sql',
      '@@ -1,2 +1,2 @@',
      '--- vendor/magento/module-cms/legacy.sql',
      '+++ vendor/magento/module-cms/legacy2.sql',
    ].join('\n');

    const {text, stats} = toSource(patch);
    const body = text.split('\n').slice(4);

    expect(body).toEqual([
      '--- vendor/magento/module-cms/legacy.sql',
      '+++ vendor/magento/module-cms/legacy2.sql',
    ]);
    // Four header paths, and nothing from the body.
    expect(stats.translated).toBe(4);
  });

  it('resumes rewriting once a hunk has run its declared length', () => {
    const patch = [
      '--- a/vendor/magento/module-cms/A.php',
      '+++ b/vendor/magento/module-cms/A.php',
      '@@ -1,1 +1,1 @@',
      '-one',
      '+two',
      '--- a/vendor/magento/framework/B.php',
      '+++ b/vendor/magento/framework/B.php',
    ].join('\n');

    const {text} = toSource(patch);

    expect(text).toContain('--- a/lib/internal/Magento/Framework/B.php');
    expect(text).toContain('+++ b/lib/internal/Magento/Framework/B.php');
  });

  it('treats an omitted hunk count as one line', () => {
    const patch = [
      '--- a/vendor/magento/module-cms/A.php',
      '+++ b/vendor/magento/module-cms/A.php',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '--- a/vendor/magento/framework/B.php',
    ].join('\n');

    expect(toSource(patch).text).toContain('--- a/lib/internal/Magento/Framework/B.php');
  });

  it('does not let a no-newline marker consume a hunk line', () => {
    const patch = [
      '--- a/vendor/magento/module-cms/A.php',
      '+++ b/vendor/magento/module-cms/A.php',
      '@@ -1,1 +1,1 @@',
      '-old',
      '\\ No newline at end of file',
      '+new',
      '--- a/vendor/magento/framework/B.php',
    ].join('\n');

    expect(toSource(patch).text).toContain('--- a/lib/internal/Magento/Framework/B.php');
  });

  it('drops an install-only section when only the a side carries the path', () => {
    const patch = [
      'diff --git a/vendor/bin/magento-patches b/dev/null',
      'deleted file mode 100644',
      '--- a/vendor/bin/magento-patches',
      '+++ /dev/null',
    ].join('\n');

    const {stats} = translatePatch(patch, packageMap, 'to-source');

    expect(stats.dropped).toEqual(['vendor/bin/magento-patches']);
    expect(stats.untranslated).toEqual([]);
  });

  it('does not report an install-only path as unmapped when there is no header to drop', () => {
    const patch = '--- a/vendor/bin/magento-patches';

    expect(translatePatch(patch, packageMap, 'to-source').stats.untranslated).toEqual([]);
  });

  it('maps base package paths in the to-vendor direction', () => {
    const patch = '--- a/lib/web/mage/menu.js';

    const {text, stats} = translatePatch(patch, withBase, 'to-vendor');

    expect(text).toBe('--- a/vendor/magento/magento2-base/lib/web/mage/menu.js');
    expect(stats.untranslated).toEqual([]);
  });
});

describe('translatePatch copy headers', () => {
  it('rewrites copy from/to headers the way it rewrites renames', () => {
    const patch = [
      'copy from vendor/magento/module-cms/Model/Old.php',
      'copy to vendor/magento/module-cms/Model/New.php',
    ].join('\n');

    expect(toSource(patch).text).toBe([
      'copy from app/code/Magento/Cms/Model/Old.php',
      'copy to app/code/Magento/Cms/Model/New.php',
    ].join('\n'));
  });
});

describe('translatePatch git-quoted paths', () => {
  // Git C-quotes paths containing spaces. The header regexes split on
  // whitespace and cannot reassemble the quoted form, so the contract is to
  // leave the line byte-identical and report it, never to emit fragments.
  it('leaves a quoted header untouched and reports it untranslated', () => {
    const patch = [
      'diff --git "a/vendor/magento/module-cms/x y.php" "b/vendor/magento/module-cms/x y.php"',
      '--- "a/vendor/magento/module-cms/x y.php"',
      '+++ "b/vendor/magento/module-cms/x y.php"',
    ].join('\n');

    const {text, stats} = toSource(patch);

    expect(text).toBe(patch);
    expect(stats.untranslated.length).toBeGreaterThan(0);
  });
});
