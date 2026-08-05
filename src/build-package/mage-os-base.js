const {isVersionGreaterOrEqual, sortObjectKeys} = require('../utils');

// Below this version the published bytes are frozen; see issue #325.
const BASE_LINKS_SORTED_SINCE = '3.2.1';

const LINK_SECTIONS = ['require', 'require-dev', 'suggest', 'replace', 'conflict'];

function shouldSortLinks(version) {
  if (/^\d+\.\d+/.test(version)) {
    return isVersionGreaterOrEqual(version, BASE_LINKS_SORTED_SINCE);
  }
  return true;
}

function transformMageOSBaseSortLinks(composerConfig, instruction, release) {
  const version = release.version || release.ref || '';
  if (!shouldSortLinks(version)) return composerConfig;

  for (const section of LINK_SECTIONS) {
    if (composerConfig[section]) {
      composerConfig[section] = sortObjectKeys(composerConfig[section]);
    }
  }
  return composerConfig;
}

module.exports = {
  transformMageOSBaseSortLinks,
  BASE_LINKS_SORTED_SINCE,
};
