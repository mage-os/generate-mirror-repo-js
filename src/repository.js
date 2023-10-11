const path = require("path");

// Choose git backend implementation
const git = require('./repository/shell-git');

let repoBaseDir = path.join(process.cwd(), 'repositories');

git.setStorageDir(repoBaseDir)

module.exports = {
  async listFolders(url, path, ref) {
    return git.listFolders(url, path, ref);
  },
  async listFiles(url, path, ref, excludes) {
    return git.listFiles(url, path, ref, excludes)
  },
  async readFile(url, filepath, ref) {
    return git.readFile(url, filepath, ref)
  },
  async lastCommitTimeForFile(url, filepath, ref) {
    return git.lastCommitTimeForFile(url, filepath, ref)
  },
  async listTags(url) {
    return git.listTags(url)
  },
  async checkout(url, ref) {
    return git.checkout(url, ref);
  },
  async pull(url, ref) {
    return git.pull(url, ref);
  },
  async addUpdated(url, pathSpec) {
    return git.addUpdated(url, pathSpec);
  },
  async commit(url, branch, message) {
    return git.commit(url, branch, message);
  },
  async createTagForRef(url, ref, tag, message, details) {
    return git.createTagForRef(url, ref, tag, message, details)
  },
  async createBranch(url, branch, ref) {
    return git.createBranch(url, branch, ref)
  },
  clearCache() {
    git.clearCache()
  },
  setStorageDir(dir) {
    git.setStorageDir(dir);
  }
}
