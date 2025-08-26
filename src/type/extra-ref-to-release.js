'use strict';

class extraRefToRelease {
  /**
   * @type String|null Release version number/tag
  */
  release = null;

  /**
   * @type String|null Composer reference (commit hash, branch, tag, etc) to release
   */
  ref = null;

  /**
   * @todo String|null Description (internal)
   */
  details = null;

  /**
   * @param {{release: String, ref: String, details: String}} options 
   */
  constructor(options) {
    this.release = options.release || this.release;
    this.ref = options.ref || this.ref;
    this.details = options.details || this.details;
  }
};

module.exports = extraRefToRelease;
