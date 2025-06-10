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
const tagCache = new Map(); // Cache for git tags to avoid repeated fetches
const gitConfigCache = new Set(); // Track which repos have git config set

const memoizedWorkingCopyStats = {}
const refCheckoutCache = {} // Cache to track which ref is checked out in each repo
const gitOperationQueue = new Map() // Queue to prevent concurrent operations on same repo

async function memoizeWorkingCopyStat(dir, type, cmd) {
  if (memoizedWorkingCopyStats[dir] === undefined) memoizedWorkingCopyStats[dir] = {}
  if (memoizedWorkingCopyStats[dir][type] === undefined) memoizedWorkingCopyStats[dir][type] = await cmd()
  return memoizedWorkingCopyStats[dir][type];
}

function clearWorkingCopyStat(dir) {
  delete memoizedWorkingCopyStats[dir]
  delete refCheckoutCache[dir]
}

// Ensure git operations on the same repository are serialized
async function serializedGitOperation(dir, operation) {
  if (!gitOperationQueue.has(dir)) {
    gitOperationQueue.set(dir, Promise.resolve());
  }
  
  const promise = gitOperationQueue.get(dir).then(() => operation());
  gitOperationQueue.set(dir, promise);
  
  return promise;
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
 * @param {String} ref
 */
function validateRefIsSecure(ref) {
  if (ref === undefined || ref === null) {
    return ref; // Allow undefined/null refs for initial cloning
  }
  if (ref.substring(0, 1) === '-' || ref.includes(' ') || ref.includes('`') || ref.includes('$')) {
    throw new Error(`Rejecting the ref "${ref}" as potentially insecure`)
  }
  return ref;
}

function validateBranchIsSecure(branch) {
  if (!branch || branch.substring(0, 1) === '-' || branch.includes(' ') || branch.includes('`') || branch.includes('$')) {
    throw new Error(`Rejecting the branch "${branch}" as potentially insecure`)
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

  // Use optimized shallow clone with better depth control
  const cloneCmd = ref 
    ? `git clone --depth=1 --quiet --branch=${ref} ${url} ${dir}` // Clone specific branch/tag
    : `git clone --depth=50 --quiet --no-single-branch ${url} ${dir}`; // Clone with reasonable depth for all branches
  
  try {
    await exec(cloneCmd);
    
    // Pre-fetch tags for future use if this is a full clone
    if (!ref) {
      try {
        await exec(`git fetch --tags --depth=1`, {cwd: dir});
      } catch (e) {
        // Tag fetching is optional, don't fail the whole operation
        report(`Warning: Could not fetch tags for ${url}: ${e.message}`);
      }
    }
    
    return;
  } catch (error) {
    // Fallback to basic clone if optimized clone fails
    report(`Optimized clone failed, falling back to basic clone: ${error.message}`);
    return exec(`git clone --depth=1 --quiet --no-single-branch ${url} ${dir}`);
  }
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

async function initRepoWithoutCheckout(url) {
  const dir = fullRepoPath(url);
  
  // Only serialize the initial clone operation
  if (!fs.existsSync(dir)) {
    return serializedGitOperation(dir, async () => {
      if (!fs.existsSync(dir)) { // Double-check after acquiring lock
        await cloneRepo(url, dir);
      }
      await relaxRepoOwnerPermissions(dir);
      return dir;
    });
  }
  
  await relaxRepoOwnerPermissions(dir);
  return dir;
}

async function initRepo(url, ref) {
  const dir = await initRepoWithoutCheckout(url);

  if (ref) {
    // Check if we already have this ref checked out
    const cachedRef = refCheckoutCache[dir];
    if (cachedRef === ref) {
      return dir;
    }

    // Only check current state if we don't have cached info
    if (!cachedRef) {
      const [currentTagResult, currentBranchResult, currentCommitResult] = await Promise.all([
        currentTag(dir).catch(() => null),
        currentBranch(dir).catch(() => null), 
        currentCommit(dir).catch(() => null)
      ]);
      
      if (currentTagResult === ref || currentBranchResult === ref || currentCommitResult === ref) {
        refCheckoutCache[dir] = ref;
        return dir;
      }
    }

    // Serialize only the checkout operation
    return serializedGitOperation(dir, async () => {
      clearWorkingCopyStat(dir);

      try {
        await exec(`git checkout --force --quiet ${ref}`, {cwd: dir});
        refCheckoutCache[dir] = ref;
      } catch (exception) {
        // In case the shallow clone doesn't include the ref, try fetching it
        await exec(`git fetch --quiet --depth=1 ${url} ${ref}`, {cwd: dir});
        await exec(`git checkout --force --quiet ${ref}`, {cwd: dir});
        refCheckoutCache[dir] = ref;
      }
      return dir;
    });
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
    if (ref !== undefined && ref !== null) validateRefIsSecure(ref);
    const dir = await initRepo(url, ref);
    if (! fs.existsSync(path.join(dir, pathInRepo))) return [];
    const out = await exec(`ls -1 -d ${path.join(pathInRepo, '*/')}`, {cwd: dir});
    return out.trim().split("\n").map(trimDir);
  },
  async listFiles(url, pathInRepo, ref, excludes) {
    if (ref !== undefined && ref !== null) validateRefIsSecure(ref);
    
    // Ensure repo exists but don't serialize the listing operation
    const dir = await initRepoWithoutCheckout(url);
    
    // Check if we need to checkout a different ref
    const cachedRef = refCheckoutCache[dir];
    if (ref && cachedRef !== ref) {
      // Only checkout if different ref needed
      await initRepo(url, ref);
    }
    
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
    if (ref !== undefined && ref !== null) validateRefIsSecure(ref);
    const dir = await initRepo(url, ref);
    return fs.readFileSync(path.join(dir, filepath), 'utf8');
  },
  async lastCommitTimeForFile(url, filepath, ref) {
    if (ref !== undefined && ref !== null) validateRefIsSecure(ref);
    const dir = await initRepo(url, ref);
    const timestamp = exec(`git log -1 --pretty="format:%at" ${filepath}`, {cwd: dir})
    return new Date(parseInt(timestamp) * 1000); // convert seconds to JS timestamp ms
  },
  async listTags(url) {
    // Check cache first
    if (tagCache.has(url)) {
      return tagCache.get(url);
    }
    
    const dir = await initRepoWithoutCheckout(url);
    
    // Fetch latest tags if not recently fetched
    try {
      await exec(`git fetch --tags --quiet`, {cwd: dir});
    } catch (e) {
      // Non-fatal, continue with existing tags
    }
    
    const out = await exec(`git tag`, {cwd: dir});
    const result = out.trim();
    const tags = result.length === 0 ? [] : result.split("\n");
    
    // Cache the result
    tagCache.set(url, tags);
    
    return tags;
  },
  async checkout(url, ref) {
    if (ref !== undefined && ref !== null) validateRefIsSecure(ref);
    return initRepo(url, ref);
  },
  async createBranch(url, branch, ref) {
    validateBranchIsSecure(ref);
    validateBranchIsSecure(branch);
    return createBranch(url, branch, ref);
  },
  async createTagForRef(url, ref, tag, message, details) {
    if (ref !== undefined && ref !== null) validateRefIsSecure(ref);
    if (tag !== undefined && tag !== null) validateRefIsSecure(tag);
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
    
    // Only set git config once per repository
    if (!gitConfigCache.has(dir)) {
      await exec(`git config user.email "info@mage-os.org"`, {cwd: dir});
      await exec(`git config user.name "Mage-OS CI"`, {cwd: dir});
      gitConfigCache.add(dir);
    }
    
    await exec(`git tag -a ${tag} ${ref} -m '${messageForTag}'`, {cwd: dir});
  },
  async pull(url, ref) {
    if (ref !== undefined && ref !== null) validateRefIsSecure(ref)
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
    
    // Only set git config once per repository
    if (!gitConfigCache.has(dir)) {
      await exec(`git config user.email "info@mage-os.org"`, {cwd: dir});
      await exec(`git config user.name "Mage-OS CI"`, {cwd: dir});
      gitConfigCache.add(dir);
    }
    
    await exec(`git commit --no-gpg-sign -m'${ (message || '').replaceAll("'", '"') }'`, {cwd: dir})
    return dir
  },
  clearCache() {
    tagCache.clear();
    gitConfigCache.clear();
    Object.keys(memoizedWorkingCopyStats).forEach(key => delete memoizedWorkingCopyStats[key]);
    Object.keys(refCheckoutCache).forEach(key => delete refCheckoutCache[key]);
    gitOperationQueue.clear();
  },
  setStorageDir(dir) {
    repoBaseDir = dir
  },
  testing: {
    dirForRepoUrl,
  }
}
