class metapackageDefinition {
  /**
   * @type String Package name
   */
  name = '';

  /**
   * @type String Package type
   */
  type = 'metapackage';

  /**
   * @type String Package description
   */
  description = '';

  /**
   * @type String|null Base package to extend from
   */
  basePackage = null;

  /**
   * @type Array<String> Packages to include in the metapackage
   */
  include = [];

  /**
   * @type Array<String> Packages to exclude from the metapackage
   */
  exclude = [];

  /**
   * @type Array<Function> Transform functions to apply
   */
  transform = [];

  /**
   * @type String|null Path to history file
   */
  historyPath = null;

  /**
   * @param {{name: String, type: String, description: String, basePackage: String, include: Array<String>, exclude: Array<String>, transform: Array<Function>, historyPath: String}} config
   */
  constructor(config = {}) {
    this.name = config.name || this.name;
    this.type = config.type || this.type;
    this.description = config.description || this.description;
    this.basePackage = config.basePackage || this.basePackage;
    this.include = config.include || this.include;
    this.exclude = config.exclude || this.exclude;
    this.transform = config.transform || this.transform;
    this.historyPath = config.historyPath || this.historyPath;
  }
}

module.exports = metapackageDefinition;
