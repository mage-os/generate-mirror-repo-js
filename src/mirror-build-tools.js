const fs = require('fs');
const repo = require('./repository');
const {isVersionGreaterOrEqual} = require('./utils');
const zip = require('jszip');
const {
  createPackagesForRef,
  createPackageForRef,
  createMagentoCommunityEditionMetapackage,
  createMagentoCommunityEditionProject,
  createMetaPackageFromRepoDir,
  archiveFilePath
} = require('./package-modules');
const repositoryBuildDefinition = require('./type/repository-build-definition');
const packageDefinition = require('./type/package-definition');
const packageReplacement = require('./type/package-replacement');


async function listTagsFrom(url, fromTag, skipTags) {
  return (await repo.listTags(url))
    .filter(tag => isVersionGreaterOrEqual(tag, fromTag))
    .filter(tag => skipTags && skipTags[tag] ? skipTags[tag]() : true);
}

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
 * @param {repositoryBuildDefinition} repository 
 * @returns Array<String> Packaged tags
 */
async function createMagentoCommunityEditionMetapackagesSinceTag(repository) {
  const tags = await listTagsFrom(repository.repoUrl, repository.fromTag, repository.skipTags);
  console.log(`Versions to process: ${tags.join(', ')}`);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    await createMagentoCommunityEditionMetapackage(repository.repoUrl, tag, {
      dependencyVersions: (repository.fixVersions?.[tag] ?? {}),
      transform: repository.transform,
      vendor: repository.vendor || 'magento'
    });
  }
  return tags;
}

/**
 * @param {repositoryBuildDefinition} repository 
 * @returns Array<String> Packaged tags
 */
async function createProjectPackagesSinceTag(repository) {
  const tags = await listTagsFrom(repository.repoUrl, repository.fromTag, repository.skipTags);
  console.log(`Versions to process: ${tags.join(', ')}`);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    await createMagentoCommunityEditionProject(
      repository.repoUrl,
      tag,
      {
        dependencyVersions: repository.fixVersions?.[tag] ?? {},
        transform: repository.transform,
        vendor: repository.vendor || 'magento'
      }
    );
  }
  return tags;
}

/**
 * @param {repositoryBuildDefinition} repository 
 * @param {packageDefinition} package 
 * @returns {Array<String>} Packaged tags
 */
async function createMetaPackagesFromRepoDir(repository, package) {
  const tags = await listTagsFrom(repository.repoUrl, repository.fromTag, repository.skipTags);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    try {
      await createMetaPackageFromRepoDir(
        repository.repoUrl,
        package.dir,
        tag,
        {
          dependencyVersions: (repository.fixVersions?.[tag] ?? {}),
          transform: repository.transform
        }
      );
      built.push(tag);
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

/**
 * @param {repositoryBuildDefinition} repository 
 * @param {packageDefinition} package 
 * @returns {Array<String>} Packaged tags
 */
async function createPackagesSinceTag(repository, package) {
  const tags = await listTagsFrom(repository.repoUrl, repository.fromTag, repository.skipTags);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    try {
      // @TODO Use as is, or refactor?
      await createPackagesForRef(
        repository.repoUrl,
        package.modulesPath,
        tag,
        {
          excludes: package.excludes,
          dependencyVersions: (repository.fixVersions?.[tag] ?? {}),
          transform: repository.transform
        }
      );
      built.push(tag)
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

/**
 * @param {repositoryBuildDefinition} repository 
 * @param {packageDefinition} package 
 * @returns Array<String> Packaged tags
 */
async function createPackageSinceTag(repository, package) {
  const tags = await listTagsFrom(url, repository.fromTag, repository.skipTags);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    let composerJsonFile = '';
    // Note: if the composerJsonFile ends with the "template.json" the composer dependencies will be calculated
    // This is only used for non-mirror magento2-base-package builds
    // @TODO: Is there somewhere better this should be solved?
    if (package.composerJsonPath && package.composerJsonPath.length) {
      composerJsonFile = package.composerJsonPath
        .replace('composer-templates', 'history')
        .replace('template.json', `${tag}.json`);
      composerJsonFile = fs.existsSync(composerJsonFile)
        ? composerJsonFile
        : package.composerJsonPath;
    }
    try {
      // @TODO: Refactor this too?
      await createPackageForRef(
        repository.repoUrl,
        package.dir,
        tag,
        {
          excludes: package.excludes,
          composerJsonPath: composerJsonFile,
          emptyDirsToAdd: package.emptyDirsToAdd,
          dependencyVersions: (repository.fixVersions?.[tag] ?? {}),
          transform: repository.transform
        }
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
        contents.file(file, fs.readFileSync(replacementFilePath));
      })
      const stream = contents.generateNodeStream({streamFiles: false, platform: 'UNIX'});
      stream.pipe(fs.createWriteStream(packageFilePath));
    })
  });
}

/**
 * @param {repositoryBuildDefinition} instruction Array with build instruction
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

  if (instruction.magentoCommunityEditionMetapackage) {
    console.log('Packaging Magento Community Edition Product Metapackage');
    tags = await createMagentoCommunityEditionMetapackagesSinceTag(instruction);
    console.log('Magento Community Edition Product Metapackage', tags);
  }

  if (instruction.magentoCommunityEditionProject) {
    console.log('Packaging Magento Community Edition Project');
    tags = await createProjectPackagesSinceTag(instruction);
    console.log('Magento Community Edition Project', tags);
  }

  repo.clearCache();
}

module.exports = {
  copyAdditionalPackages,
  processMirrorInstruction
}
