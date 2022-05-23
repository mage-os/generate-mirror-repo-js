const fs = require('fs/promises');
const {constants, accessSync} = require('fs');
const {tmpdir} = require('os');
const {cwd, chdir} = require('process');
const path = require('path');
const childProcess = require("child_process");

function fsExists(dirOrFile)
{
  try {
    accessSync(dirOrFile, constants.R_OK);
    return true;
  } catch (exception) {
    return false;
  }
}

async function setupWorkDir(dir, workDir)
{
  return new Promise(async resolve => {
    if (! fsExists(path.join(workDir, 'app/etc'))) {
      console.log(`Copying repo to ${workDir}`);
      return fs.cp(dir, workDir, {recursive: true}).then(() => resolve());
    }
    resolve();
  });
}

async function composerInstall()
{
  return new Promise((resolve, reject) => {
    const command = 'composer install --no-progress --no-plugins --no-scripts';
    console.log(`Running ${command}`);
    const bufferBytes = 4 * 1024 * 1024; // 4M
    childProcess.exec(command, {maxBuffer: bufferBytes}, (error, stdout, stderr) => {
      if (stderr && stderr.includes('Warning: The lock file is not up to date with the latest changes in composer.json')) stderr = '';
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
  async determineDependencies(dir, files) {
    const prevCwd = cwd();
    try {
      const workDir = `${tmpdir()}/workdir`;
      await setupWorkDir(dir, workDir);
      chdir(workDir);
      if (! fsExists(path.join(workDir, 'vendor/autoload.php'))) {
        await composerInstall();
      }

      // Pipe php and phtml files to php-classes.phar to find referenced php classes
      return new Promise(async resolve => {
        console.log('Determining composer dependencies for files in current package');
        const phpFiles = files.filter(file => file.endsWith('.php') || file.endsWith('.phtml'));
        
        const findPackages = childProcess.spawn(path.resolve(`${__dirname}/../bin/find-composer-packages.php`), ['vendor/autoload.php']);
        let packages = '';
        findPackages.stdout.on('data', data => {
          packages += data;
        });
        findPackages.on('close', status => {
          resolve(JSON.parse("{" + packages.trim().split("\n").join(",\n") + "}"));
        });
        
        // Spawns write directly to findPackages STDIN using this stdio option:
        const optStdio = {stdio: ['pipe', findPackages.stdin, 'pipe']}; // [stdin, stdout, stderr]

        await new Promise(resolve => {
          const classesInPhp = childProcess.spawn('php-classes.phar', [], optStdio);
          classesInPhp.on('close', status => resolve());
          
          // Pipe file contents to php-classes.phar separated by a zero byte
          Promise.all(phpFiles.map(async file => {
            return fs.readFile(file).then(async content => {
              await classesInPhp.stdin.write(content)
              await classesInPhp.stdin.write(Buffer.alloc(1));
            });
          })).then(() => classesInPhp.stdin.end());
        });
        
        
        await new Promise(resolve => {
          // Pass only app/etc/di.xml file as an argument, ignore di.xml under dev/ for now 
          const classesInDiXml = childProcess.spawn('php-classes.phar', ['--di.xml', 'app/etc/di.xml'], optStdio);
          classesInDiXml.on('close', status => resolve());
        });
        
        findPackages.stdin.end();
      });
      
    } finally {
      chdir(prevCwd);
    }
  }
}