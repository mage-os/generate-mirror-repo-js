#!/usr/bin/env bash

set -e

# Build Packages in /build/packages
node src/main.js /build/packages /generate-repo/repositories

echo Running satis...

# Prep satis config
[[ "${1:0:18}" == "--mirror-base-url=" ]] && {
   MIRROR_BASE_URL="${1#*=}"
 }

cd /satis

# Build satis into /build
/satis/bin/satis build /generate-repo/satis.json /build

echo Setting url prefix in generated output to $MIRROR_BASE_URL...

[[ -n "$MIRROR_BASE_URL" ]] && {
  node /generate-repo/bin/set-satis-url-prefix.js /build "$MIRROR_BASE_URL"  
}