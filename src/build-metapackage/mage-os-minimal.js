const buildState = require('../type/build-state');
const metapackageDefinition = require('../type/metapackage-definition');
const repositoryBuildDefinition = require('../type/repository-build-definition');
const {compareVersions} = require('../utils');
const {
  updateComposerConfigFromMagentoToMageOs
} = require('../release-build-tools');

/**
 * @param {{}} composerConfig
 * @param {repositoryBuildDefinition} instruction
 * @param {metapackageDefinition} metapackage
 * @param {buildState} release
 */
async function transformMageOSMinimalProduct(composerConfig, instruction, metapackage, release) {
  // Do not reprocess historical releases
  if (composerConfig.version !== release.version) {
    return composerConfig;
  }

  const preservePackages = new Set([
    'php',
    'ext-bcmath',
    'ext-ctype',
    'ext-curl',
    'ext-dom',
    'ext-ftp',
    'ext-gd',
    'ext-hash',
    'ext-iconv',
    'ext-intl',
    'ext-mbstring',
    'ext-openssl',
    'ext-pdo_mysql',
    'ext-simplexml',
    'ext-soap',
    'ext-sodium',
    'ext-xsl',
    'ext-zip',
    'lib-libxml',
    'aligent/magento2-pci-4-compatibility',
    'colinmollenhour/cache-backend-file',
    'colinmollenhour/cache-backend-redis',
    'colinmollenhour/credis',
    'colinmollenhour/php-redis-session-abstract',
    'creatuity/magento2-interceptors',
    'guzzlehttp/guzzle',
    'laminas/laminas-captcha',
    'laminas/laminas-code',
    'laminas/laminas-di',
    'laminas/laminas-escaper',
    'laminas/laminas-eventmanager',
    'laminas/laminas-feed',
    'laminas/laminas-filter',
    'laminas/laminas-http',
    'laminas/laminas-i18n',
    'laminas/laminas-modulemanager',
    'laminas/laminas-mvc',
    'laminas/laminas-permissions-acl',
    'laminas/laminas-servicemanager',
    'laminas/laminas-soap',
    'laminas/laminas-stdlib',
    'laminas/laminas-uri',
    'laminas/laminas-validator',
    'monolog/monolog',
    'pelago/emogrifier',
    'phpseclib/mcrypt_compat',
    'phpseclib/phpseclib',
    'psr/log',
    'ramsey/uuid',
    'swissup/module-search-mysql-legacy',
    'symfony/console',
    'symfony/intl',
    'symfony/mailer',
    'symfony/mime',
    'symfony/process',
    'symfony/string',
    'tedivm/jshrink',
    'tubalmartin/cssmin',
    'wikimedia/less.php',
    `${instruction.vendor}/composer-root-update-plugin`,
    `${instruction.vendor}/framework`,
    `${instruction.vendor}/magento2-base`,
    `${instruction.vendor}/magento-zf-db`,
    `${instruction.vendor}/module-backend`,
    `${instruction.vendor}/module-catalog`,
    `${instruction.vendor}/module-catalog-inventory`,
    `${instruction.vendor}/module-catalog-rule`,
    `${instruction.vendor}/module-catalog-search`,
    `${instruction.vendor}/module-catalog-url-rewrite`,
    `${instruction.vendor}/module-checkout`,
    `${instruction.vendor}/module-cms`,
    `${instruction.vendor}/module-cms-url-rewrite`,
    `${instruction.vendor}/module-config`,
    `${instruction.vendor}/module-contact`,
    `${instruction.vendor}/module-cookie`,
    `${instruction.vendor}/module-cron`,
    `${instruction.vendor}/module-customer`,
    `${instruction.vendor}/module-deploy`,
    `${instruction.vendor}/module-developer`,
    `${instruction.vendor}/module-directory`,
    `${instruction.vendor}/module-eav`,
    `${instruction.vendor}/module-email`,
    `${instruction.vendor}/module-indexer`,
    `${instruction.vendor}/module-integration`,
    `${instruction.vendor}/module-newsletter`,
    `${instruction.vendor}/module-page-cache`,
    `${instruction.vendor}/module-payment`,
    `${instruction.vendor}/module-product-video`,
    `${instruction.vendor}/module-quote`,
    `${instruction.vendor}/module-require-js`,
    `${instruction.vendor}/module-robots`,
    `${instruction.vendor}/module-rule`,
    `${instruction.vendor}/module-sales`,
    `${instruction.vendor}/module-sales-rule`,
    `${instruction.vendor}/module-sales-sequence`,
    `${instruction.vendor}/module-search`,
    `${instruction.vendor}/module-security`,
    `${instruction.vendor}/module-shipping`,
    `${instruction.vendor}/module-sitemap`,
    `${instruction.vendor}/module-store`,
    `${instruction.vendor}/module-tax`,
    `${instruction.vendor}/module-theme`,
    `${instruction.vendor}/module-tinymce-3`,
    `${instruction.vendor}/module-translation`,
    `${instruction.vendor}/module-ui`,
    `${instruction.vendor}/module-url-rewrite`,
    `${instruction.vendor}/module-user`,
    `${instruction.vendor}/module-webapi`,
    `${instruction.vendor}/theme-adminhtml-backend`,
    `${instruction.vendor}/theme-adminhtml-m137`,
    `${instruction.vendor}/theme-frontend-luma`,
  ]);

  // Keep only preserved requirements for this minimal distro
  composerConfig.require = Object.fromEntries(
    Object.entries(composerConfig.require || {})
          .filter(
            ([pkg]) => preservePackages.has(pkg)
          )
  );

  return composerConfig
}

module.exports = {
  transformMageOSMinimalProduct,
};
