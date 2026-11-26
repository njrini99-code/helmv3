#!/bin/sh
# sync-main: fast-forward the canonical checkout's `main` to origin/main.
#
# Called by post-checkout and pre-push, so local `main` catches up whenever
# anyone switches, creates a worktree or pushes, not only after `npm run
# pr:land` (which already syncs after its own merges). A merge made in the
# GitHub UI, by another session or by the health routine is picked up the
# next time any work happens.
#
# Safe by construction:
# - fast-forward only: it never merges, rebases, resets or discards anything;
# - canonical on `main` with tracked changes: skipped (untracked files are
#   fine, and `merge --ff-only` itself refuses to overwrite one);
# - canonical on another branch: only the local `main` ref moves, and only
#   when that is a fast-forward (`fetch origin main:main`);
# - runs in the background and never fails or slows the calling hook.
# HELM_NO_MAIN_SYNC=1 turns it off; HELM_MAIN_SYNC_FOREGROUND=1 runs it inline
# (tests use this).

[ "${HELM_NO_MAIN_SYNC:-}" = "1" ] && exit 0

run() {
  canon="$(git worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p')"
  [ -n "$canon" ] && [ -d "$canon" ] || return 0
  git -C "$canon" remote get-url origin >/dev/null 2>&1 || return 0
  branch="$(git -C "$canon" rev-parse --abbrev-ref HEAD 2>/dev/null)" || return 0
  if [ "$branch" = "main" ]; then
    git -C "$canon" fetch --quiet origin main 2>/dev/null || return 0
    [ -z "$(git -C "$canon" status --porcelain --untracked-files=no 2>/dev/null)" ] || return 0
    git -C "$canon" merge --quiet --ff-only FETCH_HEAD 2>/dev/null || return 0
  else
    git -C "$canon" fetch --quiet origin main:main 2>/dev/null || return 0
  fi
}

if [ "${HELM_MAIN_SYNC_FOREGROUND:-}" = "1" ]; then
  run
else
  (run) </dev/null >/dev/null 2>&1 &
fi
exit 0
