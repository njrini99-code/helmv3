#!/usr/bin/env bash
# SessionStart — inject repo state Claude would otherwise have to spend tool
# calls discovering (and would silently get wrong after a resume).
#
# stdout on exit 0 is added to context for SessionStart hooks, but the
# structured form is explicit and survives future changes to that behaviour.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
AHEAD=$(git rev-list --count "@{u}..HEAD" 2>/dev/null || echo "?")
# Behind-main is the number that matters most: this repo once sat 131 commits
# behind main for 8 days while parallel work happened in a /private/tmp
# worktree, and every session read stale code without ever being told.
BEHIND=$(git rev-list --count "HEAD..main" 2>/dev/null || echo "?")

CTX="Repo state at session start:
- branch: ${BRANCH}
- uncommitted files: ${DIRTY}
- commits ahead of upstream: ${AHEAD}
- commits BEHIND main: ${BEHIND}"

if [ "$BEHIND" != "?" ] && [ "${BEHIND:-0}" -gt 20 ] 2>/dev/null; then
  CTX="${CTX}
- WARNING: this branch is ${BEHIND} commits behind main. You are reading stale
  code. Merge or rebase before trusting anything about project state."
fi

WT=$(git worktree list 2>/dev/null | wc -l | tr -d ' ')
if [ "${WT:-1}" -gt 1 ]; then
  CTX="${CTX}
- worktrees: ${WT} (work may be happening in another checkout of this repo)"
fi

# Production serves main in this repo, so working directly on it is a footgun.
if [ "$BRANCH" = "main" ]; then
  CTX="${CTX}
- WARNING: you are on main, which is what production serves. Branch before editing."
fi

jq -nc --arg ctx "$CTX" \
  '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:$ctx}}'
exit 0
