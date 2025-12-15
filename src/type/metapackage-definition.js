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
   * @type Array<Function> Transform functions to apply
   */
  transform = [];

  /**
   * @type String|null Tag to build from (e.g. a git tag)
   */
  fromTag = null;

  /**
   * @param {{name: String, type: String, description: String, transform: Array<Function>, fromTag: String}} config
   */
  constructor(config = {}) {
    this.name = config.name || this.name;
    this.type = config.type || this.type;
    this.description = config.description || this.description;
    this.transform = config.transform || this.transform;
    this.fromTag = config.fromTag || this.fromTag;
  }
}

module.exports = metapackageDefinition;
