#!/usr/bin/env bash
# .claude/hooks/lib/active-root.sh — shell counterpart of
# .claude/hooks/lib/workspace-identity.mjs
#
# Source this, then call helm_active_root.
#
# The shell hooks used to open with:
#     cd "${CLAUDE_PROJECT_DIR:-.}"
# which walks AWAY from the worktree the session is actually in.
# CLAUDE_PROJECT_DIR is the ORIGINAL project directory and does not move.
# Every hook that cd'd there reported the canonical checkout's branch, dirty
# state and ahead/behind while the agent edited somewhere else.
#
# Order here matches the JS module exactly: the hook's own cwd first, the env
# var last. Keep the two in step — two resolvers is how they drift.

# Echoes the git top-level of the ACTIVE workspace.
# Falls back to CLAUDE_PROJECT_DIR, then to the current directory, so this can
# never leave a caller with an empty path.
helm_active_root() {
  local root
  # 1. the directory the hook was actually invoked in
  root=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$root" ] && {
    printf '%s\n' "$root"
    return 0
  }
  # 2. the original project directory, resolved to ITS top-level
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    root=$(cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null) && \
      [ -n "$root" ] && {
        printf '%s\n' "$root"
        return 0
      }
    printf '%s\n' "$CLAUDE_PROJECT_DIR"
    return 0
  fi
  # 3. last resort
  pwd -P
}

# Echoes the canonical (main) checkout for the repo containing the active
# root. --git-common-dir points at the SHARED .git from any linked worktree.
helm_canonical_root() {
  local common abs
  common=$(git rev-parse --git-common-dir 2>/dev/null) || { helm_active_root; return; }
  [ -n "$common" ] || { helm_active_root; return; }
  case "$common" in
    /*) abs="$common" ;;
    *)  abs="$(pwd -P)/$common" ;;
  esac
  (cd "$(dirname "$abs")" 2>/dev/null && pwd -P) || helm_active_root
}
