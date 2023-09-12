# Notes

This directory mostly contains the dependencies for the project packages.  

## 2.4.0-gitignore

The 2.4.0 and 2.4.0-p1 releases have a `.gitignore` file within the `magento/project-community-edition` package.  
The contents of the file are identical for both releases.
That `.gitignore` file is different from the one in the tagged releases, so we add it to this directory, so it can be
included as a special case when the base-package for those two releases is built.
(See `createMagentoCommunityEditionProject` in `package-modules.js`).
