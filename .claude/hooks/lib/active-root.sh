#!/usr/bin/env bash
# .claude/hooks/lib/active-root.sh — THIN ADAPTER. Contains no policy.
#
# Source this, then call helm_active_root / helm_canonical_root.
#
# WHAT THIS FILE MUST NOT BECOME
#
# It used to implement its own resolution rules — its own candidate
# precedence, its own `--show-toplevel` call, its own `--git-common-dir`
# handling. That made two implementations of one question in two languages,
# kept in step by hand. They had already drifted: this file preferred the
# shell's cwd unconditionally while the JS module ordered candidates
# explicitly, so a hook sourcing this and a hook importing that could disagree
# about which checkout they were in.
#
# The rules now live in exactly one place:
#
#     .claude/hooks/lib/workspace-identity.mjs
#
# This file's whole job is to call it and hand back the string. If you find
# yourself adding an `if` here that decides ANYTHING about which directory is
# right, you are rebuilding the thing that was removed — put it in the module.

_HELM_WSID="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/workspace-identity.mjs"

# Echo the git top-level of the ACTIVE workspace.
helm_active_root() {
  local out
  if out=$(node "$_HELM_WSID" --active-root 2>/dev/null) && [ -n "$out" ]; then
    printf '%s\n' "$out"
    return 0
  fi
  # Node unavailable or the module failed. Fall back to the current directory
  # rather than to a rule — a rule here is the duplication this file exists to
  # avoid, and a wrong-but-plausible root is worse than an obvious one.
  pwd -P
}

# Echo the canonical (main) checkout for the repo containing the active root.
helm_canonical_root() {
  local out
  if out=$(node "$_HELM_WSID" --canonical-root 2>/dev/null) && [ -n "$out" ]; then
    printf '%s\n' "$out"
    return 0
  fi
  helm_active_root
}
