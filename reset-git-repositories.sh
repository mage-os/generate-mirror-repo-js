#!/usr/bin/env bash

cd repositories

for repo in *; do
  echo $repo
  cd $repo
  echo "git branch | grep '*' | grep -q prep-release/ && git checkout -"
  for branch in $(git branch | grep prep-release/); do
    echo "git branch -D $branch"
  done
  cd ..
done

cd ..
