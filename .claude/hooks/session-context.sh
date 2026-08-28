#!/usr/bin/env bash
# SessionStart — inject repo state Claude would otherwise have to spend tool
# calls discovering (and would silently get wrong after a resume).
#
# stdout on exit 0 is added to context for SessionStart hooks, but the
# structured form is explicit and survives future changes to that behaviour.
set -uo pipefail

# shellcheck source=lib/active-root.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/active-root.sh"

# The ACTIVE worktree, not the original project dir — reporting the canonical
# checkout's branch/dirty state to a session working in a worktree is the P0
# this fixes. See .claude/hooks/lib/workspace-identity.mjs.
cd "$(helm_active_root)" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
# node and jq are new dependencies as of the identity consolidation: this hook
# now reads one JSON blob from the authority instead of running its own git.
# A SessionStart hook must degrade silently rather than break a session, so
# guard them exactly like git above.
command -v node >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# ONE call to the identity authority, then read fields off it. This hook used
# to compute four of these itself:
#
#     git branch --show-current
#     git status --porcelain
#     git rev-list --count "@{u}..HEAD"      <- ahead of MY OWN remote branch
#     git rev-list --count "HEAD..main"      <- against LOCAL main
#
# Both distance metrics were wrong for this repo's workspace model, in
# different ways:
#
#   - `@{u}..HEAD` asks "how far ahead of my own task branch's remote am I".
#     scripts/new-worktree.sh creates task branches with --no-track ON PURPOSE,
#     so there is no @{u} and the number degraded to "?" even though git can
#     compute the real distance perfectly. And after the first push, @{u} is
#     origin/agent/<task> — so the answer becomes "ahead of myself", which is 0
#     by construction and says nothing about the trunk.
#
#   - `HEAD..main` measures against the LOCAL main ref, which can be stale,
#     ahead, or divergent from origin/main. Local main is not integration
#     truth.
#
# Both now come from workspaceIdentity(), which measures against origin/main.
IDENTITY=$(node "$(dirname "${BASH_SOURCE[0]}")/lib/workspace-identity.mjs" --identity-json 2>/dev/null)
printf '%s' "$IDENTITY" | jq -e . >/dev/null 2>&1 || exit 0

jqs() { printf '%s' "$IDENTITY" | jq -r "$1 // \"?\"" 2>/dev/null || printf '?'; }

BRANCH=$(jqs '.branch')
[ "$BRANCH" = "?" ] && BRANCH="detached"
DIRTY=$(jqs '.dirtyCount')
AHEAD=$(jqs '.ahead')
BEHIND=$(jqs '.behind')
# Short form of the exact ref the numbers were measured against. A
# remote-tracking ref is only as fresh as the last fetch, so a distance with an
# invisible basis is a number nobody can check. This hook does NOT fetch.
BASE_SHA=$(jqs '.baseSha')
[ "$BASE_SHA" != "?" ] && BASE_SHA=$(printf '%s' "$BASE_SHA" | cut -c1-12)

CTX="Repo state at session start:
- branch: ${BRANCH}
- uncommitted files: ${DIRTY}
- commits ahead of origin/main: ${AHEAD}
- commits behind origin/main: ${BEHIND}
- origin/main ref: ${BASE_SHA} (not fetched by this hook)"

# The number that matters most: this repo once sat 131 commits behind the trunk
# for 8 days while parallel work happened in another worktree, and every
# session read stale code without ever being told.
if [ "$BEHIND" != "?" ] && [ "${BEHIND:-0}" -gt 20 ] 2>/dev/null; then
  CTX="${CTX}
- WARNING: this branch is ${BEHIND} commits behind origin/main. You are reading
  stale code. Merge or rebase before trusting anything about project state."
fi

WT=$(git worktree list 2>/dev/null | wc -l | tr -d ' ')
if [ "${WT:-1}" -gt 1 ]; then
  CTX="${CTX}
- worktrees: ${WT} (work may be happening in another checkout of this repo)"
fi

# Branch policy is AGENTS.md canonicality: work on the currently checked-out
# branch; never switch unless asked. A push to main ships nothing (vercel.json
# deploymentEnabled all-false; production is an on-demand promote).
if [ "$BRANCH" != "main" ]; then
  CTX="${CTX}
- NOTE: you are on task branch '${BRANCH}'. Work here; do not switch to main
  unless asked. Merging to main does not deploy."
fi

jq -nc --arg ctx "$CTX" \
  '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:$ctx}}'
exit 0
