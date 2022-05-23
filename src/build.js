const fs = require('fs');
const repo = require('./repository');
const {isVersionGreaterOrEqual} = require('./utils');
const {
  createPackagesForRef,
  createPackageForRef,
  createMagentoCommunityEditionMetapackage,
  createMagentoCommunityEditionProject,
  createMetaPackageFromRepoDir
} = require('./package-modules');


async function listTagsFrom(url, from) {
  return (await repo.listTags(url)).filter(tag => isVersionGreaterOrEqual(tag, from));
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
        .filter(file => file.substr(-4) === '.zip')
        .filter(file => ! fs.existsSync(`${dest}/${file}`));
      console.log(`Copying ${archives.length} additional archive(s) into build directory.`);
      archives.map(file => {
        fs.copyFile(`${dir}/${file}`, `${dest}/${file}`, err => err && console.log(err))
      })
    })
  }
}

async function createMagentoCommunityEditionMetapackagesSinceTag(url, from) {
  const tags = await listTagsFrom(url, from);
  console.log(`Versions to process: ${tags.join(', ')}`);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    await createMagentoCommunityEditionMetapackage(url, tag);
  }
  return tags;
}

async function createProjectPackagesSinceTag(url, from) {
  const tags = await listTagsFrom(url, from);
  console.log(`Versions to process: ${tags.join(', ')}`);
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    await createMagentoCommunityEditionProject(url, tag);
  }
  return tags;
}

async function createMetaPackagesFromRepoDir(url, from, path) {
  const tags = await listTagsFrom(url, from);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    try {
      await createMetaPackageFromRepoDir(url, path, tag);
      built.push(tag);
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

async function createPackagesSinceTag(url, from, modulesPath, excludes) {
  const tags = await listTagsFrom(url, from);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    try {
      await createPackagesForRef(url, modulesPath, excludes, tag);
      built.push(tag)
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

async function createPackageSinceTag(url, from, modulesPath, excludes, composerJsonPath, emptyDirsToAdd) {
  const tags = await listTagsFrom(url, from);
  console.log(`Versions to process: ${tags.join(', ')}`);
  const built = [];
  for (const tag of tags) {
    console.log(`Processing ${tag}`);
    let composerJsonFile = '';
    // Note: if the composerJsonFile ends with the "template.json" the composer dependencies will be calculated
    // This is only used for the magento2-base-package
    if (composerJsonPath && composerJsonPath.length) {
      composerJsonFile = (composerJsonPath || '').replace('{{version}}', tag);
      composerJsonFile = fs.existsSync(composerJsonFile)
        ? composerJsonFile
        : (composerJsonPath || '').replace('{{version}}', 'template')
    }
    try {
      await createPackageForRef(url, modulesPath, excludes, tag, composerJsonFile, emptyDirsToAdd);
      built.push(tag);
    } catch (exception) {
      console.log(exception.message || exception);
    }
  }
  return built;
}

module.exports = {
  createPackageSinceTag,
  createPackagesSinceTag,
  createMetaPackagesFromRepoDir,
  createProjectPackagesSinceTag,
  createMagentoCommunityEditionMetapackagesSinceTag,
  copyAdditionalPackages,
}
