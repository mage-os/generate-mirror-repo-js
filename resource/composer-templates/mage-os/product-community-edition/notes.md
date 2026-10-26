# Notes

## dependencies-template.json

This file contains the core bundled extension dependencies of the latest upstream `mage-os/product-community-edition` release.  
It is used for the dependencies of the release `mage-os/product-community-edition` build.

### Pinned dependencies

- `elgentos/magento2-varnish-extended` is pinned to `2.0.7`. Version 2.1.0 registers a `varnish:test:fixtures`
  CLI command whose constructor eagerly builds the customer repository, which queries `eav_entity_type` while
  `setup:install` is still creating the schema, so fresh installs fail. Restore the repository URL once a fixed
  release is available.
