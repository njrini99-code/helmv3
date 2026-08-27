#!/usr/bin/env bash
# scripts/new-worktree.sh — the ONE supported way to create an agent workspace.
#
# Usage:
#   scripts/new-worktree.sh <task-name> [--base <ref>] [--no-install]
#
# Example:
#   scripts/new-worktree.sh postgrest-error-detail
#     -> ~/worktrees/helmv3/postgrest-error-detail
#     -> branch agent/postgrest-error-detail, no upstream, based on origin/main
#
# WHAT THIS REPLACED, and why each change matters. The previous version was
# four lines and every one of them created a problem this repo then hit:
#
#   git worktree add "$dir" -b "$branch" "$base"
#       Creating a branch FROM origin/main sets its upstream TO origin/main, so
#       a bare `git push` from the task branch targets MAIN. Observed live on
#       docs/consolidation-2026-08-27, which carried 23 commits and would have
#       pushed every one of them to the trunk. Now --no-track: a task branch
#       starts with NO upstream and earns one on its first deliberate
#       `git push -u origin <same-name>`.
#
#   ln -s "$root/node_modules" "$dir/node_modules"
#       Source isolated, dependencies shared. Two branches with different
#       lockfiles then test against whichever tree was installed last, which
#       manufactures both fake failures and fake passes. Now a real install per
#       worktree; the npm DOWNLOAD cache is still shared, so this costs time,
#       not bandwidth.
#
#   cp "$root/supabase/.temp/project-ref" ...
#       Copied the PRODUCTION project link into every new task workspace, while
#       .worktreeinclude deliberately withheld the env files — leaving a
#       workspace linked to production but unable to talk to it, which is the
#       worst of both. Now: not copied. A task workspace is local by default and
#       production is opt-in.
#
# Worktrees live OUTSIDE the repo. A worktree inside it is hidden from git by
# .gitignore but NOT from find/grep/ls, so agents edit a duplicate tree nobody
# ships. Measured once at 4,314 .ts/.tsx files shadowing src/'s 3,884.
set -euo pipefail

WORKTREE_HOME="${HELM_WORKTREE_HOME:-$HOME/worktrees/helmv3}"
BASE="origin/main"
INSTALL=1
TASK=""

while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --no-install) INSTALL=0; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) TASK="$1"; shift ;;
  esac
done

if [ -z "$TASK" ]; then
  echo "usage: scripts/new-worktree.sh <task-name> [--base <ref>] [--no-install]" >&2
  exit 2
fi

# Normalise: the task name is the directory name AND the branch suffix, so it
# must survive both. Slashes would nest directories unexpectedly.
TASK="${TASK//\//-}"
BRANCH="agent/${TASK}"
DIR="${WORKTREE_HOME}/${TASK}"

if [ -e "$DIR" ]; then
  echo "refusing: $DIR already exists" >&2
  exit 1
fi
if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "refusing: branch ${BRANCH} already exists" >&2
  exit 1
fi

mkdir -p "$WORKTREE_HOME"

echo "fetching origin..."
git fetch origin --quiet

# --no-track is the load-bearing flag. Without it the new branch inherits
# origin/main as its upstream.
git worktree add --no-track "$DIR" -b "$BRANCH" "$BASE"

# Declared identity. Not secrets — just what this workspace is allowed to be,
# so repo:doctor can compare the declaration against reality instead of
# guessing.
mkdir -p "$DIR/.helm"
cat > "$DIR/.helm/workspace.json" <<JSON
{
  "kind": "task",
  "task": "${TASK}",
  "branch": "${BRANCH}",
  "base": "${BASE}",
  "environment": "local",
  "supabase": "local",
  "productionWrites": false
}
JSON

if [ "$INSTALL" -eq 1 ]; then
  echo "installing dependencies (isolated)..."
  ( cd "$DIR" && npm ci --silent ) || {
    echo "npm ci failed — the worktree exists but has no node_modules." >&2
    echo "Run 'npm ci' in $DIR before trusting any test result there." >&2
  }
else
  echo "skipped install (--no-install): tests in this worktree will not run yet"
fi

cat <<EOF

  workspace   $DIR
  branch      $BRANCH   (no upstream — first push must be:
                         git push -u origin $BRANCH)
  base        $BASE
  env         local, no production writes
  deps        $([ "$INSTALL" -eq 1 ] && echo isolated || echo "NOT INSTALLED")

EOF
printf '%s\n' "$DIR"
