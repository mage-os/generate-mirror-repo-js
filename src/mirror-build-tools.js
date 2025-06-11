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


async function listTagsFrom(url, tagSpec, versionFilter = null) {
  const {fromTag, skipTags} = tagSpec;
  let tags = (await repo.listTags(url))
    .filter(tag => isVersionGreaterOrEqual(tag, fromTag))
    .filter(tag => skipTags && skipTags[tag] ? skipTags[tag]() : true);

  if (versionFilter && versionFilter.length > 0) {
    tags = tags.filter(tag => versionFilter.includes(tag));
  }

  return tags;
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

async function createMagentoCommunityEditionMetapackagesSinceTag(url, tagsSpec, fixVersions, transform, vendor, versionFilter) {
  const tags = await listTagsFrom(url, tagsSpec, versionFilter);
  console.log(`Versions to process: ${tags.join(', ')}`);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    await createMagentoCommunityEditionMetapackage(url, tag, {
      dependencyVersions: (fixVersions?.[tag] ?? {}),
      transform,
      vendor: vendor || 'magento'
    });
  }
  return tags;
}

async function createProjectPackagesSinceTag(url, tagsSpec, fixVersions, transform, vendor, versionFilter) {
  const tags = await listTagsFrom(url, tagsSpec, versionFilter);
  console.log(`Versions to process: ${tags.join(', ')}`);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    await createMagentoCommunityEditionProject(url, tag, {
      dependencyVersions: (fixVersions?.[tag] ?? {}),
      transform,
      vendor: vendor || 'magento'
    });
  }
  return tags;
}

async function createMetaPackagesFromRepoDir(url, tagSpec, path, fixVersions, transform, versionFilter) {
  const tags = await listTagsFrom(url, tagSpec, versionFilter);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    try {
      await createMetaPackageFromRepoDir(url, path, tag, {dependencyVersions: (fixVersions?.[tag] ?? {}), transform});
      built.push(tag);
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

async function createPackagesSinceTag(url, tagsSpec, modulesPath, excludes, fixVersions, transform, versionFilter) {
  const tags = await listTagsFrom(url, tagsSpec, versionFilter);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    try {
      await createPackagesForRef(url, modulesPath, tag, {excludes, dependencyVersions: (fixVersions?.[tag] ?? {}), transform});
      built.push(tag)
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

async function createPackageSinceTag(url, tagsSpec, modulesPath, excludes, composerJsonPath, emptyDirsToAdd, fixVersions, transform, versionFilter) {
  const tags = await listTagsFrom(url, tagsSpec, versionFilter);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    let composerJsonFile = '';
    // Note: if the composerJsonFile ends with the "template.json" the composer dependencies will be calculated
    // This is only used for non-mirror magento2-base-package builds
    if (composerJsonPath && composerJsonPath.length) {
      composerJsonFile = (composerJsonPath || '')
        .replace('composer-templates', 'history')
        .replace('template.json', `${tag}.json`);
      composerJsonFile = fs.existsSync(composerJsonFile)
        ? composerJsonFile
        : composerJsonPath;
    }
    try {
      await createPackageForRef(url, modulesPath, tag, {excludes, composerJsonPath: composerJsonFile, emptyDirsToAdd, dependencyVersions: (fixVersions?.[tag] ?? {}), transform});
      built.push(tag);
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

async function replacePackageFiles(name, version, files) {
  const packageFilePath = archiveFilePath(name, version);
  if (!fs.existsSync(packageFilePath)) {
    console.log(`Skipping package replacement for ${name}:${version} - package not found in current build`);
    return;
  }

  fs.readFile(packageFilePath, function(_, data) {
    zip.loadAsync(data).then(function(contents) {
      files.forEach(function(file) {
        const replacementFilePath = `${__dirname}/../resource/replace/${name}/${version}/${file}`;
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
 * @param {{repoUrl:String, fromTag:String, skipTags:{Object}, magentoCommunityEditionMetapackage: boolean, magentoCommunityEditionProject: boolean }} instructions Array with build instructions
 * @param {Array<string>|null} versionFilter Array of versions to build, or null to build all
 * @returns {Promise<void>}
 */
async function processMirrorInstruction(instructions, versionFilter = null) {
  let tags = [];

  const {repoUrl, fromTag, skipTags, extraRefToRelease, fixVersions, vendor = null, transform = null} = instructions;
  const tagsSpec = {fromTag, skipTags}

  await Promise.all(
    (extraRefToRelease || []).map(extra => repo.createTagForRef(repoUrl, extra.ref, extra.release, 'Mage-OS Extra Ref', extra.details))
  );

  for (const packageDir of (instructions.packageDirs || [])) {
    const {label, dir, excludes} = Object.assign({excludes: []}, packageDir);
    console.log(`Packaging ${label}`);
    tags = await createPackagesSinceTag(repoUrl, tagsSpec, dir, excludes, fixVersions, transform, versionFilter)
    console.log(label, tags);
  }

  for (const individualPackage of (instructions.packageIndividual || [])) {
    const defaults = {excludes: [], composerJsonPath: '', emptyDirsToAdd: []};
    const {label, dir, excludes, composerJsonPath, emptyDirsToAdd} = Object.assign(defaults, individualPackage);
    console.log(`Packaging ${label}`);
    tags = await createPackageSinceTag(repoUrl, tagsSpec, dir, excludes, composerJsonPath, emptyDirsToAdd, fixVersions, transform, versionFilter);
    console.log(label, tags);
  }

  for (const packageMeta of (instructions.packageMetaFromDirs || [])) {
    const {label, dir} = packageMeta;
    console.log(`Packaging ${label}`);
    tags = await createMetaPackagesFromRepoDir(repoUrl, tagsSpec, dir, fixVersions, transform, versionFilter);
    console.log(label, tags);
  }

  for (const packageReplacement of (instructions.packageReplacements || [])) {
    await replacePackageFiles(...Object.values(packageReplacement));
  }

  if (instructions.magentoCommunityEditionMetapackage) {
    console.log('Packaging Magento Community Edition Product Metapackage');
    tags = await createMagentoCommunityEditionMetapackagesSinceTag(repoUrl, tagsSpec, fixVersions, transform, vendor, versionFilter);
    console.log('Magento Community Edition Product Metapackage', tags);
  }

  if (instructions.magentoCommunityEditionProject) {
    console.log('Packaging Magento Community Edition Project');
    tags = await createProjectPackagesSinceTag(repoUrl, tagsSpec, fixVersions, transform, vendor, versionFilter);
    console.log('Magento Community Edition Project', tags);
  }

  repo.clearCache();
}

module.exports = {
  copyAdditionalPackages,
  processMirrorInstruction
}
