# Notes

This directory contains the `composer.json` files of past upstream `magento/magento2-base` packages.  
Since the dependencies can't be calculated based on the repository contents, we simply include the original files.  

In order to get the original `composer.json` files install the specific version, eg:
`php /opt/homebrew/bin/composer create-project --repository-url=https://repo.magento.com/ magento/project-community-edition=2.4.6-p9`, then take from from `vendor/magento/magento2-base/composer.json`.