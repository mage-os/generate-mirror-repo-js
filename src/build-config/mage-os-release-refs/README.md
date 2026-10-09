# Release refs

Optional per-release overrides of the git ref each repository is built from.

`src/make/mageos-release.js` looks for `<vendor>-release-refs/<version>.js` in
this directory (or an explicit `--releaseRefsFile=`). When the file is absent —
the normal case — every repository is built from the ref in
`mageos-release-build-config.js`, which is the default branch.

A file here exports a map of build-config keys to git refs. A release tags
every repository, so every repository needs a ref. The `*` key applies to all
of them; set it to the outgoing line's last tag, and name a branch only for the
repositories that received patches:

```js
// src/build-config/mage-os-release-refs/3.6.1.js
module.exports = {
  '*': '3.6.0',
  'magento2': 'release/3.x',
};
```

Repositories and metapackages whose `fromTag` is later than the release are
left out, so a release on an older line does not pick up what only exists from
a later major on.

This exists so a release can be built from a line other than the default
branch — for example a patch release on the previous major while `main` has
already moved on.

## Pinning dependencies that are not built here

The metapackages also require packages this repository does not build — add-ons
and third-party modules listed in
`resource/composer-templates/mage-os/product-community-edition/dependencies-template.json`.
A new release resolves each of those to the **latest tag** in its own
repository.

That is right for the current line and wrong for an older one: an add-on
released for the newer major can land in a release of the older line. Name the
versions to use with `pins`, alongside `refs`:

```js
// src/build-config/mage-os-release-refs/3.4.1.js
module.exports = {
  refs: {'*': '3.4.0', 'magento2': 'release/3.x'},
  pins: {'elgentos/magento2-varnish-extended': '2.0.6'},
};
```

When `'*'` names the line's last release, the dependencies are that release's,
read from `resource/history/mage-os/product-community-edition/<'*'>.json`, so
a patch release ships the same set at the same versions. Pins are the changes:
a version overrides, a new name adds, and `false` removes:

```js
pins: {
  'aligent/magento2-pci-4-compatibility': '1.4.2', // bump
  'elgentos/magento2-varnish-extended': '2.0.6',   // add
  'swissup/module-ignition': false,                // remove
},
```

The build logs template dependencies left out because the line never shipped
them. A `'*'` with no history file stops the build.
