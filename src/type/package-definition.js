'use strict';

/**
 * Defines a composer package from all or part of a git repository.
 */
class packageDefinition {
  /**
   * @type String|null Package label (internal)
   */
  label = null;

  /**
   * @type String Directory, relative to repository root
   */
  dir = '';
  
  /**
   * @type String|null Relative path to composer.json
   */
  composerJsonPath = null;
  
  /**
   * @type String|null Absolute path to a specific composer.json
   */
  composerJsonFile = null;

  /**
   * Git doesn't track empty folders. If the built package needs any, list them here.
   * 
   * @type Array<{}> Composer reference (commit hash, tag)
   */
  emptyDirsToAdd = [];

  /**
   * Excludes can either be (A) strings that are matched against the beginning of a file path, or (B) a function
   * Exclude functions are called in two ways:
   * - with a ref and a filename: it should return a boolean if the file should be excluded or not (true === excluded)
   * - with only a ref: in that case it should return a string filename that should be excluded, or an empty string if none.
   * Exclude functions will be called with both varieties during a build!
   * 
   * @type Array<String|function> Folder strings to exclude, or callback functions to determine exclusion
   */
  excludes = [];

  /**
   * @param {{label: String, dir: String, composerJsonPath: String, emptyDirsToAdd: Array<{}>, excludes: Array<{}>}} options 
   */
  constructor(options) {
    this.label = options.label || this.label;
    this.dir = options.dir || this.dir;
    this.composerJsonPath = options.composerJsonPath || this.composerJsonPath;
    this.emptyDirsToAdd = options.emptyDirsToAdd || this.emptyDirsToAdd;
    this.excludes = options.excludes || this.excludes;
  }
};

module.exports = packageDefinition;
