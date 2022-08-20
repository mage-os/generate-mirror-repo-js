# Additional Packages

## Purpose

The packages in this directory are not available through packagist.org (they are only available through repo.magento.com).

Because these third party bundled extensions are not included in Magento releases since 2.4.4, they are part of
this repository so older releases can be provided through the mirror package repository.  
Future releases will not contain these packages.

## Background

The extensions are hosted in public GitHub repos. At one point in time Magento added them as a dependency.
At that time the original git repositories where forked by Magento/Adobe into non-public repositories.  
Magento core did not upgrade the dependencies with upstream, but instead provide their own patched versions.

## Why are some `magento/` packages in here?

These files are present because there is no commit in the upstream repo that contains the code upstream released.
Sometimes there even is no tagged release, see for example issue: https://github.com/magento/adobe-ims/issues/15

### magento-module-adobe-stock-*-1.3.1-alpha1.zip
These packages are actually 1.3.1 packages, according to the composer.json files.
However, the upstream packages also use the `-1.3.1-alpha1` name suffix.  
There are no tagged releases in the upstream repository, so we add them here as additional packages.
