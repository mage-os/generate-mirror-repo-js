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

### docker

For example, to generate the repository in `~/html`, run the following command, replacing `https://mirror.mage-os.org` with the URL of your mirror:

```bash
docker run --rm --init -it --user $(id -u):$(id -g) \
  --volume "$(pwd)/html:/build" \
  --volume "${COMPOSER_HOME:-$HOME/.composer}:/composer" \
  magece/mirror-repo-js:latest --mirror-base-url=https://mirror.mage-os.org
```

### podman

If you prefer to execute the container with `podman`, you should not specify the `--user` argument, as the in-container root user will automatically map to the current system.
To generate the repository in `~/html` using podman, run the following command, replacing `https://mirror.mage-os.org` with the URL of your mirror:

```bash
podman run --rm --init -it \
  --volume "$(pwd)/html:/build:z"  \
  --volume "${COMPOSER_HOME:-$HOME/.composer}:/composer:z" \
  magece/mirror-repo-js:latest --mirror-base-url=https://mirror.mage-os.org
```

## Building

```bash
docker build -t magece/mirror-repo-js .
```

## TODO
* Set stableMtime in src/package-modules.js:9
* Make command line parsing of --mirror-base-url more robust
* Improve performance of package generation, maybe by switching to https://www.nodegit.org/api/libgit_2/


## Copyright 2022 Vinai Kopp

Distributed under the terms of the 3-Clause BSD Licence.
See the [LICENSE](LICENSE) file for more details.