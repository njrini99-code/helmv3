#!/usr/bin/env bash
# scripts/retire-worktrees.sh — SHIM. The lifecycle authority is now
# scripts/worktree-lifecycle.mjs.
#
# WHY THIS IS A SHIM AND NOT A SECOND IMPLEMENTATION
#
# This script's model conflated two objects: removing a worktree meant
# abandoning its branch, so a checkout could only be removed once its PR
# merged. An open PR waiting on a human therefore held ~3.8 GiB indefinitely —
# #1659 did exactly that. The replacement separates them:
#
#   PARK    remove the disposable checkout, KEEP the branch  (no PR needed)
#   RETIRE  park, AND delete a branch proven merged by exact PR head OID
#
# Two implementations of a rule that deletes things is how they drift. This
# file stays because AGENTS.md, the shipping rules and muscle memory all name
# it; it forwards and says so.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

ARGS=()
for a in "$@"; do
  case "$a" in
    --remove) ARGS+=(--retire) ;;   # old flag meant "act"; acting now includes branch GC
    *) ARGS+=("$a") ;;
  esac
done

echo "note: retire-worktrees.sh now forwards to scripts/worktree-lifecycle.mjs" >&2
echo "      (--remove -> --retire; --park removes a checkout without touching its branch)" >&2
exec node "$HERE/worktree-lifecycle.mjs" "${ARGS[@]}"
