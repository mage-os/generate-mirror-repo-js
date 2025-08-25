'use strict';

class packageDefinition {
  repoUrl = null;
  packageDirs = [];
  packageIndividual = [];
  packageMetaFromDirs = [];

  // TODO: Are these necessary? Are these the right way to handle it?
  magentoCommunityEditionProject = false;
  magentoCommunityEditionMetapackage = false;
  vendor = null;

  ref = null;
  fromTag = null;
  skipTags = {}; // TODO: Still relevant?
  transform = {};
  fixVersions = {};
  packageReplacements = {};
  extraRefToRelease = [];

  /**
   * @param {{repoUrl: String, packageDirs: Array, packageIndividual: Array, packageMetaFromDirs: Array, magentoCommunityEditionProject: boolean, magentoCommunityEditionMetapackage: boolean, vendor: String, ref: String, fromTag: String, skipTags: {Object}, transform: {Object}, fixVersions: {Object}, packageReplacements: {Object}, extraRefToRelease: Array}}
   */
  constructor(options) {
    this.repoUrl = options.repoUrl || this.repoUrl;
    this.packageDirs = options.packageDirs || this.packageDirs;
    this.packageIndividual = options.packageIndividual || this.packageIndividual;
    this.packageMetaFromDirs = options.packageMetaFromDirs || this.packageMetaFromDirs;
    
    this.magentoCommunityEditionProject = options.magentoCommunityEditionProject || this.magentoCommunityEditionProject;
    this.magentoCommunityEditionMetapackage = options.magentoCommunityEditionMetapackage || this.magentoCommunityEditionMetapackage;

    this.vendor = options.vendor || this.vendor;
    this.ref = options.ref || this.ref;
    this.fromTag = options.fromTag || this.fromTag;
    this.skipTags = options.skipTags || this.skipTags;
    this.transform = options.transform || this.transform;
    this.fixVersions = options.fixVersions || this.fixVersions;
    this.packageReplacements = options.packageReplacements || this.packageReplacements;
    this.extraRefToRelease = options.extraRefToRelease || this.extraRefToRelease;
  }
};

module.exports = packageDefinition;
