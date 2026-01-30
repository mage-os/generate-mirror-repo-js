const fs = require('fs/promises');
const {constants, accessSync} = require('fs');
const {tmpdir} = require('os');
const {cwd, chdir} = require('process');
const path = require('path');
const childProcess = require('child_process');
const {createHash} = require('crypto');
const {promisify} = require('util');
const exec = promisify(childProcess.exec);

// Configuration constants
const CONFIG = {
  BUFFER_SIZE: 4 * 1024 * 1024, // 4MB
  BATCH_SIZE: 100, // Process files in batches to avoid memory issues
  TIMEOUT: 300000, // 5 minutes timeout for child processes
  SUPPORTED_EXTENSIONS: ['.php', '.phtml'],
  IGNORED_PATHS: ['/.git']
};

class DependencyAnalyzer {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.workDir = null;
    this.originalCwd = cwd();
  }

  /**
   * Check if a file or directory exists and is readable
   */
  static exists(path) {
    try {
      accessSync(path, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a hash-based temporary directory name
   */
  createWorkDirPath() {
    const hash = createHash('md5').update(this.baseDir).digest('hex');
    return path.join(tmpdir(), `workdir-${hash}-${Date.now()}`);
  }

  /**
   * Setup temporary working directory with better filtering
   */
  async setupWorkDir() {
    this.workDir = this.createWorkDirPath();
    
    if (DependencyAnalyzer.exists(this.workDir)) {
      console.log(`Removing existing temporary workdir at ${this.workDir}`);
      await fs.rm(this.workDir, {recursive: true, force: true});
    }
    
    console.log(`Preparing temporary copy in ${this.workDir}`);
    
    const filter = (src) => {
      const relativePath = path.relative(this.baseDir, src);
      return !CONFIG.IGNORED_PATHS.some(ignored => 
        src.includes(ignored) || relativePath.startsWith(ignored.slice(1))
      );
    };

    await fs.cp(this.baseDir, this.workDir, {
      recursive: true, 
      filter,
      preserveTimestamps: true
    });
  }

  /**
   * Run composer install with better error handling and logging
   */
  async runComposerInstall() {
    const command = 'composer install --no-progress --no-plugins --no-scripts --no-dev';
    console.log(`Running: ${command}`);
    
    try {
      const {stdout, stderr} = await exec(command, {
        maxBuffer: CONFIG.BUFFER_SIZE,
        timeout: CONFIG.TIMEOUT,
        cwd: this.workDir
      });

      // Filter out expected warnings
      const filteredStderr = stderr
        .split('\n')
        .filter(line => 
          !line.includes('Warning: The lock file is not up to date') &&
          !line.includes('Generating autoload files') &&
          line.trim() !== ''
        )
        .join('\n');

      if (filteredStderr) {
        console.warn('Composer warnings:', filteredStderr);
      }

      return stdout;
    } catch (error) {
      throw new Error(`Composer install failed: ${error.message}`);
    }
  }

  /**
   * Filter and validate PHP files
   */
  filterPhpFiles(files) {
    const phpFiles = files.filter(file => 
      CONFIG.SUPPORTED_EXTENSIONS.some(ext => file.filepath.endsWith(ext)) &&
      file.contentBuffer && 
      file.contentBuffer.length > 0
    );

    console.log(`Found ${phpFiles.length} PHP files out of ${files.length} total files`);
    return phpFiles;
  }

  /**
   * Process files in batches to avoid memory issues
   */
  async processFilesInBatches(phpFiles, processor) {
    const results = [];
    
    for (let i = 0; i < phpFiles.length; i += CONFIG.BATCH_SIZE) {
      const batch = phpFiles.slice(i, i + CONFIG.BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1}/${Math.ceil(phpFiles.length / CONFIG.BATCH_SIZE)} (${batch.length} files)`);
      
      try {
        const result = await processor(batch);
        if (result) results.push(result);
      } catch (error) {
        console.warn(`Batch processing failed for files ${i}-${i + batch.length - 1}:`, error.message);
        // Continue with other batches
      }
    }
    
    return results;
  }

  /**
   * Spawn a child process with proper error handling and timeout
   */
  spawnProcess(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const child = childProcess.spawn(command, args, {
        timeout: CONFIG.TIMEOUT,
        ...options
      });

      let stdout = '';
      let stderr = '';
      let isComplete = false;

      child.stdout?.on('data', data => stdout += data);
      child.stderr?.on('data', data => stderr += data);

      // Setup timeout timer
      const timeoutTimer = setTimeout(() => {
        if (!isComplete && !child.killed) {
          isComplete = true;
          child.kill('SIGTERM');
          reject(new Error(`Process timed out after ${CONFIG.TIMEOUT}ms`));
        }
      }, CONFIG.TIMEOUT);

      const cleanup = () => {
        isComplete = true;
        clearTimeout(timeoutTimer);
      };

      child.on('error', error => {
        cleanup();
        if (error.code === 'ENOENT') {
          reject(new Error(`Command not found: ${command}. Please ensure it's installed and in PATH.`));
        } else {
          reject(new Error(`Process error: ${error.message}`));
        }
      });

      child.on('close', code => {
        cleanup();
        if (code === 0) {
          resolve({stdout, stderr, process: child});
        } else {
          reject(new Error(`Process exited with code ${code}. stderr: ${stderr}`));
        }
      });
    });
  }

  /**
   * Process PHP files through php-classes.phar
   */
  async processPhpFiles(phpFiles) {
    if (phpFiles.length === 0) return null;

    return new Promise((resolve, reject) => {
      const classesProcess = childProcess.spawn('php-classes.phar', [], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let hasError = false;

      classesProcess.stdout.on('data', data => output += data);
      classesProcess.stderr.on('data', data => {
        console.warn('php-classes stderr:', data.toString());
      });

      classesProcess.on('error', error => {
        if (error.code === 'ENOENT') {
          reject(new Error('php-classes.phar not found. Please ensure it\'s installed and in PATH.'));
        } else {
          reject(error);
        }
      });

      classesProcess.on('close', code => {
        if (code === 0 && !hasError) {
          resolve(output);
        } else if (!hasError) {
          reject(new Error(`php-classes.phar exited with code ${code}`));
        }
      });

      classesProcess.stdin.on('error', error => {
        if (error.code !== 'EPIPE') {
          hasError = true;
          reject(error);
        }
      });

      // Write all file contents at once
      try {
        const contents = phpFiles.map(file => file.contentBuffer);
        const separators = new Array(phpFiles.length).fill(Buffer.alloc(1));
        const combined = Buffer.concat(contents.flatMap((content, i) => 
          i < contents.length - 1 ? [content, separators[i]] : [content]
        ));

        classesProcess.stdin.write(combined, error => {
          if (error && error.code !== 'EPIPE') {
            hasError = true;
            reject(error);
          } else {
            classesProcess.stdin.end();
          }
        });
      } catch (error) {
        hasError = true;
        reject(error);
      }
    });
  }

  /**
   * Process DI XML files
   */
  async processDiXml() {
    const diXmlPath = path.join(this.workDir, 'app/etc/di.xml');
    
    if (!DependencyAnalyzer.exists(diXmlPath)) {
      console.log('No di.xml file found, skipping DI analysis');
      return null;
    }

    try {
      const result = await this.spawnProcess('php-classes.phar', ['--di.xml', 'app/etc/di.xml'], {
        cwd: this.workDir
      });
      return result.stdout;
    } catch (error) {
      console.warn('DI XML processing failed:', error.message);
      return null;
    }
  }

  /**
   * Find composer packages from class analysis results
   */
  async findComposerPackages(classAnalysisResults) {
    const findPackagesPath = path.resolve(__dirname, '../bin/find-composer-packages.php');
    
    if (!DependencyAnalyzer.exists(findPackagesPath)) {
      throw new Error(`find-composer-packages.php not found at ${findPackagesPath}`);
    }

    return new Promise((resolve, reject) => {
      const findProcess = childProcess.spawn(findPackagesPath, ['vendor/autoload.php'], {
        cwd: this.workDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let hasError = false;

      findProcess.stdout.on('data', data => output += data);
      findProcess.stderr.on('data', data => {
        console.warn('find-composer-packages stderr:', data.toString());
      });

      findProcess.on('error', error => {
        hasError = true;
        reject(error);
      });

      findProcess.on('close', code => {
        if (hasError) return;

        if (code !== 0) {
          reject(new Error(`find-composer-packages.php exited with code ${code}`));
          return;
        }

        try {
          const lines = output.trim().split('\n').filter(line => line.trim());
          if (lines.length === 0) {
            resolve({});
            return;
          }

          const json = '{' + lines.join(',\n') + '}';
          resolve(JSON.parse(json));
        } catch (parseError) {
          reject(new Error(`Failed to parse composer packages JSON: ${parseError.message}`));
        }
      });

      // Write all analysis results
      const combinedResults = classAnalysisResults.filter(Boolean).join('\n');
      if (combinedResults) {
        findProcess.stdin.write(combinedResults);
      }
      findProcess.stdin.end();
    });
  }

  /**
   * Cleanup temporary resources
   */
  async cleanup() {
    // Restore original working directory
    if (cwd() !== this.originalCwd) {
      chdir(this.originalCwd);
      console.log(`Restored working directory to ${this.originalCwd}`);
    }

    // Clean up temporary directory
    if (this.workDir && DependencyAnalyzer.exists(this.workDir)) {
      try {
        await fs.rm(this.workDir, {recursive: true, force: true});
        console.log(`Cleaned up temporary directory: ${this.workDir}`);
      } catch (error) {
        console.warn(`Failed to clean up temporary directory: ${error.message}`);
      }
    }
  }

  /**
   * Main method to determine source dependencies
   */
  async determineSourceDependencies(files) {
    try {
      console.log('Starting dependency analysis...');
      
      // Setup
      await this.setupWorkDir();
      chdir(this.workDir);

      // Install composer dependencies if needed
      const autoloadPath = path.join(this.workDir, 'vendor/autoload.php');
      if (!DependencyAnalyzer.exists(autoloadPath)) {
        await this.runComposerInstall();
      }

      // Filter PHP files
      const phpFiles = this.filterPhpFiles(files);

      // Process files in parallel where possible
      const [phpResults, diResults] = await Promise.allSettled([
        phpFiles.length > CONFIG.BATCH_SIZE 
          ? this.processFilesInBatches(phpFiles, batch => this.processPhpFiles(batch))
          : this.processPhpFiles(phpFiles),
        this.processDiXml()
      ]);

      // Collect all analysis results
      const analysisResults = [];
      
      if (phpResults.status === 'fulfilled' && phpResults.value) {
        if (Array.isArray(phpResults.value)) {
          analysisResults.push(...phpResults.value);
        } else {
          analysisResults.push(phpResults.value);
        }
      } else if (phpResults.status === 'rejected') {
        console.warn('PHP file analysis failed:', phpResults.reason.message);
      }

      if (diResults.status === 'fulfilled' && diResults.value) {
        analysisResults.push(diResults.value);
      } else if (diResults.status === 'rejected') {
        console.warn('DI XML analysis failed:', diResults.reason.message);
      }

      // Find composer packages
      const packages = await this.findComposerPackages(analysisResults);
      
      console.log(`Analysis complete. Found ${Object.keys(packages).length} composer packages.`);
      return packages;

    } catch (error) {
      console.error('Dependency analysis failed:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

module.exports = {
  async determineSourceDependencies(dir, files) {
    const analyzer = new DependencyAnalyzer(dir);
    return analyzer.determineSourceDependencies(files);
  },
  // For testing
  _internal: {
    DependencyAnalyzer,
    CONFIG
  }
};
