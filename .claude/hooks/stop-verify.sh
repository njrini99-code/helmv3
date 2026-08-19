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
#
# ATTRIBUTION (2026-08-18). This hook used to read the WHOLE dirty tree, which
# is only correct when one session owns the checkout. With several Claude
# sessions sharing this working tree it blamed whoever happened to be ending a
# turn for whatever anyone else had dirty: one session was blocked five times
# over 17-21 files it never touched, while the count moved 19 -> 20 -> 21 -> 17
# -> 18 underneath it as a peer committed and edited. Four turns were spent
# proving "not mine" instead of working.
#
# Two changes, both conservative — the gate still fires, it just stops
# misattributing:
#   1. A per-session BASELINE. The first stop records what was already dirty;
#      later stops only count what appeared since. Churn from a peer session
#      no longer re-arms this hook against you.
#   2. An honest CONCURRENCY note. When other sessions are live in this tree,
#      attribution is genuinely unknowable from git alone, so the message says
#      so rather than asserting the files are yours.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

SRC_RE='\.(ts|tsx|js|jsx|mjs|cjs|sql|css)$'

# Stop hooks receive JSON on stdin; session_id is what makes the baseline
# per-session. Fall back to the parent pid so a missing/!jq environment still
# gets a stable-enough key rather than sharing one baseline across sessions.
STDIN_JSON=$(cat 2>/dev/null || true)
SESSION_ID=$(printf '%s' "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null)
[ -z "$SESSION_ID" ] && SESSION_ID="ppid-$PPID"
SESSION_ID=$(printf '%s' "$SESSION_ID" | tr -c 'A-Za-z0-9._-' '_')

DIRTY_NOW=$(git status --porcelain 2>/dev/null | grep -E "$SRC_RE" | awk '{print $NF}' | sort)

# `.git` is a DIRECTORY in a normal clone and a FILE in a worktree, so a
# hardcoded ".git/..." path silently fails everywhere this repo actually runs
# agents — three of the four live checkouts are worktrees. Every baseline write
# went to stderr as "Not a directory", $BASE never existed, and `comm -13`
# against a missing file reports EVERYTHING as new. The per-session scoping was
# inert in exactly the configuration it was written for.
#
# Found by running the hook, not by reading it.
GITDIR=$(git rev-parse --git-dir 2>/dev/null || echo ".git")
BASE="$GITDIR/claude-stop-baseline-$SESSION_ID"
if [ ! -f "$BASE" ]; then
  # First stop this session. Anything already dirty predates our first chance
  # to have touched it in a way we can prove, so record it and don't claim it.
  printf '%s\n' "$DIRTY_NOW" > "$BASE"
fi

# A ONE-TIME baseline was not enough, and this is the bug that shipped.
#
# It correctly ignored files that were dirty BEFORE this session's first stop.
# It said nothing about files another session dirties WHILE this one runs: those
# are absent from our frozen baseline, present in DIRTY_NOW, and therefore
# attributed to us. With several sessions in one checkout that is not an edge
# case, it is the common case.
#
# Observed 2026-08-19: a session that wrote ZERO bytes to this repo all night
# was blocked twice and asked to run gates over another session's in-flight
# auth and staff-invite work. It had to stop mid-task and prove a negative.
#
# So the baseline is refreshed on every stop. Only files that appeared between
# THIS session's previous stop and now are plausibly ours.
find "$GITDIR" -maxdepth 1 -name 'claude-stop-baseline-*' -mmin +720 -delete 2>/dev/null

# Only files that appeared since this session's baseline are plausibly ours.
NEW_FILES=$(comm -13 <(sort "$BASE" 2>/dev/null) <(printf '%s\n' "$DIRTY_NOW") 2>/dev/null | grep -E "$SRC_RE" || true)
CHANGED=$(printf '%s' "$NEW_FILES" | grep -cE "$SRC_RE" || true)
[ "${CHANGED:-0}" -eq 0 ] && exit 0

# Other live Claude sessions in this tree mean git alone cannot attribute a
# change to anyone. Say that instead of implying certainty.
PEERS=$(ls -1 /tmp/cc-socks/*.sock 2>/dev/null | wc -l | tr -d ' ')
CONCURRENCY=""
if [ "${PEERS:-0}" -gt 1 ]; then
  # DO NOT BLOCK when peers are live. Refreshing the baseline above narrows the
  # window but cannot close it: another session can dirty a file between our two
  # stops, and git offers nothing that attributes a working-tree change to a
  # session. Blocking on an unattributable change asks the wrong agent to prove
  # a negative, and the honest answer to "is this yours?" is "unknowable here".
  #
  # Advisory instead. The gate that actually protects main is CI, which runs on
  # the merged result and does not care who typed it.
  printf '%s\n' "$DIRTY_NOW" > "$BASE"
  cat >&2 <<ADVISORY
[stop-verify] ${CHANGED} source file(s) changed since this session's last stop,
and ${PEERS} Claude sessions are live in this checkout — git cannot attribute a
working-tree change to a session, so this is a NOTE, not a request.

If any of these are yours, run the gates for them. If none are, carry on.
  ${NEW_FILES}
ADVISORY
  exit 0
fi

# The state key must be CONTENT-sensitive, not just file-list-sensitive.
# `git status --porcelain` alone reports which files are dirty, not what is in
# them — so after one block, every further edit to those same files produced an
# identical key and the check never re-armed. `git diff --stat` moves with
# insertion/deletion counts, which is cheap and tracks real edits.
STATE=$(printf '%s%s%s' "$(git rev-parse HEAD 2>/dev/null)" \
                        "$(git status --porcelain 2>/dev/null)" \
                        "$(git diff --stat 2>/dev/null)" \
        | shasum | cut -d' ' -f1)
MARK="$GITDIR/claude-stop-verify-$STATE"

# Already pushed back on this exact tree state — let it go.
[ -f "$MARK" ] && exit 0

# Prune old markers so .git does not accumulate them.
find "$GITDIR" -maxdepth 1 -name 'claude-stop-verify-*' -mmin +240 -delete 2>/dev/null
: > "$MARK"

# Re-baseline: these files have now been raised. Raising them again on the next
# stop would re-ask a question already answered.
printf '%s\n' "$DIRTY_NOW" > "$BASE"

FILES=$(printf '%s\n' "$NEW_FILES" | head -8 | tr '\n' ' ')

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
Never delete, skip, or weaken a test to reach green.${SERVER_ACTION}${CONCURRENCY}

If you already ran these and they passed, say so with the exit codes and stop —
this will not fire again for this tree state. If a gate is genuinely unrunnable
here (supabase start needs Docker, which this machine lacks), name that limit
and stop.
EOF
)

jq -nc --arg reason "$REASON" '{decision: "block", reason: $reason}'
exit 0
