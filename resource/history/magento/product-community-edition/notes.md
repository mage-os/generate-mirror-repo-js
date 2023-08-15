# Notes

This directory mostly contains the core bundled extension dependencies of the `magento/product-community-edition` packages.  

## Missing release tag 2.1.2 in magento/adobe-stock-integration 

The dependency on `"magento/adobe-stock-integration": "2.1.2-p1",` in `2.4.3.json` in upstream is a dependency on `2.1.2`.  
However the upstream repository `magento/adobe-stock-integration` does not have a `2.1.2` tag.  
In order to make `magento/product-community-edition:2.4.3` installable, the dependency has been changed to version `2.1.2-p1`.  
If the upstream repository gets the tag `2.1.2`, then the missing `magento/adobe-stock-integration:2.1.2` package can be generated and the dependency can be changed back to `2.1.2` in the `2.4.3.json` file, too.  

Reference Issue: https://github.com/magento/adobe-stock-integration/issues/1871
