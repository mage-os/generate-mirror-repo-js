# Mage-OS Monorepo Package Splitter - JS Edition

Experimental JavaScript implementation for comparison purposes.
This is not intended to go into production, but rather it is for learning purposes.

## Usage

Edit `src/main.js` and set the repo git URL and tag 
Usage: `node src/main.js`

## Todo

* Performance needs optimizing
  * Most importantly finding the last commit for a given file
  * Experiment with parallelism but expanding the repo history would require locking
* The resulting archive collection needs to be checked against satis
* The base package needs to be built
* Configuration and command line argument processing
* Throw it all away and write again using TDD