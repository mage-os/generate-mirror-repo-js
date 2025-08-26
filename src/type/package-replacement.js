'use strict';

class packageReplacement {
  /**
   * @type String|null Package composer name (`vendor/package`)
  */
  name = null;

  /**
   * @type String|null Version to apply the replacement to
  */
  version = null;

  /**
   * @type Array<String> Files to replace -- must exist in this repository as resource/replace/{name}/{version}/{file}
  */
  files = [];

  /**
   * @param {{name: String, version: String, files: Array}} options 
   */
  constructor(options) {
    this.name = options.name || this.name;
    this.version = options.version || this.version;
    this.files = options.files || this.files;
  }
};

module.exports = packageReplacement;
