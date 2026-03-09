const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

let repoBaseDir;
let report = console.log;

/*
 * Repositories may need to be cloned or may already exist. They may be mounted in a container from a variety of
 * host systems. The .git folder may be owned by a different user than the one running this script.
 * Because of this we need to run `git config --global --add safe.directory` for each one the first time
 * it is used, so git doesn't complain about dubious ownership.
 * We use initializedRepositories to memoize which one already have been used to minimize having to shell out.
 */
const initializedRepositories = {};

const memoizedWorkingCopyStats = {}
async function memoizeWorkingCopyStat(dir, type, cmd) {
  if (memoizedWorkingCopyStats[dir] === undefined) memoizedWorkingCopyStats[dir] = {}
  if (memoizedWorkingCopyStats[dir][type] === undefined) memoizedWorkingCopyStats[dir][type] = await cmd()
  return memoizedWorkingCopyStats[dir][type];
}

function clearWorkingCopyStat(dir) {
  delete memoizedWorkingCopyStats[dir]
}

function dirForRepoUrl(url) {
  // todo: add vendor namespace directory inside of repoBaseDir to path?
  if (url.slice(-4).toLowerCase() === '.git') {
    url = url.slice(0, url.length - 4);
  }
  if (url.slice(-1) === '/') {
    url = url.slice(0, url.length - 1);
  }
  return url.includes('/')
    ? url.slice(url.lastIndexOf('/'))
    : url;
}

function fullRepoPath(url) {
  return path.join(repoBaseDir, dirForRepoUrl(url));
}

function trimDir(dir) {
  return dir.slice(-1) === '/' ? dir.slice(0, dir.length -1) : dir;
}

/**
 * Ensure ref is secure to use as shell argument
 *
 * Escaping user supplied arguments is very hard, and since the ref names are based on what git repo branches exist,
 * this method will throw an exception if it determines anything fishy.
 *
 * Rejects: empty/null values, leading hyphens (flag injection), spaces, backticks, dollar signs,
 * newlines, tabs, carriage returns, null bytes, pipes, ampersands, and shell redirection characters.
 *
 * @param {String} ref
 */
function validateRefIsSecure(ref) {
  if (!ref || ref.substring(0, 1) === '-' || ref.includes(' ') || ref.includes('`') || ref.includes('$')) {
    throw new Error(`Rejecting the ref "${ref}" as potentially insecure`)
  }
  // Check for additional shell metacharacters that could enable command injection
  const shellMetacharacters = ['\n', '\t', '\r', '\0', '|', '&', '>', '<'];
  for (const char of shellMetacharacters) {
    if (ref.includes(char)) {
      throw new Error(`Rejecting the ref "${ref}" as potentially insecure`)
    }
  }
  return ref;
}

/**
 * Ensure branch name is secure to use as shell argument
 *
 * Rejects: empty/null values, leading hyphens (flag injection), spaces, backticks, dollar signs,
 * newlines, tabs, carriage returns, null bytes, pipes, ampersands, and shell redirection characters.
 *
 * @param {String} branch
 */
function validateBranchIsSecure(branch) {
  if (!branch || branch.substring(0, 1) === '-' || branch.includes(' ') || branch.includes('`') || branch.includes('$')) {
    throw new Error(`Rejecting the branch "${branch}" as potentially insecure`)
  }
  // Check for additional shell metacharacters that could enable command injection
  const shellMetacharacters = ['\n', '\t', '\r', '\0', '|', '&', '>', '<'];
  for (const char of shellMetacharacters) {
    if (branch.includes(char)) {
      throw new Error(`Rejecting the branch "${branch}" as potentially insecure`)
    }
  }
  return branch;
}

async function exec(cmd, options) {
  return new Promise((resolve, reject) => {
    const bufferBytes = 4 * 1024 * 1024; // 4M
    childProcess.exec(cmd, {maxBuffer: bufferBytes, ...(options || {})}, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing command${options?.cwd ? ` in ${options.cwd}` : ''}: ${error.message}\n${stdout}`)
      }
      if (stderr) {
        reject(`[error] ${stderr}`);
      }
      resolve(stdout);
    });
  });
}



/*
 * Relaxing permissions is required to work around issues when running in docker with a mounted dir:
 *   fatal: detected dubious ownership in repository at '...'
 */
async function relaxRepoOwnerPermissions(dir) {
  if (! initializedRepositories['*']) {
    initializedRepositories['*'] = true
    return exec(`git config --global --add safe.directory "*"`, {cwd: dir})
  }
}

async function cloneRepo(url, dir, ref) {
  report(`Creating shallow ${url} clone of ${ref || 'all branches'} in "${dir.split('/').slice(-2).join('/')}"...`);

  if (! fs.existsSync(path.dirname(dir))) {
    fs.mkdirSync(path.dirname(dir), {recursive: true})
  }

  clearWorkingCopyStat(dir)

  return exec(`git clone --depth=1 --quiet --no-single-branch ${url} ${dir}`);
}

async function currentTag(dir) {
  const cmd = async () => (await exec(`git describe --tags --always`, {cwd: dir})).trim();
  return memoizeWorkingCopyStat(dir, 'tag', cmd)
}

async function currentBranch(dir) {
  const cmd = async () => (await exec(`git branch --show-current`, {cwd: dir})).trim()
  return memoizeWorkingCopyStat(dir, 'branch', cmd)
}

async function currentCommit(dir) {
  const cmd = async () => (await exec(`git log -1 --pretty=%H`, {cwd: dir})).trim()
  return memoizeWorkingCopyStat(dir, 'commit', cmd)
}

async function initRepo(url, ref) {
  const dir = fullRepoPath(url);

  if (! fs.existsSync(dir)) {
    await cloneRepo(url, dir, ref);
  }

  await relaxRepoOwnerPermissions(dir);

  if (ref) {
    if (await currentTag(dir) !== ref && await currentBranch(dir) !== ref && await currentCommit(dir) !== ref) {
      clearWorkingCopyStat(dir)

      try {
        await exec(`git checkout --force --quiet ${ref}`, {cwd: dir});
      } catch (exception) {
        // In case the shallow clone doesn't include the ref, try fetching it
        await exec(`git fetch --quiet --depth=1 ${url} ${ref}`, {cwd: dir});
        await exec(`git checkout --force --quiet ${ref}`, {cwd: dir});
      }
    }
  }

  return dir;
}


async function listFileNames(repoDir, path, excludes) {
  const excludeGit = `-not -path '.git' -not -path '.git/*'`;
  const excludeArgs = excludes.map(excludePath => {
    return excludePath.slice(-1) === '/'
      ? `-not -path '${excludePath}*'`
      : `-not -path '${excludePath}'`;
  }).join(' ');
  const out = await exec(`find '${path || '.'}' -type f ${excludeGit} ${excludeArgs}`, {cwd: repoDir});
  const files = out.trim().split("\n");
  return path === ''
    ? files.map(file => file.slice(2)) // cut off leading ./ if path is empty
    : files;

}

async function createBranch(url, branch, ref) {
  const dir = fullRepoPath(url);

  clearWorkingCopyStat(dir)
  if (branch) {
    if ((await exec(`git branch -l ${branch}`, {cwd: dir})).includes(branch)) {
      //console.log(`checking out branch "${branch}" (branch already existed)`)
      await exec(`git checkout --force --quiet ${branch}`, {cwd: dir})
      return dir;
    }

    //console.log(`checking out branch "${branch}" (creating new branch)`)
    await exec(`git checkout --force --quiet -b ${branch} ${ref}`, {cwd: dir})
  }

  return dir;
}

module.exports = {
  async listFolders(url, pathInRepo, ref) {
    validateRefIsSecure(ref);
    const dir = await initRepo(url, ref);
    if (! fs.existsSync(path.join(dir, pathInRepo))) return [];
    const out = await exec(`ls -1 -d ${path.join(pathInRepo, '*/')}`, {cwd: dir});
    return out.trim().split("\n").map(trimDir);
  },
  async listFiles(url, pathInRepo, ref, excludes) {
    validateRefIsSecure(ref);
    const dir = await initRepo(url, ref);
    if (! fs.existsSync(path.join(dir, pathInRepo))) return [];
    const excludeStrings = excludes.map(exclude => typeof exclude === 'function' ? exclude(ref) : exclude).filter(exclude => exclude.length > 0);
    const fileNames = await listFileNames(dir, pathInRepo, excludeStrings || []);
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
    validateRefIsSecure(ref);
    const dir = await initRepo(url, ref);
    return fs.readFileSync(path.join(dir, filepath), 'utf8');
  },
  async lastCommitTimeForFile(url, filepath, ref) {
    validateRefIsSecure(ref);
    const dir = await initRepo(url, ref);
    const timestamp = await exec(`git log -1 --pretty="format:%at" ${filepath}`, {cwd: dir})
    return new Date(parseInt(timestamp) * 1000); // convert seconds to JS timestamp ms
  },
  async listTags(url) {
    const dir = await initRepo(url);
    const out = await exec(`git tag`, {cwd: dir});
    const result = out.trim();
    // no tags? return empty array
    return result.length === 0 ? [] : result.split("\n");
  },
  async checkout(url, ref) {
    validateRefIsSecure(ref);
    return initRepo(url, ref);
  },
  async createBranch(url, branch, ref) {
    validateBranchIsSecure(ref);
    validateBranchIsSecure(branch);
    return createBranch(url, branch, ref);
  },
  async createTagForRef(url, ref, tag, message, details) {
    validateRefIsSecure(ref);
    validateRefIsSecure(tag);
    const dir = await initRepo(url);
    const messageForTag = (message || '').replaceAll("'", '');
    const tags = await this.listTags(url);
    if (tags.includes(tag)) {
      // Throw if the tag was not created by package generator
      if (messageForTag.length > 0) {
        const existingMessageOfTag = await exec(`git tag -n ${tag}`, {cwd: dir});
        if (existingMessageOfTag.includes(messageForTag)) {
          return
        }
      }
      throw (details || `Tag ${tag} already exists on repo ${url}`);
    }
    await exec(`git config user.email "info@mage-os.org"`, {cwd: dir});
    await exec(`git config user.name "Mage-OS CI"`, {cwd: dir});
    await exec(`git tag -a ${tag} ${ref} -m '${messageForTag}'`, {cwd: dir});
  },
  async pull(url, ref) {
    validateRefIsSecure(ref)
    const dir = await initRepo(url, ref)
    await exec(`git pull --ff-only --quiet origin ${ref}`, {cwd: dir})
    return dir
  },
  async addUpdated(url, pathSpec) {
    const dir = await initRepo(url)
    await exec(`git add --update -- ${ pathSpec }`, {cwd: dir})
    return dir
  },
  async commit(url, branch, message) {
    const dir = await initRepo(url, branch)
    await exec(`git config user.email "info@mage-os.org"`, {cwd: dir});
    await exec(`git config user.name "Mage-OS CI"`, {cwd: dir});
    await exec(`git commit --no-gpg-sign -m'${ (message || '').replaceAll("'", '"') }'`, {cwd: dir})
    return dir
  },
  clearCache() {
    // noop
  },
  setStorageDir(dir) {
    repoBaseDir = dir
  },
  testing: {
    dirForRepoUrl,
    trimDir,
    validateRefIsSecure,
    validateBranchIsSecure,
    exec,
    memoizeWorkingCopyStat,
    clearWorkingCopyStat,
    initRepo,
    fullRepoPath,
  }
}
