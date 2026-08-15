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

# main is the working branch here by owner decision (2026-08-15). It does NOT
# deploy — vercel.json has carried "git": {"deploymentEnabled": {"*": false}}
# since 2026-07-08, so production is an on-demand CLI promote and a push to
# main ships nothing. The old "you are on main, branch before editing" warning
# was guarding a fact that had been false for five weeks.
if [ "$BRANCH" != "main" ]; then
  CTX="${CTX}
- NOTE: you are on '${BRANCH}', not main. main is the working branch in this
  repo — check this is deliberate before building on it."
fi

jq -nc --arg ctx "$CTX" \
  '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:$ctx}}'
exit 0
