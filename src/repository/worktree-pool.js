const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

// Use the same exec wrapper as shell-git.js - already returns a Promise
function execAsync(cmd, options) {
  return new Promise((resolve, reject) => {
    const bufferBytes = 4 * 1024 * 1024; // 4M
    const execOptions = {
      maxBuffer: bufferBytes,
      shell: true,
      ...(options || {})
    };
    
    childProcess.exec(cmd, execOptions, (error, stdout, stderr) => {
      if (error) {
        console.error(`Git command failed: ${cmd}`);
        console.error(`Error code: ${error.code}`);
        console.error(`Error details: ${error.message}`);
        reject(`Error executing command${options?.cwd ? ` in ${options.cwd}` : ''}: ${error.message}\n${stdout}`)
      }
      // Ignore stderr messages that are just progress info from git
      if (stderr && !stderr.includes('Preparing worktree') && !stderr.includes('Updating files:')) {
        reject(`[error] ${stderr}`);
      }
      resolve(stdout);
    });
  });
}

// Map of repository URL to worktree pools
const worktreePools = new Map();

// Track which worktrees are in use
const worktreeInUse = new Map();

// Limit concurrent git operations to prevent resource exhaustion
const MAX_CONCURRENT_GIT_OPS = 5;
let currentGitOps = 0;
const gitOpsQueue = [];

/**
 * Get or create a worktree pool for a repository
 */
function getWorktreePool(repoUrl) {
  if (!worktreePools.has(repoUrl)) {
    worktreePools.set(repoUrl, {
      mainDir: null,
      worktrees: [],
      nextId: 1
    });
  }
  return worktreePools.get(repoUrl);
}

/**
 * Wait for git operation slot
 */
async function waitForGitOpSlot() {
  if (currentGitOps < MAX_CONCURRENT_GIT_OPS) {
    currentGitOps++;
    return;
  }
  
  // Wait for a slot to become available
  return new Promise(resolve => {
    gitOpsQueue.push(resolve);
  });
}

/**
 * Release git operation slot
 */
function releaseGitOpSlot() {
  currentGitOps--;
  if (gitOpsQueue.length > 0) {
    const next = gitOpsQueue.shift();
    currentGitOps++;
    next();
  }
}

/**
 * Execute git command with concurrency control
 */
async function execGitCommand(cmd, options) {
  await waitForGitOpSlot();
  try {
    return await execAsync(cmd, options);
  } finally {
    releaseGitOpSlot();
  }
}

/**
 * Initialize the main repository if not already done
 */
async function initializeMainRepo(repoUrl, mainDir, regularRepoDir) {
  // Check if we already have a regular clone we can use
  if (fs.existsSync(regularRepoDir) && fs.existsSync(path.join(regularRepoDir, '.git'))) {
    // Use the existing regular repository
    return regularRepoDir;
  }
  
  if (!fs.existsSync(mainDir)) {
    console.log(`Creating main repository for worktrees at ${mainDir}`);
    await execGitCommand(`git clone --no-checkout ${repoUrl} ${mainDir}`);
  }
  return mainDir;
}

/**
 * Create a new worktree for a specific ref
 */
async function createWorktree(mainDir, worktreeDir, ref) {
  try {
    // Create the worktree
    await execGitCommand(`git worktree add --detach ${worktreeDir}`, { cwd: mainDir });
    
    // Checkout the specific ref
    if (ref) {
      await execGitCommand(`git checkout --force ${ref}`, { cwd: worktreeDir });
    }
    
    return worktreeDir;
  } catch (error) {
    // If worktree creation fails, try to fetch the ref first
    if (ref && error.toString().includes('fatal:')) {
      try {
        await execGitCommand(`git fetch origin ${ref}:${ref}`, { cwd: mainDir });
        await execGitCommand(`git worktree add --detach ${worktreeDir}`, { cwd: mainDir });
        await execGitCommand(`git checkout --force ${ref}`, { cwd: worktreeDir });
        return worktreeDir;
      } catch (retryError) {
        console.error(`Failed to create worktree for ${ref}: ${retryError.toString()}`);
        throw retryError;
      }
    }
    console.error(`Worktree creation error: ${error.toString()}`);
    throw error;
  }
}

/**
 * Get an available worktree for a specific repository and ref
 */
async function acquireWorktree(repoUrl, ref, baseDir) {
  const pool = getWorktreePool(repoUrl);
  
  // Initialize main repo if needed
  if (!pool.mainDir) {
    const repoName = repoUrl.split('/').pop().replace('.git', '');
    const regularRepoDir = path.join(baseDir, repoName);
    const bareRepoDir = path.join(baseDir, `${repoName}-worktree-base`);
    pool.mainDir = await initializeMainRepo(repoUrl, bareRepoDir, regularRepoDir);
  }
  
  // Look for an existing free worktree with the same ref
  for (const worktree of pool.worktrees) {
    const key = `${repoUrl}:${worktree.dir}`;
    if (!worktreeInUse.get(key) && worktree.ref === ref) {
      worktreeInUse.set(key, true);
      return worktree.dir;
    }
  }
  
  // Look for any free worktree we can reuse
  for (const worktree of pool.worktrees) {
    const key = `${repoUrl}:${worktree.dir}`;
    if (!worktreeInUse.get(key)) {
      worktreeInUse.set(key, true);
      // Checkout the new ref
      if (ref && worktree.ref !== ref) {
        await execGitCommand(`git checkout --force ${ref}`, { cwd: worktree.dir });
        worktree.ref = ref;
      }
      return worktree.dir;
    }
  }
  
  // Create a new worktree
  const worktreeId = pool.nextId++;
  const repoName = repoUrl.split('/').pop().replace('.git', '');
  const worktreeDir = path.join(baseDir, `${repoName}-wt-${worktreeId}`);
  
  await createWorktree(pool.mainDir, worktreeDir, ref);
  
  const worktree = { dir: worktreeDir, ref };
  pool.worktrees.push(worktree);
  
  const key = `${repoUrl}:${worktreeDir}`;
  worktreeInUse.set(key, true);
  
  console.log(`Created worktree ${worktreeId} for ${repoName} at ${ref || 'HEAD'}`);
  return worktreeDir;
}

/**
 * Release a worktree back to the pool
 */
function releaseWorktree(repoUrl, worktreeDir) {
  const key = `${repoUrl}:${worktreeDir}`;
  worktreeInUse.set(key, false);
}

/**
 * Clean up all worktrees for a repository
 */
async function cleanupWorktrees(repoUrl) {
  const pool = getWorktreePool(repoUrl);
  
  if (!pool.mainDir) return;
  
  // Remove all worktrees
  for (const worktree of pool.worktrees) {
    try {
      await execAsync(`git worktree remove --force ${worktree.dir}`, { cwd: pool.mainDir });
    } catch (error) {
      // Ignore errors, worktree might already be removed
    }
  }
  
  // Prune worktree list
  try {
    await execAsync(`git worktree prune`, { cwd: pool.mainDir });
  } catch (error) {
    // Ignore errors
  }
  
  // Clear the pool
  worktreePools.delete(repoUrl);
  
  // Clear usage tracking
  for (const [key] of worktreeInUse) {
    if (key.startsWith(repoUrl + ':')) {
      worktreeInUse.delete(key);
    }
  }
}

/**
 * Clean up all worktrees for all repositories
 */
async function cleanupAllWorktrees() {
  const urls = Array.from(worktreePools.keys());
  await Promise.all(urls.map(url => cleanupWorktrees(url)));
}

module.exports = {
  acquireWorktree,
  releaseWorktree,
  cleanupWorktrees,
  cleanupAllWorktrees
};