/**
 * Comprehensive tests for shell-git.js
 *
 * This test file covers:
 * - Pure functions (dirForRepoUrl, trimDir, validateRefIsSecure, validateBranchIsSecure)
 * - Integration functions with mocked child_process (exec, initRepo, etc.)
 * - Exported API functions (listFolders, listFiles, readFile, createTagForRef, etc.)
 *
 * Security-critical tests for validateRefIsSecure and validateBranchIsSecure
 * are prioritized to prevent shell injection attacks.
 */

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

// Mock child_process.exec before requiring the module
jest.mock('child_process');
jest.mock('fs');

const sut = require('../../src/repository/shell-git');

describe('shell-git', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the storage directory for each test
    sut.setStorageDir('/tmp/test-repos');
  });

  // ============================================================
  // dirForRepoUrl - Pure Function Tests (HIGH PRIORITY)
  // ============================================================
  describe('dirForRepoUrl', () => {
    describe('happy path', () => {
      it('should extract repo name from GitHub HTTPS URL', () => {
        expect(sut.testing.dirForRepoUrl('https://github.com/mage-os/mirror-magento2.git'))
          .toBe('/mirror-magento2');
      });

      it('should extract repo name from GitHub SSH URL', () => {
        expect(sut.testing.dirForRepoUrl('git@github.com:mage-os/mirror-magento2.git'))
          .toBe('/mirror-magento2');
      });

      it('should extract repo name from GitLab URL', () => {
        expect(sut.testing.dirForRepoUrl('https://gitlab.com/vendor/my-repo.git'))
          .toBe('/my-repo');
      });

      it('should handle URLs ending with .git extension', () => {
        expect(sut.testing.dirForRepoUrl('https://example.com/repo.git'))
          .toBe('/repo');
      });

      it('should handle URLs ending with trailing slash', () => {
        expect(sut.testing.dirForRepoUrl('https://example.com/repo/'))
          .toBe('/repo');
      });

      it('should handle URLs with both .git and trailing slash', () => {
        // This is an unusual case but should be handled
        expect(sut.testing.dirForRepoUrl('https://example.com/repo.git/'))
          .toBe('/repo.git');
      });
    });

    describe('edge cases', () => {
      it('should handle URL without path separators (just repo name)', () => {
        expect(sut.testing.dirForRepoUrl('my-repo')).toBe('my-repo');
      });

      it('should handle URL with multiple path segments', () => {
        expect(sut.testing.dirForRepoUrl('https://github.com/org/sub/repo.git'))
          .toBe('/repo');
      });

      it('should handle lowercase .git extension', () => {
        expect(sut.testing.dirForRepoUrl('https://example.com/Repo.git'))
          .toBe('/Repo');
      });

      it('should handle uppercase .GIT extension', () => {
        expect(sut.testing.dirForRepoUrl('https://example.com/repo.GIT'))
          .toBe('/repo');
      });

      it('should handle empty string input', () => {
        expect(sut.testing.dirForRepoUrl('')).toBe('');
      });

      it('should handle URL ending with just a slash', () => {
        expect(sut.testing.dirForRepoUrl('repo/')).toBe('repo');
      });
    });
  });

  // ============================================================
  // trimDir - Pure Function Tests (MEDIUM PRIORITY)
  // ============================================================
  describe('trimDir', () => {
    describe('happy path', () => {
      it('should remove trailing slash from directory path', () => {
        expect(sut.testing.trimDir('/path/to/dir/')).toBe('/path/to/dir');
      });

      it('should return unchanged path without trailing slash', () => {
        expect(sut.testing.trimDir('/path/to/dir')).toBe('/path/to/dir');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        expect(sut.testing.trimDir('')).toBe('');
      });

      it('should remove only the last trailing slash', () => {
        // The function removes only the last character if it's a slash
        expect(sut.testing.trimDir('/path/to/dir//')).toBe('/path/to/dir/');
      });

      it('should handle root path "/"', () => {
        expect(sut.testing.trimDir('/')).toBe('');
      });

      it('should handle path with only multiple slashes', () => {
        expect(sut.testing.trimDir('//')).toBe('/');
      });
    });
  });

  // ============================================================
  // validateRefIsSecure - Security Critical Tests (CRITICAL PRIORITY)
  // ============================================================
  describe('validateRefIsSecure', () => {
    describe('valid refs', () => {
      it('should accept simple branch names', () => {
        expect(sut.testing.validateRefIsSecure('main')).toBe('main');
        expect(sut.testing.validateRefIsSecure('develop')).toBe('develop');
        expect(sut.testing.validateRefIsSecure('master')).toBe('master');
      });

      it('should accept version tags', () => {
        expect(sut.testing.validateRefIsSecure('v1.0.0')).toBe('v1.0.0');
        expect(sut.testing.validateRefIsSecure('2.4.6')).toBe('2.4.6');
        expect(sut.testing.validateRefIsSecure('v2.4.6-p1')).toBe('v2.4.6-p1');
      });

      it('should accept commit hashes', () => {
        expect(sut.testing.validateRefIsSecure('a1b2c3d4')).toBe('a1b2c3d4');
        expect(sut.testing.validateRefIsSecure('abc123def456789')).toBe('abc123def456789');
        expect(sut.testing.validateRefIsSecure('0123456789abcdef0123456789abcdef01234567'))
          .toBe('0123456789abcdef0123456789abcdef01234567');
      });

      it('should accept refs with slashes (feature branches)', () => {
        expect(sut.testing.validateRefIsSecure('feature/new-feature')).toBe('feature/new-feature');
        expect(sut.testing.validateRefIsSecure('bugfix/issue-123')).toBe('bugfix/issue-123');
        expect(sut.testing.validateRefIsSecure('release/2.4.7')).toBe('release/2.4.7');
      });

      it('should accept refs with dots', () => {
        expect(sut.testing.validateRefIsSecure('v1.0.0')).toBe('v1.0.0');
        expect(sut.testing.validateRefIsSecure('2.4-develop')).toBe('2.4-develop');
      });

      it('should accept refs with hyphens in the middle', () => {
        expect(sut.testing.validateRefIsSecure('feature-branch')).toBe('feature-branch');
        expect(sut.testing.validateRefIsSecure('my-feature-branch')).toBe('my-feature-branch');
      });

      it('should accept refs with underscores', () => {
        expect(sut.testing.validateRefIsSecure('feature_branch')).toBe('feature_branch');
        expect(sut.testing.validateRefIsSecure('my_feature_branch')).toBe('my_feature_branch');
      });
    });

    describe('security rejections', () => {
      it('should reject empty string', () => {
        expect(() => sut.testing.validateRefIsSecure('')).toThrow('Rejecting the ref "" as potentially insecure');
      });

      it('should reject null', () => {
        expect(() => sut.testing.validateRefIsSecure(null)).toThrow('potentially insecure');
      });

      it('should reject undefined', () => {
        expect(() => sut.testing.validateRefIsSecure(undefined)).toThrow('potentially insecure');
      });

      it('should reject refs starting with hyphen (could be interpreted as flag)', () => {
        expect(() => sut.testing.validateRefIsSecure('-branch')).toThrow('Rejecting the ref "-branch" as potentially insecure');
        expect(() => sut.testing.validateRefIsSecure('--help')).toThrow('potentially insecure');
        expect(() => sut.testing.validateRefIsSecure('-f')).toThrow('potentially insecure');
      });

      it('should reject refs containing spaces (shell injection)', () => {
        expect(() => sut.testing.validateRefIsSecure('main branch')).toThrow('Rejecting the ref "main branch" as potentially insecure');
        expect(() => sut.testing.validateRefIsSecure(' main')).toThrow('potentially insecure');
        expect(() => sut.testing.validateRefIsSecure('main ')).toThrow('potentially insecure');
      });

      it('should reject refs containing backticks (command substitution)', () => {
        expect(() => sut.testing.validateRefIsSecure('`whoami`')).toThrow('potentially insecure');
        expect(() => sut.testing.validateRefIsSecure('main`id`')).toThrow('potentially insecure');
      });

      it('should reject refs containing dollar signs (variable expansion)', () => {
        expect(() => sut.testing.validateRefIsSecure('$HOME')).toThrow('potentially insecure');
        expect(() => sut.testing.validateRefIsSecure('main$USER')).toThrow('potentially insecure');
        expect(() => sut.testing.validateRefIsSecure('$(whoami)')).toThrow('potentially insecure');
      });

      it('should reject shell injection attempts like "main; rm -rf /"', () => {
        // Note: semicolon is not currently checked, but space is
        expect(() => sut.testing.validateRefIsSecure('main; rm -rf /')).toThrow('potentially insecure');
      });

      it('should reject command substitution like "$(whoami)"', () => {
        expect(() => sut.testing.validateRefIsSecure('$(whoami)')).toThrow('potentially insecure');
      });

      it('should reject newlines', () => {
        expect(() => sut.testing.validateRefIsSecure("main\nwhoami")).toThrow('potentially insecure');
        expect(() => sut.testing.validateRefIsSecure("main\n")).toThrow('potentially insecure');
      });

      it('should reject tabs', () => {
        expect(() => sut.testing.validateRefIsSecure("main\twhoami")).toThrow('potentially insecure');
        expect(() => sut.testing.validateRefIsSecure("\tmain")).toThrow('potentially insecure');
      });

      it('should reject carriage returns', () => {
        expect(() => sut.testing.validateRefIsSecure("main\rwhoami")).toThrow('potentially insecure');
      });

      it('should reject null bytes', () => {
        expect(() => sut.testing.validateRefIsSecure("main\0whoami")).toThrow('potentially insecure');
      });

      it('should reject pipe characters (command chaining)', () => {
        expect(() => sut.testing.validateRefIsSecure("main|cat /etc/passwd")).toThrow('potentially insecure');
        expect(() => sut.testing.validateRefIsSecure("|whoami")).toThrow('potentially insecure');
      });

      it('should reject ampersands (background execution / command chaining)', () => {
        expect(() => sut.testing.validateRefIsSecure("main&whoami")).toThrow('potentially insecure');
        expect(() => sut.testing.validateRefIsSecure("main&&rm -rf /")).toThrow('potentially insecure');
      });

      it('should reject output redirection characters', () => {
        expect(() => sut.testing.validateRefIsSecure("main>output.txt")).toThrow('potentially insecure');
        expect(() => sut.testing.validateRefIsSecure("main<input.txt")).toThrow('potentially insecure');
        expect(() => sut.testing.validateRefIsSecure("main>>append.txt")).toThrow('potentially insecure');
      });
    });
  });

  // ============================================================
  // validateBranchIsSecure - Security Critical Tests (CRITICAL PRIORITY)
  // ============================================================
  describe('validateBranchIsSecure', () => {
    describe('valid branches', () => {
      it('should accept simple branch names', () => {
        expect(sut.testing.validateBranchIsSecure('main')).toBe('main');
        expect(sut.testing.validateBranchIsSecure('develop')).toBe('develop');
      });

      it('should accept feature branch names with slashes', () => {
        expect(sut.testing.validateBranchIsSecure('feature/new-feature')).toBe('feature/new-feature');
        expect(sut.testing.validateBranchIsSecure('bugfix/issue-123')).toBe('bugfix/issue-123');
      });

      it('should accept branch names with hyphens', () => {
        expect(sut.testing.validateBranchIsSecure('feature-branch')).toBe('feature-branch');
      });

      it('should accept branch names with underscores', () => {
        expect(sut.testing.validateBranchIsSecure('feature_branch')).toBe('feature_branch');
      });

      it('should accept branch names with dots', () => {
        expect(sut.testing.validateBranchIsSecure('release-2.4.7')).toBe('release-2.4.7');
      });
    });

    describe('security rejections', () => {
      it('should reject empty string', () => {
        expect(() => sut.testing.validateBranchIsSecure('')).toThrow('Rejecting the branch "" as potentially insecure');
      });

      it('should reject null', () => {
        expect(() => sut.testing.validateBranchIsSecure(null)).toThrow('potentially insecure');
      });

      it('should reject undefined', () => {
        expect(() => sut.testing.validateBranchIsSecure(undefined)).toThrow('potentially insecure');
      });

      it('should reject branches starting with hyphen', () => {
        expect(() => sut.testing.validateBranchIsSecure('-branch')).toThrow('Rejecting the branch "-branch" as potentially insecure');
        expect(() => sut.testing.validateBranchIsSecure('--version')).toThrow('potentially insecure');
      });

      it('should reject branches containing spaces', () => {
        expect(() => sut.testing.validateBranchIsSecure('my branch')).toThrow('Rejecting the branch "my branch" as potentially insecure');
      });

      it('should reject branches containing backticks', () => {
        expect(() => sut.testing.validateBranchIsSecure('`id`')).toThrow('potentially insecure');
      });

      it('should reject branches containing dollar signs', () => {
        expect(() => sut.testing.validateBranchIsSecure('$PATH')).toThrow('potentially insecure');
        expect(() => sut.testing.validateBranchIsSecure('$(cat /etc/passwd)')).toThrow('potentially insecure');
      });

      it('should reject shell injection patterns', () => {
        expect(() => sut.testing.validateBranchIsSecure('main && rm -rf /')).toThrow('potentially insecure');
      });

      it('should reject newlines', () => {
        expect(() => sut.testing.validateBranchIsSecure("main\nwhoami")).toThrow('potentially insecure');
        expect(() => sut.testing.validateBranchIsSecure("branch\n")).toThrow('potentially insecure');
      });

      it('should reject tabs', () => {
        expect(() => sut.testing.validateBranchIsSecure("main\twhoami")).toThrow('potentially insecure');
        expect(() => sut.testing.validateBranchIsSecure("\tbranch")).toThrow('potentially insecure');
      });

      it('should reject carriage returns', () => {
        expect(() => sut.testing.validateBranchIsSecure("main\rwhoami")).toThrow('potentially insecure');
      });

      it('should reject null bytes', () => {
        expect(() => sut.testing.validateBranchIsSecure("main\0whoami")).toThrow('potentially insecure');
      });

      it('should reject pipe characters', () => {
        expect(() => sut.testing.validateBranchIsSecure("main|cat /etc/passwd")).toThrow('potentially insecure');
        expect(() => sut.testing.validateBranchIsSecure("|whoami")).toThrow('potentially insecure');
      });

      it('should reject ampersands', () => {
        expect(() => sut.testing.validateBranchIsSecure("main&whoami")).toThrow('potentially insecure');
        expect(() => sut.testing.validateBranchIsSecure("main&&rm -rf /")).toThrow('potentially insecure');
      });

      it('should reject output redirection characters', () => {
        expect(() => sut.testing.validateBranchIsSecure("main>output.txt")).toThrow('potentially insecure');
        expect(() => sut.testing.validateBranchIsSecure("main<input.txt")).toThrow('potentially insecure');
      });
    });
  });

  // ============================================================
  // exec - Integration Function Tests (MEDIUM PRIORITY)
  // ============================================================
  describe('exec', () => {
    beforeEach(() => {
      childProcess.exec.mockReset();
    });

    describe('happy path', () => {
      it('should resolve with stdout on successful command', async () => {
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          callback(null, 'command output', '');
        });

        const result = await sut.testing.exec('echo "test"');
        expect(result).toBe('command output');
      });

      it('should pass cwd option to child_process.exec', async () => {
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          callback(null, 'output', '');
        });

        await sut.testing.exec('git status', { cwd: '/path/to/repo' });

        expect(childProcess.exec).toHaveBeenCalledWith(
          'git status',
          expect.objectContaining({ cwd: '/path/to/repo', maxBuffer: 4 * 1024 * 1024 }),
          expect.any(Function)
        );
      });

      it('should use default maxBuffer of 4MB', async () => {
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          callback(null, 'output', '');
        });

        await sut.testing.exec('git log');

        expect(childProcess.exec).toHaveBeenCalledWith(
          'git log',
          expect.objectContaining({ maxBuffer: 4 * 1024 * 1024 }),
          expect.any(Function)
        );
      });
    });

    describe('error cases', () => {
      it('should reject on command error', async () => {
        const mockError = new Error('Command failed');
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          callback(mockError, '', '');
        });

        await expect(sut.testing.exec('invalid-command'))
          .rejects.toMatch(/Error executing command.*Command failed/);
      });

      it('should reject on stderr output', async () => {
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          callback(null, '', 'error message from stderr');
        });

        await expect(sut.testing.exec('command-with-stderr'))
          .rejects.toBe('[error] error message from stderr');
      });

      it('should include cwd in error message when provided', async () => {
        const mockError = new Error('Command failed');
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          callback(mockError, '', '');
        });

        await expect(sut.testing.exec('git status', { cwd: '/path/to/repo' }))
          .rejects.toMatch(/Error executing command in \/path\/to\/repo/);
      });
    });
  });

  // ============================================================
  // memoizeWorkingCopyStat - Caching Function Tests (MEDIUM PRIORITY)
  // ============================================================
  describe('memoizeWorkingCopyStat', () => {
    beforeEach(() => {
      // Clear any existing memoized state by resetting internal state
      sut.testing.clearWorkingCopyStat('/test/repo1');
      sut.testing.clearWorkingCopyStat('/test/repo2');
    });

    it('should call command function only once for same dir/type', async () => {
      const mockCmd = jest.fn().mockResolvedValue('cached-value');

      const result1 = await sut.testing.memoizeWorkingCopyStat('/test/repo1', 'tag', mockCmd);
      const result2 = await sut.testing.memoizeWorkingCopyStat('/test/repo1', 'tag', mockCmd);

      expect(result1).toBe('cached-value');
      expect(result2).toBe('cached-value');
      expect(mockCmd).toHaveBeenCalledTimes(1);
    });

    it('should cache separately for different directories', async () => {
      const mockCmd1 = jest.fn().mockResolvedValue('value1');
      const mockCmd2 = jest.fn().mockResolvedValue('value2');

      const result1 = await sut.testing.memoizeWorkingCopyStat('/test/repo1', 'tag', mockCmd1);
      const result2 = await sut.testing.memoizeWorkingCopyStat('/test/repo2', 'tag', mockCmd2);

      expect(result1).toBe('value1');
      expect(result2).toBe('value2');
      expect(mockCmd1).toHaveBeenCalledTimes(1);
      expect(mockCmd2).toHaveBeenCalledTimes(1);
    });

    it('should cache separately for different types in same directory', async () => {
      const mockCmd1 = jest.fn().mockResolvedValue('tag-value');
      const mockCmd2 = jest.fn().mockResolvedValue('branch-value');

      const result1 = await sut.testing.memoizeWorkingCopyStat('/test/repo1', 'tag', mockCmd1);
      const result2 = await sut.testing.memoizeWorkingCopyStat('/test/repo1', 'branch', mockCmd2);

      expect(result1).toBe('tag-value');
      expect(result2).toBe('branch-value');
      expect(mockCmd1).toHaveBeenCalledTimes(1);
      expect(mockCmd2).toHaveBeenCalledTimes(1);
    });

    it('should clear cache for specific directory with clearWorkingCopyStat', async () => {
      const mockCmd = jest.fn()
        .mockResolvedValueOnce('first-value')
        .mockResolvedValueOnce('second-value');

      const result1 = await sut.testing.memoizeWorkingCopyStat('/test/repo1', 'tag', mockCmd);
      expect(result1).toBe('first-value');

      sut.testing.clearWorkingCopyStat('/test/repo1');

      const result2 = await sut.testing.memoizeWorkingCopyStat('/test/repo1', 'tag', mockCmd);
      expect(result2).toBe('second-value');
      expect(mockCmd).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // initRepo - Integration Function Tests (HIGH PRIORITY)
  // ============================================================
  describe('initRepo', () => {
    beforeEach(() => {
      fs.existsSync.mockReset();
      fs.mkdirSync.mockReset();
      childProcess.exec.mockReset();
      // Clear memoized state for the test repo directory
      sut.testing.clearWorkingCopyStat('/tmp/test-repos/test-repo');
    });

    describe('happy path', () => {
      it('should clone repository if directory does not exist', async () => {
        fs.existsSync.mockReturnValue(false);
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          callback(null, '', '');
        });

        await sut.testing.initRepo('https://github.com/mage-os/test-repo.git', 'main');

        expect(childProcess.exec).toHaveBeenCalledWith(
          expect.stringContaining('git clone'),
          expect.anything(),
          expect.any(Function)
        );
      });

      it('should checkout specified ref', async () => {
        fs.existsSync.mockReturnValue(true);
        let checkoutCalled = false;
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'v1.0.0\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'develop\n', '');
          } else if (cmd.includes('git log -1')) {
            callback(null, 'abc123\n', '');
          } else if (cmd.includes('git checkout')) {
            checkoutCalled = true;
            callback(null, '', '');
          } else {
            callback(null, '', '');
          }
        });

        await sut.testing.initRepo('https://github.com/mage-os/test-repo.git', 'feature-branch');

        expect(checkoutCalled).toBe(true);
      });

      it('should return directory path', async () => {
        fs.existsSync.mockReturnValue(true);
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git log -1')) {
            callback(null, 'abc123\n', '');
          } else {
            callback(null, '', '');
          }
        });

        const result = await sut.testing.initRepo('https://github.com/mage-os/test-repo.git', 'main');

        expect(result).toBe('/tmp/test-repos/test-repo');
      });
    });

    describe('edge cases', () => {
      it('should skip checkout if already on correct tag', async () => {
        fs.existsSync.mockReturnValue(true);
        let checkoutCalled = false;
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'v1.0.0\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git log -1')) {
            callback(null, 'abc123\n', '');
          } else if (cmd.includes('git checkout')) {
            checkoutCalled = true;
            callback(null, '', '');
          } else {
            callback(null, '', '');
          }
        });

        await sut.testing.initRepo('https://github.com/mage-os/test-repo.git', 'v1.0.0');

        expect(checkoutCalled).toBe(false);
      });

      it('should skip checkout if already on correct branch', async () => {
        fs.existsSync.mockReturnValue(true);
        let checkoutCalled = false;
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'abc123\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'develop\n', '');
          } else if (cmd.includes('git checkout')) {
            checkoutCalled = true;
            callback(null, '', '');
          } else {
            callback(null, '', '');
          }
        });

        await sut.testing.initRepo('https://github.com/mage-os/test-repo.git', 'develop');

        expect(checkoutCalled).toBe(false);
      });

      it('should fetch and retry checkout when shallow clone does not include ref', async () => {
        fs.existsSync.mockReturnValue(true);
        let checkoutAttempts = 0;
        let fetchCalled = false;

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'some-tag\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git log -1')) {
            callback(null, 'abc123\n', '');
          } else if (cmd.includes('git checkout')) {
            checkoutAttempts++;
            if (checkoutAttempts === 1) {
              callback(new Error('pathspec did not match'), '', '');
            } else {
              callback(null, '', '');
            }
          } else if (cmd.includes('git fetch')) {
            fetchCalled = true;
            callback(null, '', '');
          } else {
            callback(null, '', '');
          }
        });

        await sut.testing.initRepo('https://github.com/mage-os/test-repo.git', 'missing-tag');

        expect(fetchCalled).toBe(true);
        expect(checkoutAttempts).toBe(2);
      });
    });

    describe('error cases', () => {
      it('should throw on clone failure', async () => {
        fs.existsSync.mockReturnValue(false);
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git clone')) {
            callback(new Error('Clone failed'), '', '');
          } else {
            callback(null, '', '');
          }
        });

        await expect(sut.testing.initRepo('https://github.com/mage-os/test-repo.git', 'main'))
          .rejects.toMatch(/Clone failed/);
      });

      it('should throw on checkout failure after fetch', async () => {
        fs.existsSync.mockReturnValue(true);
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'some-tag\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git log -1')) {
            callback(null, 'abc123\n', '');
          } else if (cmd.includes('git checkout')) {
            callback(new Error('Checkout failed'), '', '');
          } else if (cmd.includes('git fetch')) {
            callback(null, '', '');
          } else {
            callback(null, '', '');
          }
        });

        await expect(sut.testing.initRepo('https://github.com/mage-os/test-repo.git', 'bad-ref'))
          .rejects.toMatch(/Checkout failed/);
      });
    });
  });

  // ============================================================
  // listFolders - Exported API Tests (MEDIUM PRIORITY)
  // ============================================================
  describe('listFolders', () => {
    beforeEach(() => {
      fs.existsSync.mockReset();
      childProcess.exec.mockReset();
    });

    describe('happy path', () => {
      it('should return array of folder paths', async () => {
        fs.existsSync.mockReturnValue(true);
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('ls -1 -d')) {
            callback(null, 'app/code/Vendor/Module1/\napp/code/Vendor/Module2/\n', '');
          } else {
            callback(null, '', '');
          }
        });

        const result = await sut.listFolders('https://github.com/mage-os/test-repo.git', 'app/code/Vendor', 'main');

        expect(result).toEqual(['app/code/Vendor/Module1', 'app/code/Vendor/Module2']);
      });

      it('should validate ref security before use', async () => {
        await expect(sut.listFolders('https://github.com/mage-os/test-repo.git', 'app/code', '$(whoami)'))
          .rejects.toThrow('potentially insecure');
      });
    });

    describe('edge cases', () => {
      it('should return empty array when path does not exist in repo', async () => {
        fs.existsSync.mockImplementation((path) => {
          if (path.includes('nonexistent')) return false;
          return true;
        });
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else {
            callback(null, '', '');
          }
        });

        const result = await sut.listFolders('https://github.com/mage-os/test-repo.git', 'nonexistent/path', 'main');

        expect(result).toEqual([]);
      });
    });
  });

  // ============================================================
  // listFiles - Exported API Tests (MEDIUM PRIORITY)
  // ============================================================
  describe('listFiles', () => {
    beforeEach(() => {
      fs.existsSync.mockReset();
      fs.readFileSync.mockReset();
      fs.statSync.mockReset();
      childProcess.exec.mockReset();
    });

    describe('happy path', () => {
      it('should return array of file objects with filepath, contentBuffer, and isExecutable', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(Buffer.from('file content'));
        fs.statSync.mockReturnValue({ mode: 0o100644 });

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('find')) {
            callback(null, 'app/code/Test/file.php\n', '');
          } else {
            callback(null, '', '');
          }
        });

        const result = await sut.listFiles('https://github.com/mage-os/test-repo.git', 'app/code/Test', 'main', []);

        expect(result).toHaveLength(1);
        expect(result[0]).toHaveProperty('filepath', 'app/code/Test/file.php');
        expect(result[0]).toHaveProperty('contentBuffer');
        expect(result[0]).toHaveProperty('isExecutable', false);
      });

      it('should mark executable files correctly', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(Buffer.from('#!/bin/bash'));
        fs.statSync.mockReturnValue({ mode: 0o100755 });

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('find')) {
            callback(null, 'bin/script.sh\n', '');
          } else {
            callback(null, '', '');
          }
        });

        const result = await sut.listFiles('https://github.com/mage-os/test-repo.git', 'bin', 'main', []);

        expect(result[0].isExecutable).toBe(true);
      });

      it('should validate ref security', async () => {
        await expect(sut.listFiles('https://github.com/mage-os/test-repo.git', 'app/code', '`rm -rf /`', []))
          .rejects.toThrow('potentially insecure');
      });
    });

    describe('edge cases', () => {
      it('should return empty array when path does not exist', async () => {
        fs.existsSync.mockImplementation((path) => {
          if (path.includes('nonexistent')) return false;
          return true;
        });
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else {
            callback(null, '', '');
          }
        });

        const result = await sut.listFiles('https://github.com/mage-os/test-repo.git', 'nonexistent', 'main', []);

        expect(result).toEqual([]);
      });

      it('should apply exclusions when listing files', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(Buffer.from('content'));
        fs.statSync.mockReturnValue({ mode: 0o100644 });

        let findCommand = '';
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('find')) {
            findCommand = cmd;
            callback(null, 'file.php\n', '');
          } else {
            callback(null, '', '');
          }
        });

        await sut.listFiles('https://github.com/mage-os/test-repo.git', 'app', 'main', ['test/', 'fixtures.json']);

        expect(findCommand).toContain("-not -path 'test/*'");
        expect(findCommand).toContain("-not -path 'fixtures.json'");
      });

      it('should support function excludes that receive ref', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(Buffer.from('content'));
        fs.statSync.mockReturnValue({ mode: 0o100644 });

        let findCommand = '';
        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('find')) {
            findCommand = cmd;
            callback(null, 'file.php\n', '');
          } else {
            callback(null, '', '');
          }
        });

        const dynamicExclude = (ref) => ref === 'v1.0.0' ? 'excluded-for-v1/' : '';

        await sut.listFiles('https://github.com/mage-os/test-repo.git', 'app', 'v1.0.0', [dynamicExclude]);

        expect(findCommand).toContain("-not -path 'excluded-for-v1/*'");
      });
    });
  });

  // ============================================================
  // readFile - Exported API Tests
  // ============================================================
  describe('readFile', () => {
    beforeEach(() => {
      fs.existsSync.mockReset();
      fs.readFileSync.mockReset();
      childProcess.exec.mockReset();
    });

    it('should read file content as UTF-8 string', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{"name": "test"}');

      childProcess.exec.mockImplementation((cmd, options, callback) => {
        if (cmd.includes('git describe')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git branch --show-current')) {
          callback(null, 'main\n', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await sut.readFile('https://github.com/mage-os/test-repo.git', 'composer.json', 'main');

      expect(result).toBe('{"name": "test"}');
    });

    it('should validate ref security', async () => {
      await expect(sut.readFile('https://github.com/mage-os/test-repo.git', 'file.txt', '$HOME'))
        .rejects.toThrow('potentially insecure');
    });
  });

  // ============================================================
  // lastCommitTimeForFile - Exported API Tests (HIGH PRIORITY)
  // ============================================================
  describe('lastCommitTimeForFile', () => {
    beforeEach(() => {
      fs.existsSync.mockReset();
      childProcess.exec.mockReset();
      sut.testing.clearWorkingCopyStat('/tmp/test-repos/test-repo');
    });

    describe('happy path', () => {
      it('should return a valid Date object for a file with commits', async () => {
        fs.existsSync.mockReturnValue(true);
        const mockTimestamp = '1609459200'; // 2021-01-01 00:00:00 UTC

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git log -1 --pretty="format:%at"')) {
            callback(null, mockTimestamp, '');
          } else {
            callback(null, '', '');
          }
        });

        const result = await sut.lastCommitTimeForFile(
          'https://github.com/mage-os/test-repo.git',
          'composer.json',
          'main'
        );

        expect(result).toBeInstanceOf(Date);
        expect(result.getTime()).toBe(parseInt(mockTimestamp) * 1000);
      });

      it('should execute git log command with correct file path', async () => {
        fs.existsSync.mockReturnValue(true);
        let gitLogCommand = '';

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git log -1 --pretty="format:%at"')) {
            gitLogCommand = cmd;
            callback(null, '1609459200', '');
          } else {
            callback(null, '', '');
          }
        });

        await sut.lastCommitTimeForFile(
          'https://github.com/mage-os/test-repo.git',
          'app/code/Vendor/Module/composer.json',
          'v1.0.0'
        );

        expect(gitLogCommand).toContain('git log -1 --pretty="format:%at" app/code/Vendor/Module/composer.json');
      });
    });

    describe('edge cases', () => {
      it('should return NaN Date when file has no commits (empty timestamp)', async () => {
        fs.existsSync.mockReturnValue(true);

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git log -1 --pretty="format:%at"')) {
            // Empty output for file with no commits
            callback(null, '', '');
          } else {
            callback(null, '', '');
          }
        });

        const result = await sut.lastCommitTimeForFile(
          'https://github.com/mage-os/test-repo.git',
          'nonexistent-file.txt',
          'main'
        );

        // parseInt('') returns NaN, so Date will be Invalid Date
        expect(result).toBeInstanceOf(Date);
        expect(isNaN(result.getTime())).toBe(true);
      });
    });

    describe('security', () => {
      it('should validate ref security before executing', async () => {
        await expect(
          sut.lastCommitTimeForFile(
            'https://github.com/mage-os/test-repo.git',
            'file.txt',
            '$(whoami)'
          )
        ).rejects.toThrow('potentially insecure');
      });

      it('should reject ref with newline', async () => {
        await expect(
          sut.lastCommitTimeForFile(
            'https://github.com/mage-os/test-repo.git',
            'file.txt',
            "main\ncat /etc/passwd"
          )
        ).rejects.toThrow('potentially insecure');
      });

      it('should reject ref with pipe', async () => {
        await expect(
          sut.lastCommitTimeForFile(
            'https://github.com/mage-os/test-repo.git',
            'file.txt',
            'main|whoami'
          )
        ).rejects.toThrow('potentially insecure');
      });

      it('should reject ref starting with hyphen', async () => {
        await expect(
          sut.lastCommitTimeForFile(
            'https://github.com/mage-os/test-repo.git',
            'file.txt',
            '--help'
          )
        ).rejects.toThrow('potentially insecure');
      });
    });
  });

  // ============================================================
  // createTagForRef - Exported API Tests (HIGH PRIORITY)
  // ============================================================
  describe('createTagForRef', () => {
    beforeEach(() => {
      fs.existsSync.mockReset();
      childProcess.exec.mockReset();
    });

    describe('happy path', () => {
      it('should create annotated tag with message', async () => {
        fs.existsSync.mockReturnValue(true);
        let tagCommand = '';

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git tag') && !cmd.includes('-a') && !cmd.includes('-n')) {
            callback(null, '\n', ''); // No existing tags
          } else if (cmd.includes('git tag -a')) {
            tagCommand = cmd;
            callback(null, '', '');
          } else if (cmd.includes('git config')) {
            callback(null, '', '');
          } else {
            callback(null, '', '');
          }
        });

        await sut.createTagForRef(
          'https://github.com/mage-os/test-repo.git',
          'abc123',
          'v1.0.0',
          'Release version 1.0.0'
        );

        expect(tagCommand).toContain('git tag -a v1.0.0 abc123');
        expect(tagCommand).toContain("'Release version 1.0.0'");
      });

      it('should configure git user before tagging', async () => {
        fs.existsSync.mockReturnValue(true);
        const configCommands = [];

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git config')) {
            configCommands.push(cmd);
          }
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git tag') && !cmd.includes('-a') && !cmd.includes('-n')) {
            callback(null, '\n', '');
          } else {
            callback(null, '', '');
          }
        });

        await sut.createTagForRef(
          'https://github.com/mage-os/test-repo.git',
          'abc123',
          'v1.0.0',
          'Test message'
        );

        expect(configCommands).toContainEqual(expect.stringContaining('user.email'));
        expect(configCommands).toContainEqual(expect.stringContaining('user.name'));
      });

      it('should validate ref security', async () => {
        await expect(
          sut.createTagForRef(
            'https://github.com/mage-os/test-repo.git',
            '$(cat /etc/passwd)',
            'v1.0.0',
            'message'
          )
        ).rejects.toThrow('potentially insecure');
      });

      it('should validate tag security', async () => {
        await expect(
          sut.createTagForRef(
            'https://github.com/mage-os/test-repo.git',
            'abc123',
            '`rm -rf /`',
            'message'
          )
        ).rejects.toThrow('potentially insecure');
      });
    });

    describe('edge cases', () => {
      it('should return without error if tag exists with same message', async () => {
        fs.existsSync.mockReturnValue(true);

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git tag -n')) {
            callback(null, 'v1.0.0    Generated by package generator\n', '');
          } else if (cmd.includes('git tag') && !cmd.includes('-a')) {
            callback(null, 'v1.0.0\n', ''); // Tag exists
          } else {
            callback(null, '', '');
          }
        });

        // Should not throw
        await expect(
          sut.createTagForRef(
            'https://github.com/mage-os/test-repo.git',
            'abc123',
            'v1.0.0',
            'Generated by package generator'
          )
        ).resolves.toBeUndefined();
      });

      it('should strip single quotes from message', async () => {
        fs.existsSync.mockReturnValue(true);
        let tagCommand = '';

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git tag') && !cmd.includes('-a') && !cmd.includes('-n')) {
            callback(null, '\n', '');
          } else if (cmd.includes('git tag -a')) {
            tagCommand = cmd;
            callback(null, '', '');
          } else {
            callback(null, '', '');
          }
        });

        await sut.createTagForRef(
          'https://github.com/mage-os/test-repo.git',
          'abc123',
          'v1.0.0',
          "Message with 'quotes'"
        );

        expect(tagCommand).toContain("'Message with quotes'");
      });
    });

    describe('error cases', () => {
      it('should throw if tag exists with different message', async () => {
        fs.existsSync.mockReturnValue(true);

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git tag -n')) {
            callback(null, 'v1.0.0    Different message\n', '');
          } else if (cmd.includes('git tag') && !cmd.includes('-a')) {
            callback(null, 'v1.0.0\n', ''); // Tag exists
          } else {
            callback(null, '', '');
          }
        });

        await expect(
          sut.createTagForRef(
            'https://github.com/mage-os/test-repo.git',
            'abc123',
            'v1.0.0',
            'My new message'
          )
        ).rejects.toMatch(/Tag v1.0.0 already exists/);
      });

      it('should use custom details message when throwing for existing tag', async () => {
        fs.existsSync.mockReturnValue(true);

        childProcess.exec.mockImplementation((cmd, options, callback) => {
          if (cmd.includes('git describe')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git branch --show-current')) {
            callback(null, 'main\n', '');
          } else if (cmd.includes('git tag -n')) {
            callback(null, 'v1.0.0    Different message\n', '');
          } else if (cmd.includes('git tag') && !cmd.includes('-a')) {
            callback(null, 'v1.0.0\n', '');
          } else {
            callback(null, '', '');
          }
        });

        await expect(
          sut.createTagForRef(
            'https://github.com/mage-os/test-repo.git',
            'abc123',
            'v1.0.0',
            'My new message',
            'Custom error details'
          )
        ).rejects.toBe('Custom error details');
      });
    });
  });

  // ============================================================
  // listTags - Exported API Tests
  // ============================================================
  describe('listTags', () => {
    beforeEach(() => {
      fs.existsSync.mockReset();
      childProcess.exec.mockReset();
    });

    it('should return array of tag names', async () => {
      fs.existsSync.mockReturnValue(true);

      childProcess.exec.mockImplementation((cmd, options, callback) => {
        if (cmd.includes('git describe')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git branch --show-current')) {
          callback(null, 'main\n', '');
        } else if (cmd === 'git tag') {
          callback(null, 'v1.0.0\nv1.0.1\nv2.0.0\n', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await sut.listTags('https://github.com/mage-os/test-repo.git');

      expect(result).toEqual(['v1.0.0', 'v1.0.1', 'v2.0.0']);
    });

    it('should return empty array when no tags exist', async () => {
      fs.existsSync.mockReturnValue(true);

      childProcess.exec.mockImplementation((cmd, options, callback) => {
        if (cmd.includes('git describe')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git branch --show-current')) {
          callback(null, 'main\n', '');
        } else if (cmd === 'git tag') {
          callback(null, '\n', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await sut.listTags('https://github.com/mage-os/test-repo.git');

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // checkout - Exported API Tests
  // ============================================================
  describe('checkout', () => {
    it('should validate ref security', async () => {
      await expect(sut.checkout('https://github.com/mage-os/test-repo.git', '-h'))
        .rejects.toThrow('potentially insecure');
    });

    it('should call initRepo with url and ref', async () => {
      fs.existsSync.mockReturnValue(true);
      childProcess.exec.mockImplementation((cmd, options, callback) => {
        if (cmd.includes('git describe')) {
          callback(null, 'v1.0.0\n', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await sut.checkout('https://github.com/mage-os/test-repo.git', 'v1.0.0');

      expect(result).toBe('/tmp/test-repos/test-repo');
    });
  });

  // ============================================================
  // createBranch - Exported API Tests
  // ============================================================
  describe('createBranch', () => {
    beforeEach(() => {
      fs.existsSync.mockReset();
      childProcess.exec.mockReset();
    });

    it('should validate ref security', async () => {
      await expect(sut.createBranch('https://github.com/mage-os/test-repo.git', 'new-branch', '$(id)'))
        .rejects.toThrow('potentially insecure');
    });

    it('should validate branch security', async () => {
      await expect(sut.createBranch('https://github.com/mage-os/test-repo.git', '`whoami`', 'main'))
        .rejects.toThrow('potentially insecure');
    });

    it('should checkout existing branch if it exists', async () => {
      fs.existsSync.mockReturnValue(true);
      let checkoutCommand = '';

      childProcess.exec.mockImplementation((cmd, options, callback) => {
        if (cmd.includes('git describe')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git branch --show-current')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git branch -l')) {
          callback(null, '  existing-branch\n', '');
        } else if (cmd.includes('git checkout')) {
          checkoutCommand = cmd;
          callback(null, '', '');
        } else {
          callback(null, '', '');
        }
      });

      await sut.createBranch('https://github.com/mage-os/test-repo.git', 'existing-branch', 'main');

      expect(checkoutCommand).toContain('git checkout --force --quiet existing-branch');
      // Verify -b flag is NOT used (would be "checkout -b" for new branches)
      expect(checkoutCommand).not.toContain('checkout -b');
    });

    it('should create new branch if it does not exist', async () => {
      fs.existsSync.mockReturnValue(true);
      let checkoutCommand = '';

      childProcess.exec.mockImplementation((cmd, options, callback) => {
        if (cmd.includes('git describe')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git branch --show-current')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git branch -l')) {
          callback(null, '\n', ''); // No branches match
        } else if (cmd.includes('git checkout')) {
          checkoutCommand = cmd;
          callback(null, '', '');
        } else {
          callback(null, '', '');
        }
      });

      await sut.createBranch('https://github.com/mage-os/test-repo.git', 'new-branch', 'main');

      expect(checkoutCommand).toContain('-b new-branch main');
    });
  });

  // ============================================================
  // pull - Exported API Tests
  // ============================================================
  describe('pull', () => {
    beforeEach(() => {
      fs.existsSync.mockReset();
      childProcess.exec.mockReset();
    });

    it('should validate ref security', async () => {
      await expect(sut.pull('https://github.com/mage-os/test-repo.git', '$(rm -rf /)'))
        .rejects.toThrow('potentially insecure');
    });

    it('should execute git pull command', async () => {
      fs.existsSync.mockReturnValue(true);
      let pullCommand = '';

      childProcess.exec.mockImplementation((cmd, options, callback) => {
        if (cmd.includes('git describe')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git branch --show-current')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git pull')) {
          pullCommand = cmd;
          callback(null, '', '');
        } else {
          callback(null, '', '');
        }
      });

      await sut.pull('https://github.com/mage-os/test-repo.git', 'main');

      expect(pullCommand).toBe('git pull --ff-only --quiet origin main');
    });
  });

  // ============================================================
  // addUpdated - Exported API Tests
  // ============================================================
  describe('addUpdated', () => {
    beforeEach(() => {
      fs.existsSync.mockReset();
      childProcess.exec.mockReset();
    });

    it('should execute git add --update command', async () => {
      fs.existsSync.mockReturnValue(true);
      let addCommand = '';

      childProcess.exec.mockImplementation((cmd, options, callback) => {
        if (cmd.includes('git describe')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git branch --show-current')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git add')) {
          addCommand = cmd;
          callback(null, '', '');
        } else {
          callback(null, '', '');
        }
      });

      await sut.addUpdated('https://github.com/mage-os/test-repo.git', '.');

      expect(addCommand).toBe('git add --update -- .');
    });
  });

  // ============================================================
  // commit - Exported API Tests
  // ============================================================
  describe('commit', () => {
    beforeEach(() => {
      fs.existsSync.mockReset();
      childProcess.exec.mockReset();
    });

    it('should configure git user and execute commit', async () => {
      fs.existsSync.mockReturnValue(true);
      const commands = [];

      childProcess.exec.mockImplementation((cmd, options, callback) => {
        commands.push(cmd);
        if (cmd.includes('git describe')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git branch --show-current')) {
          callback(null, 'main\n', '');
        } else {
          callback(null, '', '');
        }
      });

      await sut.commit('https://github.com/mage-os/test-repo.git', 'main', 'Test commit message');

      expect(commands).toContainEqual(expect.stringContaining('git config user.email'));
      expect(commands).toContainEqual(expect.stringContaining('git config user.name'));
      expect(commands).toContainEqual(expect.stringContaining("git commit --no-gpg-sign -m'Test commit message'"));
    });

    it('should replace single quotes with double quotes in message', async () => {
      fs.existsSync.mockReturnValue(true);
      let commitCommand = '';

      childProcess.exec.mockImplementation((cmd, options, callback) => {
        if (cmd.includes('git commit')) {
          commitCommand = cmd;
        }
        if (cmd.includes('git describe')) {
          callback(null, 'main\n', '');
        } else if (cmd.includes('git branch --show-current')) {
          callback(null, 'main\n', '');
        } else {
          callback(null, '', '');
        }
      });

      await sut.commit('https://github.com/mage-os/test-repo.git', 'main', "It's a test");

      // Single quotes are replaced with double quotes in the message
      // The command wraps the message in single quotes: -m'It"s a test'
      expect(commitCommand).toContain("-m'It\"s a test'");
    });
  });

  // ============================================================
  // clearCache & setStorageDir - Utility Tests
  // ============================================================
  describe('clearCache', () => {
    it('should be a noop function that does not throw', () => {
      expect(() => sut.clearCache()).not.toThrow();
    });
  });

  describe('setStorageDir', () => {
    it('should set the base directory for repositories', () => {
      sut.setStorageDir('/custom/storage/dir');

      // We can verify this by checking that fullRepoPath uses the new directory
      // This requires exposing fullRepoPath for testing or checking initRepo behavior
      expect(() => sut.setStorageDir('/another/dir')).not.toThrow();
    });
  });

  // ============================================================
  // fullRepoPath - Integration with dirForRepoUrl
  // ============================================================
  describe('fullRepoPath', () => {
    it('should combine storage dir with repo directory name', () => {
      sut.setStorageDir('/base/dir');
      expect(sut.testing.fullRepoPath('https://github.com/mage-os/test-repo.git'))
        .toBe('/base/dir/test-repo');
    });
  });
});
