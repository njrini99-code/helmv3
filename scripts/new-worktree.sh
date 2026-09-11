#!/usr/bin/env bash
# scripts/new-worktree.sh — the CLI front door onto scripts/lib/create-workspace.mjs.
#
# This script USED TO BE the whole mechanism. As of the "one workspace door"
# change (2026-09-05) it only parses flags and hands them to the shared
# module — the same module the WorktreeCreate hook
# (.claude/hooks/worktree-create.mjs) calls for `--worktree` /
# isolation:"worktree" / background sessions. One module means the budget
# check, the disk reserve, --no-track, and the .helm/workspace.json marker
# cannot drift between "a human typed this command" and "the harness created
# a worktree on its own." See docs/operations/WORKSPACES.md for the full
# picture and `git log -p -- scripts/new-worktree.sh` for the history of what
# this file used to do and why each past mistake (upstream tracking onto
# origin/main and dependency versions drifting between tasks) shaped the module it now
# delegates to.
#
# Usage:
#   scripts/new-worktree.sh <task-name> [--base <ref>] [--install] [--keep]
#   scripts/new-worktree.sh <task-name> --reattach [--install] [--keep]
#
# --reattach checks out an EXISTING agent/<task-name> branch instead of
# creating one. It is the inverse of `npm run worktrees:park`, which removes a
# checkout and keeps the branch: without it a parked branch could only be
# recovered with a raw `git worktree add`, which guard-git refuses, so "the
# branch is kept" was true and useless. --base is ignored when reattaching —
# the branch already has its history.
#
# --keep stamps .helm/workspace.json's parkPolicy as KEEP instead of the
# default PARK_IF_REPRODUCIBLE. Every worktree this door makes lives on an
# agent/<task> branch, and as of 2026-09-06 the default is
# PARK_IF_REPRODUCIBLE precisely so cleanup is cheap enough it always
# happens; pass --keep for a worktree that should sit around regardless.
# Either way, scripts/worktree-lifecycle.mjs's own dirty/unpushed/live-
# process/open-PR refusals remain the actual safety net — parkPolicy only
# says a checkout MAY be asked, never that removing it is safe.
#
# Example:
#   scripts/new-worktree.sh postgrest-error-detail
#     -> ~/worktrees/helmv3/postgrest-error-detail
#     -> branch agent/postgrest-error-detail, no upstream, based on origin/main
set -euo pipefail

BASE="origin/main"
INSTALL=0
KEEP=0
REATTACH=0
TASK=""

while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --install) INSTALL=1; shift ;;
    --no-install) INSTALL=0; shift ;;   # accepted, and still the default
    --keep) KEEP=1; shift ;;
    --reattach) REATTACH=1; shift ;;
    -h|--help) sed -n '18,38p' "$0"; exit 0 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) TASK="$1"; shift ;;
  esac
done

if [ -z "$TASK" ]; then
  echo "usage: scripts/new-worktree.sh <task-name> [--base <ref>] [--install]" >&2
  exit 2
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"

ARGS=(--name "$TASK" --base "$BASE" --repo "$REPO" --summary)
if [ "$INSTALL" -eq 1 ]; then
  ARGS+=(--install)
fi
if [ "$KEEP" -eq 1 ]; then
  ARGS+=(--keep)
fi
if [ "$REATTACH" -eq 1 ]; then
  ARGS+=(--reattach)
fi

# HELM_WORKTREE_HOME, HELM_MAX_MUTATION_WORKTREES, HELM_DISK_RESERVE_GIB (or
# the legacy HELM_MIN_FREE_GIB) are read by create-workspace.mjs itself from
# the inherited environment — nothing here needs to pass them explicitly.
#
# Only stdout is a summary block ending in the workspace path (for callers
# like replay/runners/run.mjs that take the last stdout line); every warning,
# fetch failure, or refusal reason create-workspace.mjs prints goes to stderr,
# so it shows up live here without polluting that convention.
# Workspace tooling is shared even when the source branch is older.
COMMON_DIR="$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)"
exec node "$(dirname "$COMMON_DIR")/scripts/lib/create-workspace.mjs" "${ARGS[@]}"
