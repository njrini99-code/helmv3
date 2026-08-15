#!/usr/bin/env bash
# Stop — the deterministic half of "don't stop before it's verified".
#
# CLAUDE.md and .claude/rules/autonomy.md ask for this in prose. Prose is a
# request; a hook is enforcement. This fires when Claude tries to end a turn
# with source changes sitting in the tree, and pushes back once.
#
# LOOP SAFETY is the whole design. It blocks AT MOST ONCE per distinct tree
# state: the marker is keyed to HEAD + a hash of `git status --porcelain`. If
# Claude stops again having changed nothing, the marker already exists and the
# hook allows the stop. Any real edit changes the hash and re-arms it once.
# A Stop hook that can loop is worse than no Stop hook.
#
# exit 0 + no output  = allow the stop
# {"decision":"block"} = Claude keeps working, reason is fed back
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Only care about source that can actually break. Docs, audits and scratch
# files are not worth interrupting a turn for.
CHANGED=$(git status --porcelain 2>/dev/null \
  | grep -cE '\.(ts|tsx|js|jsx|mjs|cjs|sql|css)$')
[ "${CHANGED:-0}" -eq 0 ] && exit 0

# The state key must be CONTENT-sensitive, not just file-list-sensitive.
# `git status --porcelain` alone reports which files are dirty, not what is in
# them — so after one block, every further edit to those same files produced an
# identical key and the check never re-armed. `git diff --stat` moves with
# insertion/deletion counts, which is cheap and tracks real edits.
STATE=$(printf '%s%s%s' "$(git rev-parse HEAD 2>/dev/null)" \
                        "$(git status --porcelain 2>/dev/null)" \
                        "$(git diff --stat 2>/dev/null)" \
        | shasum | cut -d' ' -f1)
MARK=".git/claude-stop-verify-$STATE"

# Already pushed back on this exact tree state — let it go.
[ -f "$MARK" ] && exit 0

# Prune old markers so .git does not accumulate them.
find .git -maxdepth 1 -name 'claude-stop-verify-*' -mmin +240 -delete 2>/dev/null
: > "$MARK"

FILES=$(git status --porcelain 2>/dev/null \
  | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|sql|css)$' \
  | awk '{print $NF}' | head -8 | tr '\n' ' ')

SERVER_ACTION=""
if git diff --name-only 2>/dev/null | grep -qE '\.(ts|tsx)$' \
   && git diff 2>/dev/null | grep -q "'use server'"; then
  SERVER_ACTION="
A 'use server' module changed. \`npm run build\` is REQUIRED here — typecheck
and unit tests both pass while an \`export type\` in a 'use server' file throws
ReferenceError at runtime. That shipped 100%-dead golf messaging past 8,763
green tests."
fi

# Build the message in the shell. A jq program cannot contain raw newlines
# inside a string literal — doing that emitted invalid JSON, which a Stop hook
# silently discards, so the guard looked like it worked while doing nothing.
REASON=$(cat <<EOF
${CHANGED} source file(s) are modified and unverified: ${FILES}

Before ending the turn, run the gates that apply and report their real exit
codes — do not infer them:
  npm run typecheck
  npm run lint
  npm test
  npm run build        (required if a 'use server' file or component changed)
  npm run test:rls     (any RLS/policy/migration change)
  npm run docs:check   (any AUTOGEN inventory source changed)

Never pipe a gate without 'set -o pipefail' — the pipeline reports the LAST
command's exit code, so a failing suite reads as success.
Never delete, skip, or weaken a test to reach green.${SERVER_ACTION}

If you already ran these and they passed, say so with the exit codes and stop —
this will not fire again for this tree state. If a gate is genuinely unrunnable
here (supabase start needs Docker, which this machine lacks), name that limit
and stop.
EOF
)

jq -nc --arg reason "$REASON" '{decision: "block", reason: $reason}'
exit 0
