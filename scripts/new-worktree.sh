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
INSTALL=0
TASK=""

while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --install) INSTALL=1; shift ;;
    --no-install) INSTALL=0; shift ;;   # accepted, and now the default
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) TASK="$1"; shift ;;
  esac
done

if [ -z "$TASK" ]; then
  echo "usage: scripts/new-worktree.sh <task-name> [--base <ref>] [--install]" >&2
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

# ---------------------------------------------------------------------------
# Free-space precheck.
#
# 2026-08-29: this script started a multi-GiB `npm ci` with the volume already
# at 99%, died on ENOSPC partway through, and left an 858 MiB partial tree
# behind. The failure COST space instead of refusing to spend it — and it then
# blocked the session completely, because at zero bytes free even writing a
# command's output fails, so nothing could clean up.
#
# Measured the same day on this machine: a worktree with node_modules is
# 3.8 GiB, and a built one adds up to 5.7 GiB of .next on top. The floor is set
# so a worktree can be created AND used, not merely created.
WORKTREE_MIN_FREE_GIB="${HELM_MIN_FREE_GIB:-${HELM_DISK_RESERVE_GIB:-12}}"

free_gib() {
  # -P for POSIX output (one line per fs, no wrapping), -k for 1K blocks.
  # Field 4 is available. Integer GiB, floored — deliberately pessimistic.
  df -Pk "$1" 2>/dev/null | awk 'NR==2 {printf "%d", $4/1048576}'
}

AVAIL_GIB="$(free_gib "$WORKTREE_HOME")"
if [ -n "$AVAIL_GIB" ] && [ "$AVAIL_GIB" -lt "$WORKTREE_MIN_FREE_GIB" ]; then
  echo "refusing: ${AVAIL_GIB} GiB free under ${WORKTREE_HOME}, reserve is ${WORKTREE_MIN_FREE_GIB} GiB." >&2
  echo >&2
  echo "This is the MACHINE reserve, not an install estimate. At zero bytes free" >&2
  echo "nothing runs at all — writing a command's output fails, so no command can" >&2
  echo "be issued to clean up. Measured 2026-08-29." >&2
  echo >&2
  echo "Reclaim. Parking removes a checkout WITHOUT abandoning its branch:" >&2
  echo >&2
  echo "  node scripts/worktree-lifecycle.mjs           # report" >&2
  echo "  node scripts/worktree-lifecycle.mjs --park    # remove disposable checkouts" >&2
  echo "  node scripts/worktree-lifecycle.mjs --retire  # also delete proven-merged branches" >&2
  echo >&2
  echo "Override: HELM_DISK_RESERVE_GIB=<n>." >&2
  exit 1
fi

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

# DEPENDENCIES ARE NO LONGER INSTALLED BY DEFAULT.
#
# A checkout cost ~3.8 GiB of node_modules whether or not the task needed it,
# and most control-plane, docs and config work never runs a single test. Coupling
# the two is what made every task, however small, a multi-GiB commitment — and it
# is why six worktrees in one day took the volume to zero bytes free.
#
# Install when a command actually requires it:
#
#   node scripts/ensure-worktree-deps.mjs <dir>
#
# which applies the reserve + budget policy rather than starting and hoping.
if [ "$INSTALL" -eq 1 ]; then
  node "$(dirname "${BASH_SOURCE[0]}")/ensure-worktree-deps.mjs" "$DIR" || {
    echo "dependency install refused or failed — the worktree itself is intact." >&2
    echo "Re-run: node scripts/ensure-worktree-deps.mjs $DIR" >&2
  }
fi

cat <<EOF

  workspace   $DIR
  branch      $BRANCH   (no upstream — first push must be:
                         git push -u origin $BRANCH)
  base        $BASE
  env         local, no production writes
  deps        $([ "$INSTALL" -eq 1 ] && echo "isolated" || echo "not installed — run: node scripts/ensure-worktree-deps.mjs $DIR")

EOF
printf '%s\n' "$DIR"
