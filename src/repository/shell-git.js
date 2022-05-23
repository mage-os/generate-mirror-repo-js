const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

let repoBaseDir;
let report = console.log;

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

function fullRepoPath(url) {
  return path.join(repoBaseDir, dirForRepoUrl(url));
}

function trimDir(dir) {
  return dir.substr(-1) === '/' ? dir.substr(0, dir.length -1) : dir;
}

async function exec(cmd, options) {
  return new Promise((resolve, reject) => {
    const bufferBytes = 4 * 1024 * 1024; // 4M
    childProcess.exec(cmd, {maxBuffer: bufferBytes, ...(options || {})}, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing command: ${error.message}`);
      }
      if (stderr) {
        reject(`[error] ${stderr}`);
      }
      //console.log(`[${Math.ceil(stdout.length / 1024)}kb] ${cmd}`);
      resolve(stdout);
    });
  });
}

async function cloneRepo(url, dir, ref) {
  report(`Creating shallow ${url} clone of ${ref || 'all branches'} in "${dir.split('/').slice(-2).join('/')}"...`);

  if (! fs.existsSync(path.dirname(dir))) {
    fs.mkdirSync(path.dirname(dir), {recursive: true})
  }

  return exec(`git clone --depth 15 --quiet --no-single-branch ${url} ${dir}`);
}

async function initRepo(url, ref) {
  const dir = fullRepoPath(url);

  if (! fs.existsSync(dir)) {
    await cloneRepo(url, dir, ref);
  }
  if (ref) {
    const current = (await exec(`git describe --tags --always`, {cwd: dir})).trim();
    if (current !== ref) {
      await exec(`git checkout --force --quiet ${ref}`, {cwd: dir})
    }
  }
  
  return dir;
}

async function listFileNames(repoDir, path, excludes) {
  const excludeGit = `-not -path '.git' -not -path '.git/*'`;
  const excludeArgs = excludes.map(excludePath => {
    return excludePath.substr(-1) === '/'
      ? `-not -path '${excludePath}*'`
      : `-not -path '${excludePath}'`;
  }).join(' ');
  const out = await exec(`find '${path || '.'}' -type f ${excludeGit} ${excludeArgs}`, {cwd: repoDir});
  const files = out.trim().split("\n");
  return path === ''
    ? files.map(file => file.substr(2)) // cut off leading ./ if path is empty
    : files;
  
}

module.exports = {
  async listFolders(url, pathInRepo, ref) {
    const dir = await initRepo(url, ref);
    const out = await exec(`ls -1 -d ${path.join(pathInRepo, '*/')}`, {cwd: dir});
    return out.trim().split("\n").map(trimDir);
  },
  async listFiles(url, pathInRepo, ref, excludes) {
    const dir = await initRepo(url, ref);
    const fileNames = await listFileNames(dir, pathInRepo, excludes || []);
    return fileNames.map(filepath => {
      const fullPath = path.join(dir, filepath);
      return {
        filepath,
        contentBuffer: fs.readFileSync(fullPath),
        isExecutable: 0o100755 === fs.statSync(fullPath).mode
      }
    });
  },
  async readFile(url, filepath, ref) {
    const dir = await initRepo(url, ref);
    return fs.readFileSync(path.join(dir, filepath), 'utf8');
  },
  async lastCommitTimeForFile(url, filepath, ref) {
    const dir = await initRepo(url, ref);
    const timestamp = exec(`git log -1 --pretty="format:%at" ${filepath}`, {cwd: dir})
    return new Date(parseInt(timestamp) * 1000); // convert seconds to JS timestamp ms
  },
  async listTags(url) {
    const dir = await initRepo(url);
    const out = await exec(`git tag`, {cwd: dir});
    return out.trim().split("\n");
  },
  async checkout(url, ref) {
    return initRepo(url, ref);
  },
  clearCache() {
    // noop
  },
  setStorageDir(dir) {
    repoBaseDir = dir;
  },
  testing: {
    dirForRepoUrl,
  }
}