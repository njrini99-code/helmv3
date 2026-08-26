#!/usr/bin/env bash
# Usage: scripts/new-worktree.sh <branch> [base]
set -euo pipefail
branch="$1"; base="${2:-origin/main}"
root="$(git rev-parse --show-toplevel)"
dir="$HOME/worktrees/helmv3-${branch//\//-}"

git fetch origin --quiet
git worktree add "$dir" -b "$branch" "$base"
ln -s "$root/node_modules" "$dir/node_modules"
mkdir -p "$dir/supabase/.temp"
cp "$root/supabase/.temp/project-ref" "$dir/supabase/.temp/" 2>/dev/null || true
echo "$dir"
