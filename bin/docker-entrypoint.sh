#!/usr/bin/env bash

set -e

## Deprecated Mage-OS package repository mirror URL legacy argument name
## for backward compatibility:  --mirror-base-url
## Instead, use the new option: --repo-base-url

self="$0"

show_help () {
  cat >&2 << EOF
  Generate Mage-OS composer package repository

  Usage:
    $self --target={build targets, comma seperated}  Mage-OS composer repository type to build (default: mirror)
          --repo-base-url=[https://repo.mage-os.org] The package repo base URL

          --mageosRelease=[1.0.0] The release version (only for build target "release")
          --mageosVendor=[mage-os] The release composer vendor name (only for build target "release")
          --upstreamRelease=[2.4.6-p1] The corresponding Magento Open Source release (only for build target "release")

  Possible target(s)
     mirror            Build Magento Open Source mirror repository
     upstream-nightly  Build release based on the current Magento Open Source development branch
     mageos-nightly    Build release based on the current Mage-OS development branch
     release           Build Mage-OS release

EOF
  exit 1
}


# Default build target
TARGET=mirror
VENDOR=mage-os

while [[ $# -gt 0 ]]; do
  case $1 in
      --mirror-base-url=*|--repo-base-url=*)
      REPO_BASE_URL="${1#*=}"
      shift # argument + value

      ;;
      --target=*)
      TARGET="${1#*=}"
      shift # argument + value

      ;;
      --mageosRelease=*)
      RELEASE="${1#*=}"
      shift # argument + value

      ;;
      --mageosVendor=*)
      VENDOR="${1#*=}"
      shift # argument + value

      ;;
      --upstreamRelease=*)
      UPSTREAM_RELEASE="${1#*=}"
      shift # argument + value

      ;;
      --help|-h|help)
      show_help
      shift

      ;;
      *)
      echo "Unknown command option: \"$1\"" >&2
      show_help
      shift

      ;;
  esac
done

# Make composer discoverable
PATH="$PATH:/satis/vendor/bin"
OUT_DIR="/build/packages"
GIT_REPO_DIR="/generate-repo/repositories"

# Build Packages in /build/packages
echo "$TARGET" | grep -q "mirror" && {
  node src/make/mirror.js --outputDir="$OUT_DIR" --gitRepoDir="$GIT_REPO_DIR" --repoUrl="$REPO_BASE_URL"
}

echo "$TARGET" | grep -q "upstream-nightly" && {
  node src/make/upstream-nightly.js --outputDir="$OUT_DIR" --gitRepoDir="$GIT_REPO_DIR" --repoUrl="$REPO_BASE_URL"
}

echo "$TARGET" | grep -q "mageos-nightly" && {
  node src/make/mageos-nightly.js --outputDir="$OUT_DIR" --gitRepoDir="$GIT_REPO_DIR" --repoUrl="$REPO_BASE_URL"
}

echo "$TARGET" | grep -q "release" && {
  node src/make/mageos-release.js --outputDir="$OUT_DIR" --gitRepoDir="$GIT_REPO_DIR" --repoUrl="$REPO_BASE_URL" \
    --mageosRelease="$RELEASE"  --mageosVendor="$VENDOR" --upstreamRelease="$UPSTREAM_RELEASE"
}

echo Running satis...

cd /satis

# Set the repository homepage for the satis build config
[[ -n "$REPO_BASE_URL" ]] && {
  node /generate-repo/bin/set-satis-homepage-url.js --satisConfig=/generate-repo/satis.json --repoUrl="$REPO_BASE_URL" > /tmp/satis.json
}

[[ -z "$REPO_BASE_URL" ]] && {
  cp /generate-repo/satis.json /tmp/satis.json
}

# Add generator version number to Satis HTML
cp /generate-repo/mageos.html.twig ./views/mageos.html.twig

GENERATOR_VERSION=$(jq -r .version /generate-repo/package.json)

printf "%s" "$GENERATOR_VERSION" > ./views/version

# Build satis into /build
/satis/bin/satis build /tmp/satis.json /build

echo Setting url prefix in generated output to $REPO_BASE_URL...

# Fix host prefix in generated output
[[ -n "$REPO_BASE_URL" ]] && {
  node /generate-repo/bin/set-satis-output-url-prefix.js --satisOutputDir=/build --repoUrl="$REPO_BASE_URL"
}
