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

CTX="Repo state at session start:
- branch: ${BRANCH}
- uncommitted files: ${DIRTY}
- commits ahead of upstream: ${AHEAD}"

# Production serves main in this repo, so working directly on it is a footgun.
if [ "$BRANCH" = "main" ]; then
  CTX="${CTX}
- WARNING: you are on main, which is what production serves. Branch before editing."
fi

jq -nc --arg ctx "$CTX" \
  '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:$ctx}}'
exit 0
