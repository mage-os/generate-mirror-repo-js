# Notes

## template.json

This is the `composer.json` file of the latest upstream release. It is used as a template for both releases and the nightly `mage-os/magento2-base` package build.
However, the composer dependencies are calculated based on the PHP classes contained within the base package, rather than being simply copied from a past release.
