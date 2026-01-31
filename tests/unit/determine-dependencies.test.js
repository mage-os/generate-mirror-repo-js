/**
 * Unit tests for determine-dependencies.js
 *
 * Tests the DependencyAnalyzer class and its methods for analyzing
 * PHP files to determine composer package dependencies.
 */

const path = require('path');
const { EventEmitter } = require('events');

// Mock modules before requiring the SUT
jest.mock('fs/promises');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  accessSync: jest.fn(),
  constants: { R_OK: 4 }
}));
jest.mock('os', () => ({
  tmpdir: jest.fn(() => '/tmp')
}));
jest.mock('process', () => ({
  cwd: jest.fn(() => '/original/cwd'),
  chdir: jest.fn()
}));
jest.mock('child_process');
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => 'abc123hash')
    }))
  }))
}));

const fs = require('fs/promises');
const fsSync = require('fs');
const { tmpdir } = require('os');
const { cwd, chdir } = require('process');
const { createHash } = require('crypto');
const childProcess = require('child_process');

describe('DependencyAnalyzer', () => {
  let DependencyAnalyzer;
  let CONFIG;
  let determineSourceDependencies;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Re-setup mocks after reset
    jest.doMock('fs/promises', () => ({
      rm: jest.fn().mockResolvedValue(undefined),
      cp: jest.fn().mockResolvedValue(undefined)
    }));

    jest.doMock('fs', () => ({
      accessSync: jest.fn(),
      constants: { R_OK: 4 }
    }));

    jest.doMock('os', () => ({
      tmpdir: jest.fn(() => '/tmp')
    }));

    jest.doMock('process', () => ({
      cwd: jest.fn(() => '/original/cwd'),
      chdir: jest.fn()
    }));

    jest.doMock('crypto', () => ({
      createHash: jest.fn(() => ({
        update: jest.fn(() => ({
          digest: jest.fn(() => 'abc123hash')
        }))
      }))
    }));

    jest.doMock('child_process', () => ({
      exec: jest.fn(),
      spawn: jest.fn()
    }));

    jest.doMock('util', () => ({
      promisify: jest.fn((fn) => {
        return jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
      })
    }));

    // Import the actual module with internal exports
    const module = require('../../src/determine-dependencies');
    DependencyAnalyzer = module._internal.DependencyAnalyzer;
    CONFIG = module._internal.CONFIG;
    determineSourceDependencies = module.determineSourceDependencies;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('DependencyAnalyzer.exists', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        accessSync: jest.fn(),
        constants: { R_OK: 4 }
      }));
    });

    it('returns true for existing readable file', () => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        accessSync: jest.fn().mockImplementation(() => undefined),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      expect(DependencyAnalyzer.exists('/path/to/existing/file')).toBe(true);
    });

    it('returns true for existing readable directory', () => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        accessSync: jest.fn().mockImplementation(() => undefined),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      expect(DependencyAnalyzer.exists('/path/to/existing/directory')).toBe(true);
    });

    it('returns false for non-existent path', () => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        accessSync: jest.fn().mockImplementation(() => {
          const error = new Error('ENOENT: no such file or directory');
          error.code = 'ENOENT';
          throw error;
        }),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      expect(DependencyAnalyzer.exists('/path/to/nonexistent/file')).toBe(false);
    });

    it('returns false for path without read permissions', () => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        accessSync: jest.fn().mockImplementation(() => {
          const error = new Error('EACCES: permission denied');
          error.code = 'EACCES';
          throw error;
        }),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      expect(DependencyAnalyzer.exists('/path/to/unreadable/file')).toBe(false);
    });

    it('handles empty string path', () => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        accessSync: jest.fn().mockImplementation(() => {
          const error = new Error('ENOENT: no such file or directory');
          error.code = 'ENOENT';
          throw error;
        }),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      expect(DependencyAnalyzer.exists('')).toBe(false);
    });

    it('handles path with special characters', () => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        accessSync: jest.fn().mockImplementation(() => undefined),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      // Paths with spaces, unicode, and special chars should work
      expect(DependencyAnalyzer.exists('/path/with spaces/file')).toBe(true);
      expect(DependencyAnalyzer.exists('/path/with-dashes/file')).toBe(true);
      expect(DependencyAnalyzer.exists('/path/with_underscores/file')).toBe(true);
      expect(DependencyAnalyzer.exists('/path/with.dots/file')).toBe(true);
    });

    it('handles symlinks (follows them by default)', () => {
      jest.resetModules();
      // accessSync with R_OK follows symlinks and checks target
      jest.doMock('fs', () => ({
        accessSync: jest.fn().mockImplementation(() => undefined),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      // Symlink to readable target should return true
      expect(DependencyAnalyzer.exists('/path/to/symlink')).toBe(true);
    });

    it('returns false for broken symlink', () => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        accessSync: jest.fn().mockImplementation(() => {
          const error = new Error('ENOENT: no such file or directory');
          error.code = 'ENOENT';
          throw error;
        }),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      // Broken symlink should return false
      expect(DependencyAnalyzer.exists('/path/to/broken-symlink')).toBe(false);
    });
  });

  describe('createWorkDirPath', () => {
    it('returns path in system temp directory', () => {
      jest.resetModules();
      jest.doMock('os', () => ({
        tmpdir: jest.fn(() => '/custom/tmp')
      }));
      jest.doMock('crypto', () => ({
        createHash: jest.fn(() => ({
          update: jest.fn(() => ({
            digest: jest.fn(() => 'def456hash')
          }))
        }))
      }));
      jest.doMock('fs', () => ({
        accessSync: jest.fn(),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      const analyzer = new DependencyAnalyzer('/my/base/dir');
      const result = analyzer.createWorkDirPath();

      expect(result).toMatch(/^\/custom\/tmp\/workdir-def456hash-\d+$/);
    });

    it('includes md5 hash of baseDir', () => {
      jest.resetModules();
      const mockUpdate = jest.fn(() => ({
        digest: jest.fn(() => 'abc123')
      }));
      jest.doMock('crypto', () => ({
        createHash: jest.fn(() => ({
          update: mockUpdate
        }))
      }));
      jest.doMock('os', () => ({
        tmpdir: jest.fn(() => '/tmp')
      }));
      jest.doMock('fs', () => ({
        accessSync: jest.fn(),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      const baseDir = '/path/to/project';
      const analyzer = new DependencyAnalyzer(baseDir);
      const result = analyzer.createWorkDirPath();

      expect(mockUpdate).toHaveBeenCalledWith(baseDir);
      expect(result).toContain('workdir-abc123-');
    });

    it('includes timestamp for uniqueness', () => {
      jest.resetModules();
      jest.doMock('crypto', () => ({
        createHash: jest.fn(() => ({
          update: jest.fn(() => ({
            digest: jest.fn(() => 'hash123')
          }))
        }))
      }));
      jest.doMock('os', () => ({
        tmpdir: jest.fn(() => '/tmp')
      }));
      jest.doMock('fs', () => ({
        accessSync: jest.fn(),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      const analyzer = new DependencyAnalyzer('/base');
      const result = analyzer.createWorkDirPath();

      // Extract timestamp from path
      const timestampMatch = result.match(/workdir-hash123-(\d+)$/);
      expect(timestampMatch).not.toBeNull();

      const timestamp = parseInt(timestampMatch[1], 10);
      const now = Date.now();
      // Timestamp should be within 1 second of now
      expect(timestamp).toBeGreaterThan(now - 1000);
      expect(timestamp).toBeLessThanOrEqual(now);
    });

    it('produces different paths for different baseDirs', () => {
      jest.resetModules();
      let hashCallCount = 0;
      const hashes = ['hash1', 'hash2'];

      jest.doMock('crypto', () => ({
        createHash: jest.fn(() => ({
          update: jest.fn(() => ({
            digest: jest.fn(() => hashes[hashCallCount++])
          }))
        }))
      }));
      jest.doMock('os', () => ({
        tmpdir: jest.fn(() => '/tmp')
      }));
      jest.doMock('fs', () => ({
        accessSync: jest.fn(),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;

      const analyzer1 = new DependencyAnalyzer('/dir1');
      const path1 = analyzer1.createWorkDirPath();

      const analyzer2 = new DependencyAnalyzer('/dir2');
      const path2 = analyzer2.createWorkDirPath();

      // Paths should have different hash portions
      expect(path1).toContain('hash1');
      expect(path2).toContain('hash2');
    });
  });

  describe('filterPhpFiles', () => {
    let analyzer;

    beforeEach(() => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        accessSync: jest.fn(),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;
      analyzer = new DependencyAnalyzer('/base');

      // Suppress console.log for cleaner test output
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns only .php files', () => {
      const files = [
        { filepath: '/path/to/file.php', contentBuffer: Buffer.from('<?php') },
        { filepath: '/path/to/file.js', contentBuffer: Buffer.from('console.log') },
        { filepath: '/path/to/file.txt', contentBuffer: Buffer.from('text') }
      ];

      const result = analyzer.filterPhpFiles(files);

      expect(result).toHaveLength(1);
      expect(result[0].filepath).toBe('/path/to/file.php');
    });

    it('returns only .phtml files', () => {
      const files = [
        { filepath: '/path/to/template.phtml', contentBuffer: Buffer.from('<?php echo "hello"') },
        { filepath: '/path/to/file.html', contentBuffer: Buffer.from('<html>') }
      ];

      const result = analyzer.filterPhpFiles(files);

      expect(result).toHaveLength(1);
      expect(result[0].filepath).toBe('/path/to/template.phtml');
    });

    it('excludes files with empty contentBuffer', () => {
      const files = [
        { filepath: '/path/to/file.php', contentBuffer: Buffer.from('<?php') },
        { filepath: '/path/to/empty.php', contentBuffer: Buffer.from('') }
      ];

      const result = analyzer.filterPhpFiles(files);

      expect(result).toHaveLength(1);
      expect(result[0].filepath).toBe('/path/to/file.php');
    });

    it('excludes files with null contentBuffer', () => {
      const files = [
        { filepath: '/path/to/file.php', contentBuffer: Buffer.from('<?php') },
        { filepath: '/path/to/null.php', contentBuffer: null }
      ];

      const result = analyzer.filterPhpFiles(files);

      expect(result).toHaveLength(1);
      expect(result[0].filepath).toBe('/path/to/file.php');
    });

    it('returns empty array for empty input', () => {
      const result = analyzer.filterPhpFiles([]);

      expect(result).toEqual([]);
    });

    it('handles mixed file types correctly', () => {
      const files = [
        { filepath: '/path/to/file1.php', contentBuffer: Buffer.from('<?php // file1') },
        { filepath: '/path/to/file2.phtml', contentBuffer: Buffer.from('<?php // file2') },
        { filepath: '/path/to/file3.js', contentBuffer: Buffer.from('js content') },
        { filepath: '/path/to/file4.php', contentBuffer: Buffer.from('<?php // file4') },
        { filepath: '/path/to/file5.css', contentBuffer: Buffer.from('.class {}') },
        { filepath: '/path/to/empty.php', contentBuffer: Buffer.from('') },
        { filepath: '/path/to/null.phtml', contentBuffer: null }
      ];

      const result = analyzer.filterPhpFiles(files);

      expect(result).toHaveLength(3);
      expect(result.map(f => f.filepath)).toEqual([
        '/path/to/file1.php',
        '/path/to/file2.phtml',
        '/path/to/file4.php'
      ]);
    });

    it('handles undefined contentBuffer gracefully', () => {
      const files = [
        { filepath: '/path/to/file.php', contentBuffer: Buffer.from('<?php') },
        { filepath: '/path/to/undefined.php', contentBuffer: undefined }
      ];

      const result = analyzer.filterPhpFiles(files);

      expect(result).toHaveLength(1);
      expect(result[0].filepath).toBe('/path/to/file.php');
    });

    it('logs count of filtered files', () => {
      const logSpy = jest.spyOn(console, 'log');
      const files = [
        { filepath: '/path/to/file1.php', contentBuffer: Buffer.from('<?php') },
        { filepath: '/path/to/file2.php', contentBuffer: Buffer.from('<?php') },
        { filepath: '/path/to/file3.js', contentBuffer: Buffer.from('js') },
        { filepath: '/path/to/file4.phtml', contentBuffer: Buffer.from('<?php') }
      ];

      analyzer.filterPhpFiles(files);

      expect(logSpy).toHaveBeenCalledWith('Found 3 PHP files out of 4 total files');
    });
  });

  describe('processFilesInBatches', () => {
    let analyzer;
    let localCONFIG;

    beforeEach(() => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        accessSync: jest.fn(),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer, CONFIG } = module._internal;
      analyzer = new DependencyAnalyzer('/base');
      localCONFIG = CONFIG;

      // Suppress console output for cleaner test output
      jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('processes all files when less than batch size', async () => {
      const files = Array(50).fill(null).map((_, i) => ({ filepath: `file${i}.php` }));
      const processor = jest.fn().mockResolvedValue('batch-result');

      const result = await analyzer.processFilesInBatches(files, processor);

      expect(processor).toHaveBeenCalledTimes(1);
      expect(processor).toHaveBeenCalledWith(files);
      expect(result).toEqual(['batch-result']);
    });

    it('splits into multiple batches when exceeding batch size', async () => {
      const files = Array(250).fill(null).map((_, i) => ({ filepath: `file${i}.php` }));
      const processor = jest.fn().mockResolvedValue('batch-result');

      const result = await analyzer.processFilesInBatches(files, processor);

      // With BATCH_SIZE = 100, 250 files should be 3 batches
      expect(processor).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3);
    });

    it('collects results from all batches', async () => {
      const files = Array(200).fill(null).map((_, i) => ({ filepath: `file${i}.php` }));
      let callCount = 0;
      const processor = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(`result-${callCount}`);
      });

      const result = await analyzer.processFilesInBatches(files, processor);

      expect(result).toEqual(['result-1', 'result-2']);
    });

    it('continues processing after batch failure', async () => {
      const files = Array(300).fill(null).map((_, i) => ({ filepath: `file${i}.php` }));
      let callCount = 0;
      const processor = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Batch 2 failed'));
        }
        return Promise.resolve(`result-${callCount}`);
      });

      const result = await analyzer.processFilesInBatches(files, processor);

      expect(processor).toHaveBeenCalledTimes(3);
      expect(result).toEqual(['result-1', 'result-3']);
    });

    it('filters out null results', async () => {
      const files = Array(200).fill(null).map((_, i) => ({ filepath: `file${i}.php` }));
      let callCount = 0;
      const processor = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(null);
        }
        return Promise.resolve(`result-${callCount}`);
      });

      const result = await analyzer.processFilesInBatches(files, processor);

      expect(result).toEqual(['result-2']);
    });

    it('handles exactly batch size files', async () => {
      const files = Array(100).fill(null).map((_, i) => ({ filepath: `file${i}.php` }));
      const processor = jest.fn().mockResolvedValue('batch-result');

      const result = await analyzer.processFilesInBatches(files, processor);

      expect(processor).toHaveBeenCalledTimes(1);
      expect(processor).toHaveBeenCalledWith(files);
    });

    it('handles empty files array', async () => {
      const processor = jest.fn().mockResolvedValue('batch-result');

      const result = await analyzer.processFilesInBatches([], processor);

      expect(processor).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('logs batch progress', async () => {
      const logSpy = jest.spyOn(console, 'log');
      const files = Array(250).fill(null).map((_, i) => ({ filepath: `file${i}.php` }));
      const processor = jest.fn().mockResolvedValue('batch-result');

      await analyzer.processFilesInBatches(files, processor);

      // With 250 files and BATCH_SIZE=100, expect 3 batches
      expect(logSpy).toHaveBeenCalledWith('Processing batch 1/3 (100 files)');
      expect(logSpy).toHaveBeenCalledWith('Processing batch 2/3 (100 files)');
      expect(logSpy).toHaveBeenCalledWith('Processing batch 3/3 (50 files)');
    });

    it('logs warning when batch fails', async () => {
      const warnSpy = jest.spyOn(console, 'warn');
      const files = Array(150).fill(null).map((_, i) => ({ filepath: `file${i}.php` }));
      let callCount = 0;
      const processor = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Processing failed'));
        }
        return Promise.resolve('result');
      });

      await analyzer.processFilesInBatches(files, processor);

      expect(warnSpy).toHaveBeenCalledWith(
        'Batch processing failed for files 0-99:',
        'Processing failed'
      );
    });
  });

  describe('runComposerInstall', () => {
    let analyzer;
    let mockExec;

    beforeEach(() => {
      jest.resetModules();

      mockExec = jest.fn().mockResolvedValue({ stdout: '', stderr: '' });

      jest.doMock('fs', () => ({
        accessSync: jest.fn(),
        constants: { R_OK: 4 }
      }));

      jest.doMock('util', () => ({
        promisify: jest.fn(() => mockExec)
      }));

      jest.doMock('child_process', () => ({
        exec: jest.fn(),
        spawn: jest.fn()
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;
      analyzer = new DependencyAnalyzer('/base');
      analyzer.workDir = '/work/dir';

      // Suppress console output
      jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('runs composer install with correct flags', async () => {
      mockExec.mockResolvedValue({ stdout: 'success', stderr: '' });

      await analyzer.runComposerInstall();

      expect(mockExec).toHaveBeenCalledWith(
        'composer install --no-progress --no-plugins --no-scripts --no-dev',
        expect.objectContaining({
          cwd: '/work/dir'
        })
      );
    });

    it('filters lock file warnings from stderr', async () => {
      const stderr = 'Warning: The lock file is not up to date with the latest changes\nSome other warning';
      mockExec.mockResolvedValue({ stdout: 'success', stderr });
      const warnSpy = jest.spyOn(console, 'warn');

      await analyzer.runComposerInstall();

      // The filtered warning should only contain "Some other warning"
      expect(warnSpy).toHaveBeenCalledWith('Composer warnings:', 'Some other warning');
    });

    it('filters autoload warnings from stderr', async () => {
      const stderr = 'Generating autoload files\nReal warning here';
      mockExec.mockResolvedValue({ stdout: 'success', stderr });
      const warnSpy = jest.spyOn(console, 'warn');

      await analyzer.runComposerInstall();

      expect(warnSpy).toHaveBeenCalledWith('Composer warnings:', 'Real warning here');
    });

    it('throws error with message on failure', async () => {
      mockExec.mockRejectedValue(new Error('Command failed'));

      await expect(analyzer.runComposerInstall())
        .rejects
        .toThrow('Composer install failed: Command failed');
    });

    it('handles empty stderr without warning', async () => {
      mockExec.mockResolvedValue({ stdout: 'success', stderr: '' });
      const warnSpy = jest.spyOn(console, 'warn');

      await analyzer.runComposerInstall();

      // console.warn should not have been called with 'Composer warnings:'
      expect(warnSpy).not.toHaveBeenCalledWith('Composer warnings:', expect.any(String));
    });

    it('uses correct timeout from CONFIG', async () => {
      mockExec.mockResolvedValue({ stdout: 'success', stderr: '' });

      await analyzer.runComposerInstall();

      expect(mockExec).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 300000 // CONFIG.TIMEOUT
        })
      );
    });

    it('uses correct maxBuffer from CONFIG', async () => {
      mockExec.mockResolvedValue({ stdout: 'success', stderr: '' });

      await analyzer.runComposerInstall();

      expect(mockExec).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxBuffer: 4 * 1024 * 1024 // CONFIG.BUFFER_SIZE
        })
      );
    });

    it('returns stdout on success', async () => {
      mockExec.mockResolvedValue({ stdout: 'Installation complete', stderr: '' });

      const result = await analyzer.runComposerInstall();

      expect(result).toBe('Installation complete');
    });
  });

  describe('spawnProcess', () => {
    let analyzer;
    let mockSpawn;

    // Helper to create mock child process
    const createMockChildProcess = () => {
      const mockProcess = new EventEmitter();
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      mockProcess.killed = false;
      return mockProcess;
    };

    beforeEach(() => {
      jest.resetModules();

      mockSpawn = jest.fn();

      jest.doMock('fs', () => ({
        accessSync: jest.fn(),
        constants: { R_OK: 4 }
      }));

      jest.doMock('child_process', () => ({
        exec: jest.fn(),
        spawn: mockSpawn
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;
      analyzer = new DependencyAnalyzer('/base');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('resolves with stdout on successful execution', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = analyzer.spawnProcess('php', ['script.php'], {});

      // Simulate successful execution
      mockChild.stdout.emit('data', 'Hello ');
      mockChild.stdout.emit('data', 'World');
      mockChild.emit('close', 0);

      const result = await resultPromise;

      expect(result.stdout).toBe('Hello World');
    });

    it('includes stderr in resolved object', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = analyzer.spawnProcess('php', ['script.php'], {});

      mockChild.stdout.emit('data', 'output');
      mockChild.stderr.emit('data', 'warning message');
      mockChild.emit('close', 0);

      const result = await resultPromise;

      expect(result.stderr).toBe('warning message');
    });

    it('rejects with descriptive error for missing command', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = analyzer.spawnProcess('nonexistent-command', [], {});

      const error = new Error('spawn nonexistent-command ENOENT');
      error.code = 'ENOENT';
      mockChild.emit('error', error);

      await expect(resultPromise).rejects.toThrow(
        'Command not found: nonexistent-command. Please ensure it\'s installed and in PATH.'
      );
    });

    it('rejects on non-zero exit code', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = analyzer.spawnProcess('php', ['script.php'], {});

      mockChild.stderr.emit('data', 'Fatal error');
      mockChild.emit('close', 1);

      await expect(resultPromise).rejects.toThrow('Process exited with code 1. stderr: Fatal error');
    });

    it('kills process and rejects on timeout', async () => {
      jest.useFakeTimers();

      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = analyzer.spawnProcess('php', ['slow-script.php'], {});

      // Fast-forward past the timeout (CONFIG.TIMEOUT = 300000ms)
      jest.advanceTimersByTime(300001);

      await expect(resultPromise).rejects.toThrow('Process timed out after 300000ms');
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

      jest.useRealTimers();
    });

    it('passes options to spawn', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);
      const customOptions = { cwd: '/custom/dir', env: { FOO: 'bar' } };

      const resultPromise = analyzer.spawnProcess('php', ['script.php'], customOptions);

      mockChild.emit('close', 0);
      await resultPromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'php',
        ['script.php'],
        expect.objectContaining(customOptions)
      );
    });

    it('handles process error other than ENOENT', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = analyzer.spawnProcess('php', ['script.php'], {});

      const error = new Error('Permission denied');
      error.code = 'EACCES';
      mockChild.emit('error', error);

      await expect(resultPromise).rejects.toThrow('Process error: Permission denied');
    });

    it('handles empty stdout', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = analyzer.spawnProcess('php', ['script.php'], {});

      // No stdout data emitted
      mockChild.emit('close', 0);

      const result = await resultPromise;

      expect(result.stdout).toBe('');
    });

    it('handles empty stderr', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = analyzer.spawnProcess('php', ['script.php'], {});

      mockChild.stdout.emit('data', 'output');
      // No stderr data emitted
      mockChild.emit('close', 0);

      const result = await resultPromise;

      expect(result.stderr).toBe('');
    });

    it('handles both empty stdout and stderr', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = analyzer.spawnProcess('php', ['script.php'], {});

      // No stdout or stderr data emitted
      mockChild.emit('close', 0);

      const result = await resultPromise;

      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    });

    it('includes process reference in resolved object', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const resultPromise = analyzer.spawnProcess('php', ['script.php'], {});

      mockChild.emit('close', 0);

      const result = await resultPromise;

      expect(result.process).toBe(mockChild);
    });
  });

  describe('setupWorkDir', () => {
    let analyzer;
    let mockRm;
    let mockCp;
    let mockAccessSync;

    beforeEach(() => {
      jest.resetModules();

      mockRm = jest.fn().mockResolvedValue(undefined);
      mockCp = jest.fn().mockResolvedValue(undefined);
      mockAccessSync = jest.fn();

      jest.doMock('fs/promises', () => ({
        rm: mockRm,
        cp: mockCp
      }));

      jest.doMock('fs', () => ({
        accessSync: mockAccessSync,
        constants: { R_OK: 4 }
      }));

      jest.doMock('os', () => ({
        tmpdir: jest.fn(() => '/tmp')
      }));

      jest.doMock('crypto', () => ({
        createHash: jest.fn(() => ({
          update: jest.fn(() => ({
            digest: jest.fn(() => 'abc123')
          }))
        }))
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;
      analyzer = new DependencyAnalyzer('/base/dir');

      // Suppress console output
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('creates hash-based workdir path', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      await analyzer.setupWorkDir();

      expect(mockCp).toHaveBeenCalledWith(
        '/base/dir',
        expect.stringMatching(/^\/tmp\/workdir-abc123-\d+$/),
        expect.any(Object)
      );
    });

    it('removes existing workdir if present', async () => {
      // First call (exists check) returns true, second call will be different
      mockAccessSync.mockImplementation(() => undefined);

      const logSpy = jest.spyOn(console, 'log');

      await analyzer.setupWorkDir();

      expect(mockRm).toHaveBeenCalledWith(
        expect.stringMatching(/^\/tmp\/workdir-abc123-\d+$/),
        { recursive: true, force: true }
      );
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Removing existing temporary workdir'));
    });

    it('copies baseDir to workDir', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      await analyzer.setupWorkDir();

      expect(mockCp).toHaveBeenCalledWith(
        '/base/dir',
        expect.any(String),
        expect.objectContaining({
          recursive: true,
          preserveTimestamps: true
        })
      );
    });

    it('filters out .git directory', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      let filterFn;
      mockCp.mockImplementation((src, dest, options) => {
        filterFn = options.filter;
        return Promise.resolve();
      });

      await analyzer.setupWorkDir();

      // Test the filter function
      expect(filterFn('/base/dir/.git')).toBe(false);
      expect(filterFn('/base/dir/.git/objects')).toBe(false);
      expect(filterFn('/base/dir/src/file.php')).toBe(true);
      expect(filterFn('/base/dir/vendor')).toBe(true);
    });

    it('preserves timestamps during copy', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      await analyzer.setupWorkDir();

      expect(mockCp).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          preserveTimestamps: true
        })
      );
    });
  });

  describe('cleanup', () => {
    let analyzer;
    let mockRm;
    let mockAccessSync;
    let mockCwd;
    let mockChdir;

    beforeEach(() => {
      jest.resetModules();

      mockRm = jest.fn().mockResolvedValue(undefined);
      mockAccessSync = jest.fn();
      mockCwd = jest.fn().mockReturnValue('/different/cwd');
      mockChdir = jest.fn();

      jest.doMock('fs/promises', () => ({
        rm: mockRm,
        cp: jest.fn()
      }));

      jest.doMock('fs', () => ({
        accessSync: mockAccessSync,
        constants: { R_OK: 4 }
      }));

      jest.doMock('process', () => ({
        cwd: mockCwd,
        chdir: mockChdir
      }));

      const module = require('../../src/determine-dependencies');
      const { DependencyAnalyzer } = module._internal;
      analyzer = new DependencyAnalyzer('/base');
      analyzer.workDir = '/tmp/workdir-test';

      // Suppress console output
      jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('restores original working directory', async () => {
      // Change cwd to something different so cleanup needs to restore it
      mockCwd.mockReturnValue('/some/other/cwd');
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const logSpy = jest.spyOn(console, 'log');

      await analyzer.cleanup();

      // originalCwd was set to '/different/cwd' when DependencyAnalyzer was created (see beforeEach)
      expect(mockChdir).toHaveBeenCalledWith('/different/cwd');
      expect(logSpy).toHaveBeenCalledWith('Restored working directory to /different/cwd');
    });

    it('removes temporary directory', async () => {
      mockAccessSync.mockImplementation(() => undefined);
      mockCwd.mockReturnValue('/original/cwd');

      const logSpy = jest.spyOn(console, 'log');

      await analyzer.cleanup();

      expect(mockRm).toHaveBeenCalledWith('/tmp/workdir-test', { recursive: true, force: true });
      expect(logSpy).toHaveBeenCalledWith('Cleaned up temporary directory: /tmp/workdir-test');
    });

    it('handles missing workDir gracefully', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      mockCwd.mockReturnValue('/original/cwd');

      await analyzer.cleanup();

      expect(mockRm).not.toHaveBeenCalled();
    });

    it('logs warning on cleanup failure', async () => {
      mockAccessSync.mockImplementation(() => undefined);
      mockCwd.mockReturnValue('/original/cwd');
      mockRm.mockRejectedValue(new Error('Permission denied'));

      const warnSpy = jest.spyOn(console, 'warn');

      await analyzer.cleanup();

      expect(warnSpy).toHaveBeenCalledWith('Failed to clean up temporary directory: Permission denied');
    });

    it('does not throw on cleanup failure', async () => {
      mockAccessSync.mockImplementation(() => undefined);
      mockCwd.mockReturnValue('/original/cwd');
      mockRm.mockRejectedValue(new Error('Permission denied'));

      await expect(analyzer.cleanup()).resolves.toBeUndefined();
    });

    it('does nothing if already in original cwd', async () => {
      // Set cwd to match the analyzer's originalCwd (which was '/different/cwd' at creation)
      mockCwd.mockReturnValue('/different/cwd');
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      analyzer.workDir = null;

      await analyzer.cleanup();

      expect(mockChdir).not.toHaveBeenCalled();
    });

    it('handles null workDir', async () => {
      mockCwd.mockReturnValue('/original/cwd');
      analyzer.workDir = null;

      await analyzer.cleanup();

      expect(mockAccessSync).not.toHaveBeenCalled();
      expect(mockRm).not.toHaveBeenCalled();
    });
  });

  describe('determineSourceDependencies (exported function)', () => {
    it('is exported as a function', () => {
      jest.resetModules();

      jest.doMock('fs/promises', () => ({
        rm: jest.fn(),
        cp: jest.fn()
      }));

      jest.doMock('fs', () => ({
        accessSync: jest.fn(() => { throw new Error('not found'); }),
        constants: { R_OK: 4 }
      }));

      jest.doMock('child_process', () => ({
        exec: jest.fn(),
        spawn: jest.fn()
      }));

      const { determineSourceDependencies } = require('../../src/determine-dependencies');

      expect(typeof determineSourceDependencies).toBe('function');
    });

    it('accepts dir and files parameters', () => {
      jest.resetModules();

      jest.doMock('fs/promises', () => ({
        rm: jest.fn(),
        cp: jest.fn()
      }));

      jest.doMock('fs', () => ({
        accessSync: jest.fn(() => { throw new Error('not found'); }),
        constants: { R_OK: 4 }
      }));

      jest.doMock('child_process', () => ({
        exec: jest.fn(),
        spawn: jest.fn()
      }));

      const { determineSourceDependencies } = require('../../src/determine-dependencies');

      // Check function signature accepts correct parameters
      expect(determineSourceDependencies.length).toBe(2);
    });
  });

  describe('CONFIG values', () => {
    let localCONFIG;

    beforeEach(() => {
      jest.resetModules();
      jest.doMock('fs', () => ({
        accessSync: jest.fn(),
        constants: { R_OK: 4 }
      }));

      const module = require('../../src/determine-dependencies');
      localCONFIG = module._internal.CONFIG;
    });

    it('has correct BATCH_SIZE of 100', () => {
      expect(localCONFIG.BATCH_SIZE).toBe(100);
    });

    it('has correct SUPPORTED_EXTENSIONS', () => {
      expect(localCONFIG.SUPPORTED_EXTENSIONS).toEqual(['.php', '.phtml']);
    });

    it('has correct IGNORED_PATHS', () => {
      expect(localCONFIG.IGNORED_PATHS).toEqual(['/.git']);
    });

    it('has correct BUFFER_SIZE', () => {
      expect(localCONFIG.BUFFER_SIZE).toBe(4 * 1024 * 1024);
    });

    it('has correct TIMEOUT', () => {
      expect(localCONFIG.TIMEOUT).toBe(300000);
    });
  });

  describe('Edge cases and error handling', () => {
    describe('filterPhpFiles edge cases', () => {
      let analyzer;

      beforeEach(() => {
        jest.resetModules();
        jest.doMock('fs', () => ({
          accessSync: jest.fn(),
          constants: { R_OK: 4 }
        }));

        const module = require('../../src/determine-dependencies');
        const { DependencyAnalyzer } = module._internal;
        analyzer = new DependencyAnalyzer('/base');

        jest.spyOn(console, 'log').mockImplementation(() => {});
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('handles files with special characters in path', () => {
        const files = [
          { filepath: '/path/with spaces/file.php', contentBuffer: Buffer.from('<?php') },
          { filepath: '/path/with-dashes/file.php', contentBuffer: Buffer.from('<?php') },
          { filepath: '/path/with_underscores/file.php', contentBuffer: Buffer.from('<?php') }
        ];

        const result = analyzer.filterPhpFiles(files);

        expect(result).toHaveLength(3);
      });

      it('handles files with uppercase extensions', () => {
        const files = [
          { filepath: '/path/to/file.PHP', contentBuffer: Buffer.from('<?php') },
          { filepath: '/path/to/file.PHTML', contentBuffer: Buffer.from('<?php') }
        ];

        const result = analyzer.filterPhpFiles(files);

        // Current implementation is case-sensitive, so these should not match
        expect(result).toHaveLength(0);
      });

      it('handles files with double extensions', () => {
        const files = [
          { filepath: '/path/to/file.blade.php', contentBuffer: Buffer.from('<?php') },
          { filepath: '/path/to/file.twig.php', contentBuffer: Buffer.from('<?php') }
        ];

        const result = analyzer.filterPhpFiles(files);

        expect(result).toHaveLength(2);
      });

      it('handles files with very long content buffers', () => {
        const largeBuffer = Buffer.alloc(1024 * 1024); // 1MB
        const files = [
          { filepath: '/path/to/large.php', contentBuffer: largeBuffer }
        ];

        const result = analyzer.filterPhpFiles(files);

        expect(result).toHaveLength(1);
      });
    });

    describe('path handling edge cases', () => {
      it('handles Windows-style paths', () => {
        const windowsPath = 'C:\\Users\\project\\src\\file.php';
        const normalized = path.normalize(windowsPath);

        expect(normalized).toBeDefined();
      });

      it('handles paths with .. segments', () => {
        const pathWithParent = '/project/src/../vendor/file.php';
        const resolved = path.resolve(pathWithParent);

        expect(resolved).not.toContain('..');
      });
    });
  });
});
