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
  # BASE..HEAD is a two-dot TREE diff, but consumers scan the PR's *merge-ref
  # checkout*. A branch that lags main's deletions therefore gets paths listed
  # (present on the branch, deleted on main) that don't exist on disk — and
  # scanners like semgrep hard-fail on nonexistent roots ("Invalid scanning
  # root"). Keep only paths present in the checkout.
  git diff --name-only --diff-filter=ACMRT "$base_sha" "$head_sha" -- "$@" \
    | while IFS= read -r f; do
        if [ -e "$f" ]; then printf '%s\n' "$f"; fi
      done
fi
