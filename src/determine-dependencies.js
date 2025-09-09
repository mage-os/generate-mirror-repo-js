const fs = require('fs/promises');
const {constants, accessSync} = require('fs');
const {tmpdir} = require('os');
const {cwd, chdir} = require('process');
const path = require('path');
const childProcess = require('child_process');
const {createHash} = require('crypto');

function fsExists(dirOrFile) {
  try {
    accessSync(dirOrFile, constants.R_OK);
    return true;
  } catch (exception) {
    return false;
  }
}

async function setupWorkDir(dir, workDir) {
  if (fsExists(workDir)) {
    console.log(`Removing existing temporary workdir at ${workDir}`);
    await fs.rm(workDir, {recursive: true})
  }
  console.log(`Preparing temporary copy in ${workDir}`);
  return fs.cp(dir, workDir, {recursive: true, filter: f => ! f.endsWith('/.git') && ! f.includes('/.git/'),})
}

async function composerInstall() {
  return new Promise((resolve, reject) => {
    const command = 'composer install --no-progress --no-plugins --no-scripts';
    console.log(`Running ${command}`);
    const bufferBytes = 94 * 1024 * 1024; // 4M
    childProcess.exec(command, {maxBuffer: bufferBytes}, (error, stdout, stderr) => {
      if (stderr && stderr.includes('Warning: The lock file is not up to date with the latest changes in composer.json')) stderr = '';
      if (stderr && stderr.includes('Generating autoload files')) stderr = '';
      if (error) {
        reject(`Error executing command: ${error.message}`);
      }
      if (stderr) {
        reject(`[error] ${stderr}`);
      }
      resolve(stdout);
    });
  });
}

module.exports = {
  // This determineSourceDependencies function is used to determine the actual source dependencies for the base package
  async determineSourceDependencies(dir, files) {
    const prevCwd = cwd();
    try {
      console.log(`Determining dependencies...`);
      const hash = createHash('md5').update(dir).digest('hex');
      const workDir = `${tmpdir()}/workdir-${hash}`;
      await setupWorkDir(dir, workDir);
      chdir(workDir);
      if (! fsExists(path.join(workDir, 'vendor/autoload.php'))) {
        await composerInstall();
      }

      const phpFiles = files.filter(file => file.filepath.endsWith('.php') || file.filepath.endsWith('.phtml'));
      console.log(`Inspecting ${phpFiles.length} files to determine composer dependencies...`);

      return new Promise((resolve, reject) => {
        let packages = '';
        let hasError = false;

        // Start the find-packages process
        const findPackages = childProcess.spawn(path.resolve(`${__dirname}/../bin/find-composer-packages.php`), ['vendor/autoload.php']);
        
        findPackages.stdout.on('data', data => {
          packages += data;
        });

        findPackages.stderr.on('data', data => {
          console.error('findPackages stderr:', data.toString());
        });

        findPackages.on('error', error => {
          console.error('findPackages error:', error);
          hasError = true;
          reject(error);
        });

        findPackages.on('close', status => {
          console.log('findPackages closed with status:', status);
          if (hasError) return; // Already rejected
          
          if (status !== 0) {
            reject(new Error(`Error determining source dependencies: ${packages.trim()}`));
            return;
          }
          
          try {
            const json = "{" + packages.trim().split("\n").join(",\n") + "}";
            resolve(JSON.parse(json));
          } catch (parseError) {
            reject(new Error(`Failed to parse JSON response: ${parseError.message}`));
          }
        });

        // Process PHP files
        const processPhpFiles = () => {
          return new Promise((resolvePhp, rejectPhp) => {
            // Start php-classes process and pipe its output to findPackages
            const classesInPhp = childProcess.spawn('php-classes.phar', [], {
              stdio: ['pipe', 'pipe', 'pipe']
            });

            classesInPhp.stderr.on('data', data => {
              console.error('php-classes stderr:', data.toString());
            });

            classesInPhp.on('error', error => {
              console.error('php-classes error:', error);
              if (error.code === 'ENOENT') {
                console.error('Error: Missing `php-classes.phar`. Please see the README for install directions.');
              }
              hasError = true;
              rejectPhp(error);
            });

            classesInPhp.on('close', status => {
              console.log('php-classes closed with status:', status);
              if (!hasError) {
                resolvePhp();
              }
            });

            // Pipe php-classes output to findPackages input
            classesInPhp.stdout.pipe(findPackages.stdin, { end: false });

            // Write all PHP file contents
            const writeFiles = async () => {
              try {
                for (const file of phpFiles) {
                  await new Promise((resolveWrite, rejectWrite) => {
                    if (classesInPhp.stdin.destroyed) {
                      rejectWrite(new Error('stdin is destroyed'));
                      return;
                    }
                    
                    const success = classesInPhp.stdin.write(file.contentBuffer);
                    classesInPhp.stdin.write(Buffer.alloc(1)); // separator
                    
                    if (success) {
                      resolveWrite();
                    } else {
                      classesInPhp.stdin.once('drain', resolveWrite);
                    }
                  });
                }
                
                console.log('Finished writing PHP files');
                classesInPhp.stdin.end();
              } catch (error) {
                console.error('Error writing files:', error);
                hasError = true;
                rejectPhp(error);
              }
            };

            writeFiles();
          });
        };

        // Process DI XML files
        const processDiXml = () => {
          return new Promise((resolveDi, rejectDi) => {
            const classesInDiXml = childProcess.spawn('php-classes.phar', ['--di.xml', 'app/etc/di.xml'], {
              stdio: ['pipe', 'pipe', 'pipe']
            });

            classesInDiXml.stderr.on('data', data => {
              console.error('php-classes DI stderr:', data.toString());
            });

            classesInDiXml.on('error', error => {
              console.error('php-classes DI error:', error);
              hasError = true;
              rejectDi(error);
            });

            classesInDiXml.on('close', status => {
              console.log('php-classes DI closed with status:', status);
              resolveDi();
            });

            // Pipe DI XML output to findPackages input
            classesInDiXml.stdout.pipe(findPackages.stdin, { end: false });
            classesInDiXml.stdin.end(); // No input needed for DI XML processing
          });
        };

        // Run both processes sequentially, then close findPackages input
        Promise.allSettled([processPhpFiles(), processDiXml()])
          .then((results) => {
            console.log('Processing results:', results.map(r => r.status));
            
            // Check if any critical errors occurred
            const failures = results.filter(r => r.status === 'rejected');
            if (failures.length > 0) {
              console.log('Some processes failed, but continuing...');
              failures.forEach((failure, index) => {
                console.error(`Process ${index} failed:`, failure.reason);
              });
            }
            
            console.log('Finished processing all files');
            findPackages.stdin.end();
          })
          .catch(error => {
            console.error('Unexpected error in process handling:', error);
            if (!hasError) {
              hasError = true;
              reject(error);
            }
          });
      });

    } catch (error) {
      console.error('General error:', error);
      throw error;
    } finally {
      chdir(prevCwd);
      console.log('Changed directory back to ' + prevCwd);
    }
  }
}
