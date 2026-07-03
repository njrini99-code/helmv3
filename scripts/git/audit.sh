#!/usr/bin/env bash
set -euo pipefail

echo "## Git Status"
git status --short --branch

echo
echo "## Local Branches"
git branch -vv

echo
echo "## Merged Non-Main Branches"
git branch --merged main | sed 's/^[* ]*//' | grep -v '^main$' || true

echo
echo "## Non-Merged Branches"
git branch --no-merged main || true

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
