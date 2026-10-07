'use strict';

/**
 * Tracks version/reference/replacement info for a release
 */
class buildState {
  /**
   * @type {String|null} Git reference to release
   */
  ref = null;

  /**
   * @type {String|null} Git reference to release from
   */
  origRef = null;

  /**
   * @type {String|null} Release version to use in composer.json version tag and
   *  in the package archive name
  */
  version = null;

  /**
   * @type String|null Git Repository URL
   */
  composerRepoUrl = null;

  /**
   * @type {String|null} Fallback version to use in composer.json version tag and
   *  in the package archive name (used for nightly releases)
  */
  fallbackVersion = null;

  /**
   * @type {Object.<string, string>} composer package:version dependency map. Dependencies for
   *  packages in the map will be set to the given versions.
   */
  dependencyVersions = {};

  /**
   * @type {Object.<string, string>} composer package:version replaces map. Packages in the map will
   *  be set to replace the given versions.
   */
  replaceVersions = {};

  /**
   * @type {Object.<string, string>} composer package:version map pinning
   *  dependencies that are not built here. Without a pin such a dependency
   *  resolves to its latest tag, which is wrong for a release on an older
   *  line: the newest add-on may require the current major.
   */
  dependencyPins = {};

  /**
   * @param {{ref: String, origRef: String, version: String, composerRepoUrl: String, fallbackVersion: String, dependencyVersions: Object.<string, string>, replaceVersions: Object.<string, string>, dependencyPins: Object.<string, string>}}} options 
   */
  constructor(options) {
    this.ref = options.ref || this.ref;
    this.origRef = options.origRef || this.origRef;
    this.version = options.version || this.version;
    this.fallbackVersion = options.fallbackVersion || this.fallbackVersion;
    this.composerRepoUrl = options.composerRepoUrl || this.composerRepoUrl;
    this.dependencyVersions = options.dependencyVersions || this.dependencyVersions;
    this.replaceVersions = options.replaceVersions || this.replaceVersions;
    this.dependencyPins = options.dependencyPins || this.dependencyPins;
  }
};

module.exports = buildState;
