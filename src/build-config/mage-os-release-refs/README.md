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
