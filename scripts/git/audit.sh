#!/usr/bin/env bash
set -euo pipefail

default_branch="${1:-}"
if [ -z "$default_branch" ]; then
  default_branch="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
fi
if [ -z "$default_branch" ]; then
  default_branch="main"
fi

if git show-ref --verify --quiet "refs/heads/$default_branch"; then
  baseline_ref="$default_branch"
elif git show-ref --verify --quiet "refs/remotes/origin/$default_branch"; then
  baseline_ref="origin/$default_branch"
else
  baseline_ref="HEAD"
fi

echo "## Git Status"
git status --short --branch

echo
echo "## Baseline Ref"
echo "$baseline_ref"

echo
echo "## Local Branches"
git branch -vv

echo
echo "## Merged Non-Baseline Branches"
git branch --merged "$baseline_ref" | sed 's/^[* ]*//' | grep -v "^$default_branch$" || true

echo
echo "## Non-Merged Branches"
git branch --no-merged "$baseline_ref" || true

echo
echo "## Remote Prune Dry Run"
git remote prune origin --dry-run || true

echo
echo "## Stashes"
git stash list || true

echo
echo "## Untracked Non-Ignored Dry Run"
git clean -nd

echo
echo "## Ignored Cleanup Dry Run Count"
git clean -Xdn | wc -l | tr -d ' '

echo
echo "## Object Count"
git count-objects -vH

echo
echo "## Commit Graph Verify"
git commit-graph verify || true

echo
echo "## Full Fsck Summary"
tmp="$(mktemp)"
if git fsck --full >"$tmp" 2>&1; then
  echo "git fsck --full: ok"
else
  status=$?
  echo "git fsck --full: exited $status"
  awk '
    /failed to parse commit/ { failed++ }
    /dangling commit/ { dangling_commit++ }
    /dangling tree/ { dangling_tree++ }
    /dangling blob/ { dangling_blob++ }
    END {
      printf "failed to parse commit: %d\n", failed + 0
      printf "dangling commit: %d\n", dangling_commit + 0
      printf "dangling tree: %d\n", dangling_tree + 0
      printf "dangling blob: %d\n", dangling_blob + 0
    }
  ' "$tmp"
fi
rm -f "$tmp"
