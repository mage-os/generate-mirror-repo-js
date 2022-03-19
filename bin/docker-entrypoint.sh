#!/usr/bin/env bash

set -e

# Mage-OS package repository mirror URL
[[ "${1:0:18}" == "--mirror-base-url=" ]] && {
   MIRROR_BASE_URL="${1#*=}"
}

# Build Packages in /build/packages
node src/main.js --outputDir=/build/packages --gitRepoDir=/generate-repo/repositories --mirrorUrl="$MIRROR_BASE_URL"

echo Running satis...

cd /satis

# Set the repository homepage for the satis build config
[[ -n "$MIRROR_BASE_URL" ]] && {
  node /generate-repo/bin/set-satis-homepage-url.js --satisConfig=/generate-repo/satis.json --mirrorUrl="$MIRROR_BASE_URL" > /tmp/satis.json   
}

[[ -z "$MIRROR_BASE_URL" ]] && {
  cp /generate-repo/satis.json /tmp/satis.json   
}


# Build satis into /build
/satis/bin/satis build /tmp/satis.json /build

echo Setting url prefix in generated output to $MIRROR_BASE_URL...

# Fix host prefix in generated output
[[ -n "$MIRROR_BASE_URL" ]] && {
  node /generate-repo/bin/set-satis-output-url-prefix.js --satisOutputDir=/build --mirrorUrl="$MIRROR_BASE_URL"  
}