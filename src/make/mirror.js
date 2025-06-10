const repo = require('./../repository');
const parseOptions = require('parse-options');
const {setArchiveBaseDir, setMageosPackageRepoUrl, setCompressionLevel} = require('./../package-modules');
const {copyAdditionalPackages, processMirrorInstruction} = require('./../mirror-build-tools');
const {buildConfig: mirrorInstructions} = require('./../build-config/mirror-build-config');


const options = parseOptions(
  `$outputDir $gitRepoDir $repoUrl $concurrency $skipTagCache $compressionLevel @help|h`,
  process.argv
);


if (options.help) {
  console.log(`Build Mage-OS mirror composer packages from github.com/mage-os git repositories.

Usage:
  node src/make/mirror.js [OPTIONS]

Options:
  --outputDir=       Dir to contain the built packages (default: packages)
  --gitRepoDir=      Dir to clone repositories into (default: repositories)
  --repoUrl=         Composer repository URL to use in base package (default: https://repo.mage-os.org/)
  --concurrency=     Max concurrent package builds (default: 10)
  --skipTagCache=    Skip tag pre-fetching (default: false)
  --compressionLevel= ZIP compression level 1-9 (default: 6)
`);
  process.exit(1);
}

const archiveDir = options.outputDir || 'packages';
setArchiveBaseDir(archiveDir);

if (options.gitRepoDir) {
  repo.setStorageDir(options.gitRepoDir);
}

if (options.repoUrl) {
  setMageosPackageRepoUrl(options.repoUrl);
}

const concurrency = parseInt(options.concurrency) || 10;
const skipTagCache = options.skipTagCache === 'true';
const compressionLevel = parseInt(options.compressionLevel) || 6;

// Set compression level
setCompressionLevel(compressionLevel);


(async () => {
  try {
    console.log('Pre-initializing repositories and fetching tags in parallel...');
    
    // Extract all unique repository URLs from instructions
    const repoUrls = [...new Set(mirrorInstructions.map(instruction => instruction.repoUrl))];
    
    // Pre-initialize all repositories and fetch tags in parallel
    await Promise.all(repoUrls.map(async (repoUrl) => {
      try {
        await repo.checkout(repoUrl); // Just clone, don't checkout specific ref yet
        console.log(`✓ Initialized ${repoUrl}`);
        
        // Pre-fetch tags for faster tag listing later (unless disabled)
        if (!skipTagCache) {
          try {
            await repo.listTags(repoUrl);
            console.log(`✓ Fetched tags for ${repoUrl}`);
          } catch (tagError) {
            console.log(`Warning: Could not fetch tags for ${repoUrl}: ${tagError.message}`);
          }
        }
      } catch (error) {
        console.log(`Warning: Failed to initialize ${repoUrl}: ${error.message}`);
      }
    }));
    
    console.log(`Repository initialization complete (${repoUrls.length} repositories). Starting package generation...`);
    
    for (const instruction of mirrorInstructions) {
      await processMirrorInstruction({...instruction, concurrency, compressionLevel});
    }
    await copyAdditionalPackages(archiveDir);
  } catch (exception) {
    console.log(exception);
    throw exception
  }
})()
