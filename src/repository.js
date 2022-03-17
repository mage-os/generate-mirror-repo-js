const path = require("path");

// Choose git backend implementation
//const git = require('./repository/pure-js-git');
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
  clearCache() {
    git.clearCache()
  },
  setStorageDir(dir) {
    git.setStorageDir(dir);
  }
}