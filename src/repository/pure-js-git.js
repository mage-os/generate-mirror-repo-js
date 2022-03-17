const path = require('path');
const fs = require('fs');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');

let cache = {};
let report = console.log;

let repoBaseDir;

function dirForRepoUrl(url) {
  // todo: add vendor namespace directory inside of repoBaseDir to path?
  if (url.substr(-4).toLowerCase() === '.git') {
    url = url.substr(0, url.length - 4);
  }
  if (url.substr(-1) === '/') {
    url = url.substr(0, url.length - 1);
  }
  return url.includes('/')
    ? url.substr(url.lastIndexOf('/'))
    : url;
}

function collapseCommit(commit) {
  return commit && {
    oid: commit.oid,
    timestamp: commit.commit.author.timestamp
  } || {}
}

async function cloneRepo(url, dir, ref) {
  report(`Creating shallow clone of ${ref || 'all branches'} w/o working copy in "${dir.split('/').slice(-2).join('/')}"...`);
  
  if (! fs.existsSync(path.dirname(dir))) {
    fs.mkdirSync(path.dirname(dir), {recursive: true})
  }
  
  const refConf = ref ? {ref, singleBranch: true} : {};
  await git.clone({fs, http, cache, url, dir, noCheckout: true, depth: 30, onProgress: progress(), ...refConf});
}

function fullRepoPath(url) {
  return path.join(repoBaseDir, dirForRepoUrl(url));
}

async function initRepo(url, ref) {
  const dir = fullRepoPath(url);
  
  if (! fs.existsSync(dir)) {
    await cloneRepo(url, dir, ref);
  }

  return dir;
}

function progress() {
  
}

async function expandHistory(url, depth) {
  const dir = fullRepoPath(url);
  return git.fetch({fs, http, cache, dir, depth, relative: true, onProgress: progress()});
}

function isFoldersIn(dir) {
  const targetDir = dir
    ? (dir.substr(-1) === '/' ? dir.substr(0, dir.length - 1) : dir)
    : '.';
  
  return async (filepath, [entry]) => {
    const isDir = await entry.type() === 'tree';
    if (isDir && (filepath === '.' || path.dirname(filepath) === targetDir)) {
      return filepath;
    }
  }
}

let isFirstWalk = true;
function listFilesIn(url, dir) {
  const targetDir = dir
    ? (dir.substr(-1) !== '/' ? dir + '/' : dir)
    : '';
  
  return async (filepath, [entry]) => {
    if (isFirstWalk) {
      isFirstWalk = false;
      report(`Loading git repository ${url} into memory...`);
    }
    const dirname = path.dirname(filepath);
    const isFile = 'blob' === (await entry.type());
    if (isFile && (targetDir === '' || dirname.startsWith(targetDir) || dirname + '/' === targetDir)) {
      return {
        filepath,
        contentBuffer: await entry.content(),
        isExecutable: 0o100755 === (await entry.mode())
      };
    }
  }
}

async function lastCommitHash(url, ref) {
  const dir = await initRepo(url, ref);
  const refConfig = ref ? {ref} : {};
  const result = await git.log({fs, dir, cache, ...refConfig});
  return result && result.length && result[0]['oid'];
}

// we can use the latest commit to determine the mtime for a given file
async function latestCommitForFile(url, filepath, ref) {

  report(`Finding latest commit for ${filepath}...`);
  const dir = await initRepo(url, ref);
  const commits = await git.log({fs, dir, cache})
  
  // from https://isomorphic-git.org/docs/en/snippets#git-log-path-to-file
  let lastSHA = null
  let lastCommit = null
  for (const commit of commits) {
    try {
      const o = await git.readObject({fs, dir, oid: commit.oid, cache, filepath})
      if (o.oid !== lastSHA) {
        if (lastSHA !== null) return collapseCommit(lastCommit)
        lastSHA = o.oid
      }
      lastCommit = commit
    } catch (err) {
      // file no longer there
      return collapseCommit(lastCommit)
    }
  }
  
  const lastKnown = commits[commits.length -1].oid;
  report(`Expanding clone history by 100, starting from ${lastKnown}`);
  await expandHistory(url, 100);
  const commitsBeforeLastKnown = await git.log({fs, dir, cache, ref: lastKnown});
   
  return commitsBeforeLastKnown.length > 1
    ? await latestCommitForFile(url, filepath, ref) // found new commits, try again
    : {}; // reached first commit, no commits that matter in entire history
}

module.exports = {
  async listFolders(url, path, ref) {
    const dir = await initRepo(url, ref);
    const trees = [git.TREE({ref})];
    //report(`Reading folders in "${path || '.'}"`);
    return git.walk({fs, dir, trees, cache, map: isFoldersIn(path)});
  },
  async listFiles(url, path, ref, excludes) {
    const dir = await initRepo(url, ref);
    const trees = [git.TREE({ref})];
    //report(`Listing files in ${path}`);
    return await git.walk({fs, dir, trees, cache, map: listFilesIn(url, path)});
  },
  async readFile(url, filepath, ref) {
    const dir = await initRepo(url, ref);
    const oid = ref
      ? await git.resolveRef({fs, dir, ref, cache})
      : (await lastCommitHash(url));

    const result = await git.readBlob({fs, dir, filepath, cache, oid});
    return result.blob;
  },
  async lastCommitTimeForFile(url, filepath, ref) {
    const commit = await latestCommitForFile(url, filepath, ref);
    return commit.timestamp && new Date(commit.timestamp * 1000); // convert seconds to JS timestamp ms
  },
  async listTags(url) {
    const dir = await initRepo(url);
    return git.listTags({fs, dir});
  },
  clearCache() {
    cache = {};
  },
  setStorageDir(dir) {
    repoBaseDir = dir;
  },
  testing: {
    dirForRepoUrl,
  }
}