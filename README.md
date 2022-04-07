# Mage-OS Mirror Repository Generator - JS Edition

Experimental JavaScript implementation.  
This is not primarily intended to go into production, but rather it is for learning purposes.  
The main implementation will be based on <https://github.com/mage-os/package-splitter> when it is ready.

## Generated versions

All packages required to install Magento Open Source 2.4.0 and newer will be generated.
This might change in the future.

## Usage

The composer package repository is generated using a docker image.  

Mount the directory to contain the generated files into `/build` while executing the container image.  
This should be the DOCUMENT_ROOT of the host serving the mirror, for example `--volume /var/www/html:/build`.  

Optional: a `~/.composer` directory can be mounted, too, which will allow satis to benefit from existing caches. This doesn't make a big difference though.  
Example: `--volume "${COMPOSER_HOME:-$HOME/.composer}:/composer"`

A local cache directory can be mounted at `/generate-repo/repositories` in order to persist the cloned GitHub repos.  
Be aware that in existing git repositories currently will not be updated on subsequent runs. This is mainly useful during development when executing the container image multiple times consecutively.  
If you want to experiment with creating a mirror repo, I suggest you use this, since the current JS git implementation is quite slow cloning a repo as large as magento2 (even as a shallow clone).  
Example: `--volume "${$HOME}/repo-cache:/generate-repo/repositories"`

If a package for a given version already exist, it won't be overwritten. Regenerating specific packages means deleting the packages in question and then re-executing the container. 

### docker

For example, to generate the repository in `~/html`, run the following command, replacing `https://mirror.mage-os.org` with the URL of your mirror:

```bash
docker run --rm --init -it --user $(id -u):$(id -g) \
  --volume "$(pwd)/html:/build" \
  --volume "${COMPOSER_HOME:-$HOME/.composer}:/composer" \
  magece/mirror-repo-js:latest --mirror-base-url=https://mirror.mage-os.org
```

### podman

If you prefer to execute the container with `podman`, you should not specify the `--user` argument, as the in-container root user will automatically map to the current system user.
To generate the repository in `~/html` using podman, run the following command, replacing `https://mirror.mage-os.org` with the URL of your mirror:

```bash
podman run --rm --init -it \
  --volume "$(pwd)/html:/build:z"  \
  --volume "${COMPOSER_HOME:-$HOME/.composer}:/composer:z" \
  magece/mirror-repo-js:latest --mirror-base-url=https://mirror.mage-os.org
```

### manual generation
**Warning: This method is unsupported and might break without further notice!** 

Alternatively it is possible to generate the repo without using a container.  
This is mainly useful in order to debug the build process or to help understand what happens inside a container during the build.

For this, you'll need nodejs 16, php8-0 (or 7.4), yarn, git and composer.

To generate the repo in the directory `./build/`, issue the following commands:

```bash
export MIRROR_BASE_URL="https://example.com"
git clone https://github.com/mage-os/generate-mirror-repo-js.git
cd generate-mirror-repo-js/
composer2  create-project composer/satis --stability=dev
yarn install
node src/main.js --outputDir=./build/packages --gitRepoDir=./generate-repo/repositories --mirrorUrl="$MIRROR_BASE_URL"
node bin/set-satis-homepage-url.js --satisConfig=satis.json  --mirrorUrl="$MIRROR_BASE_URL" > /tmp/satis.json   
./satis/bin/satis build  /tmp/satis.json ./build/
node ./bin/set-satis-output-url-prefix.js --satisOutputDir=./build --mirrorUrl="$MIRROR_BASE_URL"  
```

## Building

```bash
docker build -t magece/mirror-repo-js .
```


## TODO
* Improve performance of package generation, maybe by switching to https://www.nodegit.org/api/libgit_2/
* Make command line parsing of --mirror-base-url more robust


## Copyright 2022 Vinai Kopp

Distributed under the terms of the 3-Clause BSD Licence.
See the [LICENSE](LICENSE) file for more details.
