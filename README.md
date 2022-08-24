[![Build, Deploy & check Integrity of preview-mirror](https://github.com/mage-os/generate-mirror-repo-js/actions/workflows/build-preview-mirror.yml/badge.svg)](https://github.com/mage-os/generate-mirror-repo-js/actions/workflows/build-preview-mirror.yml)

# Mage-OS Mirror Repository Generator - JS Edition

This project was started not with the primary goal to go into production, but rather to explore and learn how to build Magento Open Source releases.  
It has evolved to be used in production. However, the intention is to create additional implementations, for example in Rust <https://github.com/mage-os/package-splitter>.  

## Generated versions

All packages required to install Magento Open Source 2.3.7-p3 and newer will be generated.
This might change in the future.

## Usage

This project provides a docker image to generate a composer package repository.  

Mount the directory to contain the generated files into `/build` while executing the image.  
Usually this will be the DOCUMENT_ROOT of the host serving the composer repo, for example `--volume /var/www/html:/build`.  

### Specifying the build target(s)

This project can generate different types of composer repositories. At the time of writing, the supported build targets are

#### `--target=mirror` (default)

By default, a Magento Open Source mirror repository is generated.

#### `--target=upstream-nightly`

Alternatively a release of the current development versions of Magento Open Source can be generated. This is known as a "nightly" build.


### Caching git repositories

Caching git repos is optional. Without caching, every git repository will be cloned each time the repo is generated. This ensures the latest versions will be used to generate the packages.  
However, cloning large repositories like Magento Open Source takes some time, so it can be beneficial to cache the cloned repository.  

A local directory can be mounted at `/generate-repo/repositories` in order to cache the cloned GitHub repos.  
Be aware that existing git repositories currently will not be updated on subsequent runs. This is mainly useful during development when executing the container image multiple times consecutively.
If you want to update a cached git repo before packages are generated, either delete the cache dir, or run `git fetch --tags` manually before executing the image. 

Example: `--volume "${HOME}/repo-cache:/generate-repo/repositories"`

### Mounting a composer dir

A `~/.composer` directory can be mounted, too, which will allow satis to benefit from existing caches. This doesn't make a big difference though.  
Example: `--volume "${COMPOSER_HOME:-$HOME/.composer}:/composer"`

### Regenerating exiting packages

If a package for a given version already exist, it will be skipped during subsequent runs.  
Regenerating specific packages requires deleting the packages in question and then re-executing the image. 

### Example with docker

To generate the repository in the directory `~/html`, run the following command, replacing `https://mirror.mage-os.org` with the URL of your mirror:

```bash
docker run --rm --init -it --user $(id -u):$(id -g) \
  --volume "$(pwd)/html:/build" \
  --volume "${COMPOSER_HOME:-$HOME/.composer}:/composer" \
  magece/mageos-repo-js:latest  --target=mirror --mirror-base-url=https://mirror.mage-os.org
```

### podman

If you prefer to execute the container with `podman`, you should not specify the `--user` argument, as the in-container root user will automatically map to the current system user.
To generate the repository in `~/html` using podman, run the following command, replacing `https://mirror.mage-os.org` with the URL of your mirror:

```bash
podman run --rm --init -it \
  --volume "$(pwd)/html:/build:z"  \
  --volume "${COMPOSER_HOME:-$HOME/.composer}:/composer:z" \
  magece/mageos-repo-js:latest --mirror-base-url=https://mirror.mage-os.org
```

### manual generation
**Warning: This method is unsupported and might break without further notice!** 

Alternatively it is possible to generate the repo without using a container.  
This is mainly useful in order to debug the build process or to help understand what happens inside a container during the build.

For this, you'll need nodejs 16, php8-0 (or 7.4), yarn, git and composer.

Also, the [github.com/mage-os/php-dependency-list](https://github.com/mage-os/php-dependency-list) phar executable is expected to be in the PATH.

```sh
curl -L https://github.com/mage-os/php-dependency-list/raw/main/php-classes.phar -o /usr/local/bin/php-classes.phar
chmod +x /usr/local/bin/php-classes.phar
```

To generate the repo in the directory `./build/`, issue the following commands:

```sh
export MIRROR_BASE_URL="https://example.com"
git clone https://github.com/mage-os/generate-mirror-repo-js.git
cd generate-mirror-repo-js/
composer2  create-project composer/satis --stability=dev
yarn install
node src/make/mirror.js --outputDir=./build/packages --gitRepoDir=./generate-repo/repositories --repoUrl="$MIRROR_BASE_URL"
node bin/set-satis-homepage-url.js --satisConfig=satis.json  --repoUrl="$MIRROR_BASE_URL" > /tmp/satis.json   
./satis/bin/satis build  /tmp/satis.json ./build/
node ./bin/set-satis-output-url-prefix.js --satisOutputDir=./build --repoUrl="$MIRROR_BASE_URL"  
```

To generate an upstream-nightly build, replace the first node command with

```sh
node src/make/upstream.js --outputDir=./build/packages --gitRepoDir=./generate-repo/repositories --repoUrl="$MIRROR_BASE_URL"
```

## Updating a mirror with a new release

### 1. Update cached git repos

If you are using cached git repositories, be sure to fetch the latest tags .  
In case you didn't specify a repository cache directory when generating the image, this step can be skipped as the repositories will be cloned again always.

For example, to fetch the latest release tags, if the git repos are cached in a directory `./repositories`, run the following command:

```sh
cd repositories
for repo in *; do cd $repo; git fetch --all; git fetch --tags; cd -; done
cd .. 
```

Alternatively, delete the contents of the repo cache dir, and all repos will be cloned again. 

### 2. Update the container image

Be sure to fetch the latest version of the image with `podman pull magece/mageos-repo-js:latest`
or `docker pull magece/mageos-repo-js:latest`.

### 3. Re-run the command to generate the composer repo

Then re-run the repository generation with the same arguments as the initial generation.


## Building the docker image

```bash
docker build -t magece/mirror-repo-js .
```

## TODO
* Improve performance of package generation without using significantly more memory.
  Maybe this can be done by switching to https://www.nodegit.org/api/libgit_2/    
  Note: this has a low priority, as for my purposes it currently is "fast enough".


## Copyright 2022 Vinai Kopp

Distributed under the terms of the 3-Clause BSD Licence.
See the [LICENSE](LICENSE) file for more details.
