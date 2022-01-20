const path = require('path');
const fs = require('fs');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const ProgressBar = require('progress');

let cache = {};

const repoBaseDir = path.join(process.cwd(), 'repositories');

function dirForRepoUrl(url) {
  // todo: add vendor namespace to path
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
    message: commit.commit.message,
    timestamp: commit.commit.author.timestamp,
    timezoneOffset: commit.commit.author.timezoneOffset
  } || {}
}

async function cloneRepo(url, dir, ref) {
  console.log(`Creating shallow clone of ${ref} in "${dir.split('/').slice(-2).join('/')}" (without working copy)...`);
  const refConf = ref ? {ref} : {};
  await git.clone({fs, http, cache, url, dir, noCheckout: true, depth: 15, singleBranch: true, onProgress: progress(), ...refConf});
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
  const bar = new ProgressBar(':bar (:phase)', { total: 100, clear: true });
  const fn = event => {
    if (event.total) {
      bar.update(event.loaded / event.total, {phase: event.phase})
    } else {
      bar.tick(bar.curr, {phase: event.phase});
    }
  }
  fn.bar = bar;
  
  return fn;
}

async function expandHistory(url, depth) {
  const dir = fullRepoPath(url);
  const progressBar = progress()
  progressBar.bar.update(0, {phase: 'Initializing'})
  return git.fetch({fs, http, cache, dir, depth, relative: true, onProgress: progressBar});
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
    ? (dir.substr(-1) === '/' ? dir.substr(0, dir.length - 1) : dir)
    : '.';
  
  return async (filepath, [entry]) => {
    if (isFirstWalk) {
      isFirstWalk = false;
      console.log(`Loading git repository ${url} into memory...`);
    }
    const type = await entry.type();
    if (type === 'blob' && path.dirname(filepath).startsWith(targetDir)) {
      const mode = await entry.mode();
      return {
        filepath,
        contentBuffer: await entry.content(),
        isExecutable: 0o100755 === mode
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

// we need the latest commit to determine the mtime to set for a given file 
async function latestCommitForFile(url, filepath, ref) {

  console.log(`Finding latest commit for ${filepath}...`);
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
  console.log(`Expanding clone history by 100, starting from ${lastKnown}`);
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
    //console.log(`Reading folders in "${path || '.'}"`);
    return git.walk({fs, dir, trees, cache, map: isFoldersIn(path)});
  },
  async listFiles(url, path, ref) {
    const dir = await initRepo(url, ref);
    const trees = [git.TREE({ref})];
    //console.log(`Listing files in ${path}`);
    const files = await git.walk({fs, dir, trees, cache, map: listFilesIn(url, path)});
    for (const file of files) {
      const commit = await latestCommitForFile(url, file.filepath, ref);
      file.mtime = commit.timestamp;
    }
    return files;
  },
  async readFile(url, filepath, ref) {
    const dir = await initRepo(url, ref);
    const oid = ref
      ? await git.resolveRef({fs, dir, ref, cache})
      : (await lastCommitHash(url));

    const result = await git.readBlob({fs, dir, filepath, cache, oid});
    return result.blob;
  },
  testing: {
    dirForRepoUrl,
    async gitLogRefIsUsedAsStart(url, ref) {
      const dir = await initRepo(url, ref);
      const refConfig = ref ? {ref} : {};
      const commits = await git.log({fs, dir, cache, ...refConfig})
      const lastKnownOid = commits[commits.length -1].oid;

      const newCommitsSinceLastKnown = await git.log({fs, dir, cache, ref: lastKnownOid});
      
      return newCommitsSinceLastKnown.length;
    }
  }
}