# Mage-OS Mirror Repository Generator - JS Edition

Experimental JavaScript implementation.  
This is not intended to go into production, but rather it is for learning purposes.

## Usage

Mount the directory to contain the generated files into `/build` while executing the container image.

A local cache directory can be mounted at `/repo-generator/repositories` in order to persist the cloned github repos.  
Be aware that in existing git repositories currently will not be updated on subsequent runs. This is mainly useful during development when executing the container image multipe times conseqtively.

### docker

```bash
docker run --rm --init -it --user $(id -u):$(id -g) \
  --volume $(pwd)/html:/build \
  --volume "${COMPOSER_HOME:-$HOME/.composer}:/composer" \
  magece/mirror-repo-js:latest \
  --mirror-base-url=https://repo.mage-os.org
```

### podman

```bash
podman run --rm --init -it --volume $(pwd)/packages:/packages:z \
  --volume /var/www/html:/build:z  \
  --volume "${COMPOSER_HOME:-$HOME/.composer}:/composer:z" \
  magece/mirror-repo-js:latest \
  --mirror-base-url=https://repo.mage-os.org
```

## Building

```bash
docker build -t magece/mirror-repo-js .
```

## TODO
* Generate magento/security-metapackage
* Generate magento/inventory-composer-metapackage
* Make command line parsing of --mirror-base-url more robust
* improve performance of package generation, maybe by switching to https://www.nodegit.org/api/libgit_2/


## Copyright 2022 Vinai Kopp

Distributed under the terms of the 3-Clause BSD Licence.
See the [LICENSE](LICENSE) file for more details.