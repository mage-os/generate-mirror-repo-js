const fs = require('fs');
const repo = require('./repository');
const {isVersionGreaterOrEqual} = require('./utils');
const zip = require('jszip');
const {
  createPackagesForRef,
  createPackageForRef,
  createMetaPackageFromRepoDir,
  archiveFilePath,
  getAdditionalDependencies,
  createComposerJsonOnlyPackage
} = require('./package-modules');
const repositoryBuildDefinition = require('./type/repository-build-definition');
const packageDefinition = require('./type/package-definition');
const packageReplacement = require('./type/package-replacement');
const buildState = require('./type/build-state');


/**
 * 
 * @param {String} url 
 * @param {String} fromTag 
 * @param {Array<String>} skipTags 
 * @returns {Promise<Array<String>>}
 */
async function listTagsFrom(url, fromTag, skipTags) {
  return (await repo.listTags(url))
    .filter(tag => isVersionGreaterOrEqual(tag, fromTag))
    .filter(tag => skipTags && skipTags[tag] ? skipTags[tag]() : true);
}

/**
 * @param {String} archiveDir 
 */
async function copyAdditionalPackages(archiveDir) {
  const dir = `${__dirname}/../resource/additional-packages`;
  const dest = `${archiveDir}/additional`

  if (fs.existsSync(dir)) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, {recursive: true});

    fs.readdir(dir, (err, files) => {
      if (err) {
        console.log('' + err);
        return;
      }
      const archives = (files || [])
        .filter(file => file.slice(-4) === '.zip')
        .filter(file => ! fs.existsSync(`${dest}/${file}`));
      console.log(`Copying ${archives.length} additional archive(s) into build directory.`);
      archives.map(file => {
        fs.copyFile(`${dir}/${file}`, `${dest}/${file}`, err => err && console.log(err))
      })
    })
  }
}

/**
 * @param {repositoryBuildDefinition} instruction 
 * @returns {Array<String>} Packaged tags
 */
async function createMagentoCommunityEditionMetapackagesSinceTag(instruction) {
  const tags = await listTagsFrom(instruction.repoUrl, instruction.fromTag, instruction.skipTags);
  console.log(`Versions to process: ${tags.join(', ')}`);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);

    let release = new buildState({
      ref: tag,
      fallbackVersion: tag,
      dependencyVersions: (instruction.fixVersions?.[tag] ?? {})
    });

    await createMagentoCommunityEditionMetapackage(
      instruction,
      release
    );
  }
  return tags;
}

/**
 * @param {repositoryBuildDefinition} instruction 
 * @returns {Array<String>} Packaged tags
 */
async function createProjectPackagesSinceTag(instruction) {
  const tags = await listTagsFrom(instruction.repoUrl, instruction.fromTag, instruction.skipTags);
  console.log(`Versions to process: ${tags.join(', ')}`);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);

    let release = new buildState({
      ref: tag,
      fallbackVersion: tag,
      dependencyVersions: (instruction.fixVersions?.[tag] ?? {})
    });

    await createMagentoCommunityEditionProject(
      instruction,
      release
    );
  }
  return tags;
}

/**
 * @param {repositoryBuildDefinition} instruction 
 * @param {packageDefinition} package 
 * @returns {Array<String>} Packaged tags
 */
async function createMetaPackagesFromRepoDir(instruction, package) {
  const tags = await listTagsFrom(instruction.repoUrl, instruction.fromTag, instruction.skipTags);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);

    let release = new buildState({
      ref: tag,
      fallbackVersion: tag,
      dependencyVersions: (instruction.fixVersions?.[tag] ?? {})
    });

    try {
      await createMetaPackageFromRepoDir(
        instruction,
        package,
        release
      );
      built.push(tag);
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

/**
 * @param {repositoryBuildDefinition} instruction 
 * @param {packageDefinition} package 
 * @returns {Array<String>} Packaged tags
 */
async function createPackagesSinceTag(instruction, package) {
  const tags = await listTagsFrom(instruction.repoUrl, instruction.fromTag, instruction.skipTags);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);

    let release = new buildState({
      ref: tag,
      dependencyVersions: (instruction.fixVersions?.[tag] ?? {})
    });
    
    try {
      await createPackagesForRef(
        instruction,
        package,
        release
      );
      built.push(tag)
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

/**
 * @param {repositoryBuildDefinition} instruction 
 * @param {packageDefinition} package 
 * @returns {Array<String>} Packaged tags
 */
async function createPackageSinceTag(instruction, package) {
  const tags = await listTagsFrom(instruction.repoUrl, instruction.fromTag, instruction.skipTags);
  const built = [];

  console.log(`Versions to process: ${tags.join(', ')}`);

  for (const tag of tags) {
    console.log(`Processing ${tag}`);

    // Note: if the composerJsonFile ends with the "template.json" the composer dependencies will be calculated
    // This is only used for non-mirror magento2-base-package builds
    package.composerJsonFile = null;
    if (package.composerJsonPath && package.composerJsonPath.length) {
      let composerJsonFile = package.composerJsonPath
        .replace('composer-templates', 'history')
        .replace('template.json', `${tag}.json`);
      composerJsonFile = fs.existsSync(composerJsonFile)
        ? composerJsonFile
        : package.composerJsonPath;

      package.composerJsonFile = composerJsonFile;
    }

    let release = new buildState({
      ref: tag,
      dependencyVersions: (instruction.fixVersions?.[tag] ?? {})
    });

    try {
      await createPackageForRef(
        instruction,
        package,
        release
      );
      built.push(tag);
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

/**
 * @param {packageReplacement} package 
 * @return {void}
 */
async function replacePackageFiles(package) {
  const packageFilePath = archiveFilePath(package.name, package.version);
  if (!fs.existsSync(packageFilePath)) {
    throw {message: `Could not find archive ${packageFilePath} for replacement: ${package.name}:${package.version}.`};
  }

  fs.readFile(packageFilePath, function(_, data) {
    zip.loadAsync(data).then(function(contents) {
      package.files.forEach(function(file) {
        const replacementFilePath = `${__dirname}/../resource/replace/${package.name}/${package.version}/${file}`;
        if (!fs.existsSync(replacementFilePath)) {
          throw {message: `Replacement file does not exist: ${replacementFilePath}`}
        }
        contents.file(
          file,
          fs.readFileSync(replacementFilePath),
          {date: new Date('2022-02-22 22:02:22.000Z'), unixPermissions: '644'}
        );
      })
      const stream = contents.generateNodeStream({streamFiles: false, platform: 'UNIX'});
      stream.pipe(fs.createWriteStream(packageFilePath));
    })
  });
}

/**
 * @param {repositoryBuildDefinition} instruction
 * @param {Object} metapackage
 * @returns {Array<String>} Packaged tags
 */
async function createMetaPackagesSinceTag(instruction, metapackage) {
  const tags = await listTagsFrom(instruction.repoUrl, instruction.fromTag, instruction.skipTags);
  console.log(`Versions to process for metapackage ${metapackage.name}: ${tags.join(', ')}`);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    let release = new buildState({
      ref: tag,
      fallbackVersion: tag,
      dependencyVersions: (instruction.fixVersions?.[tag] ?? {})
    });
    // Try to load additional dependencies from resource history
    /**
     * @TODO: This isn't quite right, but I haven't wrapped my head around it yet.
     *  additional gives `require` only, we need to merge it into the base json for the version
     *  create... loads ./composer.json for the given release tag, and adds/transforms based on the ref history.
     */
    let additionalDeps = await getAdditionalDependencies(metapackage.name, tag);
    await createComposerJsonOnlyPackage(
      instruction,
      release,
      metapackage.name,
      tag,
      composerConfig => {
        // If additionalDeps found, use them
        if (additionalDeps) {
          // @TODO: I don't think so
          Object.assign(composerConfig, {require: additionalDeps});
        }
        // Apply transforms if any
        if (metapackage.transform) {
          for (const fn of metapackage.transform) {
            composerConfig = fn(composerConfig, instruction, release);
          }
        }
        return composerConfig;
      }
    );
  }
  return tags;
}

/**
 * @param {repositoryBuildDefinition} instruction
 * @returns {Promise<void>}
 */
async function processMirrorInstruction(instruction) {
  let tags = [];

  await Promise.all(
    instruction.extraRefToRelease.map(
      extra => repo.createTagForRef(instruction.repoUrl, extra.ref, extra.release, 'Mage-OS Extra Ref', extra.details)
    )
  );

  for (const package of (instruction.packageDirs)) {
    console.log(`Packaging ${package.label}`);
    tags = await createPackagesSinceTag(instruction, package)
    console.log(package.label, tags);
  }

  for (const package of (instruction.packageIndividual)) {
    console.log(`Packaging ${package.label}`);
    tags = await createPackageSinceTag(instruction, package);
    console.log(package.label, tags);
  }

  for (const package of (instruction.packageMetaFromDirs)) {
    console.log(`Packaging ${package.label}`);
    tags = await createMetaPackagesFromRepoDir(instruction, package);
    console.log(package.label, tags);
  }

  for (const packageReplacement of (instruction.packageReplacements)) {
    await replacePackageFiles(packageReplacement);
  }

  for (const metapackage of instruction.extraMetapackages) {
    console.log(`Packaging ${metapackage.name}`);
    tags = await createMetaPackagesSinceTag(instruction, metapackage);
  }

  repo.clearCache();
}

module.exports = {
  copyAdditionalPackages,
  processMirrorInstruction
}
