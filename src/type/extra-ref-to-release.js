'use strict';

/**
 * Defines additional untagged git references to build as composer packages.
 */
class extraRefToRelease {
  /**
   * @type String|null Git reference (commit hash, branch, tag, etc) to release
   */
  ref = null;

  /**
   * @type String|null Composer version number to use for the package
  */
  release = null;

  /**
   * @todo String|null Description/reason (internal)
   */
  details = null;

  /**
   * @param {{release: String, ref: String, details: String}} options 
   */
  constructor(options) {
    this.ref = options.ref || this.ref;
    this.release = options.release || this.release;
    this.details = options.details || this.details;
  }
};

module.exports = extraRefToRelease;
