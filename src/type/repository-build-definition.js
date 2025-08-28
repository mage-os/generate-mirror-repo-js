'use strict';

const extraRefToRelease = require('./extra-ref-to-release');
const packageDefinition = require('./package-definition');
const packageReplacement = require('./package-replacement');

/**
 * Defines release build instructions for a git repository.
 */
class repositoryBuildDefinition {
  /**
   * @type String|null Git Repository URL
   */
  repoUrl = null;

  /**
   * @type Array<packageDefinition> Create packages from all folders within
   *  these directories
   */
  packageDirs = [];

  /**
   * @type Array<packageDefinition> Create a single package from each
   *  specified folder
   */
  packageIndividual = [];

  /**
   * @todo How does this work?
   * @type Array<packageDefinition> Create a metapackage from this folder
   */
  packageMetaFromDirs = [];

  /**
   * @todo Are these necessary? Are these the right way to handle it?
   */

  /**
   * @type Boolean Whether this package is a Magento project metapackage
   */
  magentoCommunityEditionProject = false;

  /**
   * @type Boolean Whether this package is a Magento product metapackage
   */
  magentoCommunityEditionMetapackage = false;

  /**
   * @type String|null Package vendor to use
   */
  vendor = null;

  /**
   * @type String|null Git reference (branch, etc) to use for the build
   */
  ref = null;

  /**
   * @type String|null First version to build
   */
  fromTag = null;

  /**
   * @type {{}} Tags to skip from the build
   */
  skipTags = {};

  /**
   * @type {{}} Composer names and callback functions for transformations to
   *  apply at build
   */
  transform = {};

  /**
   * @type {{}} For the given release version, set specific composer package
   *  versions
   */
  fixVersions = {};

  /**
   * @type Array<packageReplacement> Packages to replace
   */
  packageReplacements = [];

  /**
   * @type Array<extraRefToRelease> Extra untagged git references to package
   */
  extraRefToRelease = [];

  /**
   * @param {{repoUrl: String, packageDirs: Array, packageIndividual: Array, packageMetaFromDirs: Array, magentoCommunityEditionProject: boolean, magentoCommunityEditionMetapackage: boolean, vendor: String, ref: String, fromTag: String, skipTags: {Object}, transform: {Object}, fixVersions: {Object}, packageReplacements: {Object}, extraRefToRelease: Array}}
   */
  constructor(options) {
    this.repoUrl = options.repoUrl || this.repoUrl;
    
    this.magentoCommunityEditionProject = options.magentoCommunityEditionProject || this.magentoCommunityEditionProject;
    this.magentoCommunityEditionMetapackage = options.magentoCommunityEditionMetapackage || this.magentoCommunityEditionMetapackage;

    this.vendor = options.vendor || this.vendor;
    this.ref = options.ref || this.ref;
    this.fromTag = options.fromTag || this.fromTag;
    this.skipTags = options.skipTags || this.skipTags;
    this.transform = options.transform || this.transform;
    this.fixVersions = options.fixVersions || this.fixVersions;

    this.packageDirs = this.initPackageDefinitions(options.packageDirs || []);
    this.packageIndividual = this.initPackageDefinitions(options.packageIndividual || []);
    this.packageMetaFromDirs = this.initPackageDefinitions(options.packageMetaFromDirs || []);

    this.packageReplacements = this.initPackageReplacements(options.packageReplacements || []);
    this.extraRefToRelease = this.initExtraRefsToRelease(options.extraRefToRelease || []);
  }

  /**
   * @param {Array<{}>} packages 
   * @returns {Array<packageDefinition>}
   */
  initPackageDefinitions(packages) {
    let instances = [];
    packages.forEach(element => {
      instances.push(new packageDefinition(element));
    });

    return instances;
  }

  /**
   * @param {Array<{}>} replacements 
   * @returns {Array<packageReplacement>}
   */
  initPackageReplacements(replacements) {
    let instances = [];
    replacements.forEach(element => {
      instances.push(new packageReplacement(element));
    });

    return instances;
  }

  /**
   * @param {Array<{}>} extraRefs 
   * @returns {Array<extraRefToRelease>}
   */
  initExtraRefsToRelease(extraRefs) {
    let instances = [];
    extraRefs.forEach(element => {
      instances.push(new extraRefToRelease(element));
    });

    return instances;
  }
};

module.exports = repositoryBuildDefinition;
