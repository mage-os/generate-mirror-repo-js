# Mage-OS Composer Repository Generator

## Background

This project was started not with the primary goal to go into production, but rather to explore and learn how to build Magento Open Source releases.  
It has evolved to be used in production. However, the intention is to create additional implementations, for example in Rust <https://github.com/mage-os/package-splitter>.  

## Generated composer repositories

The generator is used to generate the following composer repositories:

- https://mirror.mage-os.org
- https://upstream-nightly.mage-os.org
- https://repo.mage-os.org

It can also be used to generate custom mirrors and releases based on Mage-OS.

## Versions generated for mirrors

When generating a mirror composer repository, all packages required to install Magento Open Source 2.3.7-p3 and newer will be created.
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

This generates a release of the current development versions of Magento Open Source. This is known as an "upstream nightly" build.

#### `--target=mageos-nightly`

This generates a release of the current development versions of Mage-OS. This is known as a "nightly" build.

#### `--target=release`

This build target requires a number of additional arguments:
* `--mageosRelease=x.x.x` The release version, for example 1.0.0
* `--mageosVendor=mage-os` The composer vendor name for the release. Defaults to `mage-os` 
* `--upstreamRelease=2.4.6-p1` The corresponding Magento Open Source release.


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

### Manual generation

It is possible to generate the composer repositories without a container.  
This process can be useful for automation, for example the mage-os composer repositories are built in this way via GitHub actions.  

For this, you'll need nodejs 16, php8-0 (or 7.4), yarn, git and composer.

Also, the [github.com/mage-os/php-dependency-list](https://github.com/mage-os/php-dependency-list) phar executable is expected to be in the PATH.

```sh
curl -L https://github.com/mage-os/php-dependency-list/raw/main/php-classes.phar -o /usr/local/bin/php-classes.phar
chmod +x /usr/local/bin/php-classes.phar
```

Check the corresponding workflows in `.github/workflows` for details on how to run the generation.

## Generating custom releases based on Mage-OS

Currently, the manual generation approach needs to be used to create custom releases.  
Two things are required:

* Specify a custom vendor name using the `--mageosVendor=extreme-commerce` option
* Provide custom meta-package dependency templates in `resource/composer-templates/{vendor-name}/`  
  See the existing ones in `resource/composer-templates/mage-os` for examples.  
  In future it will be possible to specify the composer-templates path with a command line argument.


## Building the docker image

```bash
docker build -t magece/mirror-repo-js .
```

## Process of building a new mirror release

A new mirror release gets created when Magento releases a new version.
The process is composed of a series of steps across 3 repositories of the mage-os organization.

### 0. Preliminary check

Before starting, make sure that the new tags are merged into every `mage-os/mirror-*` repository
(eg: https://github.com/mage-os/mirror-magento2).  
In case it’s not, go to [mage-os/infrastructure](http://github.com/mage-os/infrastructure)
and run [Sync magento/ org upstream repositories into mirrors for mage-os distribution](https://github.com/mage-os/infrastructure/actions/workflows/sync-upstream-magento.yml)
action (check branch `main` when running it).

### 1. magento2-base-composer-json

- Fork and clone https://github.com/mage-os/magento2-base-composer-json,
  then create a new branch that you'll use to create a pull request. 
- Run the `add-release.sh` script for every release, eg:
  ```sh
  ./add-release.sh 2.4.7-p4
  ./add-release.sh 2.4.6-p9
  ./add-release.sh 2.4.5-p11
  ./add-release.sh 2.4.4-p12
  ```
- Add, commit and push all the newly created files.

For a practical example [check this PR](https://github.com/mage-os/magento2-base-composer-json/pull/7).

### 2. github-actions

- Fork and clone https://github.com/mage-os/github-actions,
  then create a new branch that you'll use to create a pull request.
- Update the supported versions matrix editing
  [src/versions/magento-open-source/individual.json](https://github.com/mage-os/github-actions/blob/main/supported-version/src/versions/magento-open-source/individual.json).  
  Remember that, when inserting a new version like 2.4.6-p9, you´ll have to change the _end of life_
  date of the previous version (2.4.6-p8) to _one day earlier_ of the release date of the next version.
  [Check this example commit](https://github.com/mage-os/github-actions/pull/262/files#diff-0655b3d6263a5375945b0a6bbab191703f8ee83f9535a48e2871d8afec4cb2fc)
  and this screenshot to better understand what needs to be done:  
  [TODO INSERT IMAGE FROM GITHUB]
- Check if `magento-open-source/composite.json` needs updating
  (it only happens when a new "non patch" release is published, like 2.4.8).
- Now "build" the project with
  - In the root of the project: `npm install`
  - In the supported-version folder: `npm run build
- Edit `src/kind/get-currently-supported.spec.ts`
- Run `npm run test` and make sure that all tests are green.
- Commit, push and open a PR on mage-os/github-actions.

For a practical example [check this PR](https://github.com/mage-os/github-actions/pull/262).

### 3. generate-mirror-repo-js

- Fork and clone https://github.com/mage-os/generate-mirror-repo-js,
  then create a new branch that you'll use to create a pull request.
- Install latest magento version with  
  `composer create-project --repository-url=https://repo.magento.com/ magento/project-community-edition`
- "Build" the mirror with  
  `rm -rf repositories; node src/make/mirror.js --outputDir=build`
- Download all missing packages with  
  `./bin/download-missing-packages-from-repo-magento-com.php project-community-edition/composer.lock build resource/additional-packages`
- Commit and push the new files in `resource/additional-packages`.
- Copy all the `composer.json` files for all releases with something like
  ```sh
  cp ../mageos-magento2-base-composer-json/2.4.7-p4/magento2-base/composer.json resource/history/magento/magento2-base/2.4.7-p4.json
  cp ../mageos-magento2-base-composer-json/2.4.7-p4/product-community-edition/composer.json resource/history/magento/product-community-edition/2.4.7-p4.json
  cp ../mageos-magento2-base-composer-json/2.4.7-p4/project-community-edition/composer.json resource/history/magento/project-community-edition/2.4.7-p4.json
  ```
- Commit and push all the `composer.json` files.

When creating the PR on `generate-mirror-repo-js`, in order for all the checks to run,
the PR will have to be merged on a development branch.
Then go to the _actions_ for this repo:  and run the
[build, deploy & check mirror](https://github.com/mage-os/generate-mirror-repo-js/actions/workflows/build-upstream-mirror.yml)
selecting the new dev branch and the rest of the parameters as shown in this image:  
[TODO INSERT IMAGE FROM GITHUB]

For a practical example [check this PR](https://github.com/mage-os/generate-mirror-repo-js/pull/191)
and [this second one to merge the temporary dev branch into `main`](https://github.com/mage-os/generate-mirror-repo-js/pull/194).

## Copyright 2022 Vinai Kopp, Mage-OS

Distributed under the terms of the 3-Clause BSD Licence.
See the [LICENSE](LICENSE) file for more details.
