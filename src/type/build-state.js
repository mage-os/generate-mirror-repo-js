'use strict';

/**
 * Tracks version/reference/replacement info for a release
 */
class buildState {
  /**
   * @type String|null Git reference to release
   */
  ref = null;

  /**
   * @type String|null Release version to use in composer.json version tag and
   *  in the package archive name
  */
  version = null;

  /**
   * @type {{}} composer package:version dependency map. Dependencies for
   *  packages in the map will be set to the given versions
   */
  dependencyVersions = {};

  /**
   * @param {{ref: String, version: String, dependencyVersions: {}}}} options 
   */
  constructor(options) {
    this.ref = options.ref || this.ref;
    this.version = options.version || this.version;
    this.dependencyVersions = options.dependencyVersions || this.dependencyVersions;
  }
};

module.exports = buildState;
