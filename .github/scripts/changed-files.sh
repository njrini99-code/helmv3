#!/usr/bin/env bash

set -euo pipefail

base_sha="${BASE_SHA:-}"
head_sha="${HEAD_SHA:-${GITHUB_SHA:-HEAD}}"

if [ -z "$base_sha" ] || [ "$base_sha" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
  base_sha="$(git rev-parse "${head_sha}^" 2>/dev/null || true)"
fi

if [ -z "$base_sha" ]; then
  git ls-files -- "$@"
else
  git diff --name-only --diff-filter=ACMRT "$base_sha" "$head_sha" -- "$@"
fi
