#!/usr/bin/env bash

set -e

# Build Packages in /build/archives
node src/main.js /packages

# Prep satis config
[[ "${1:0:18}" == "--mirror-base-url=" ]] && {
   MIRROR_BASE_URL="${1#*=}"
 }

[[ -z "$MIRROR_BASE_URL" ]] && {
  cp satis.json /tmp/build-satis.json  
}

[[ -n "$MIRROR_BASE_URL" ]] && {
  node bin/set-satis-url-prefix.js satis.json "$MIRROR_BASE_URL" > /tmp/build-satis.json  
}

cd /satis

# Build satis into /build
/satis/bin/satis build /tmp/build-satis.json /build
