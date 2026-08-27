#!/usr/bin/env bash
# Stop — the deterministic half of "don't stop before it's verified".
#
# CLAUDE.md and .claude/rules/autonomy.md ask for this in prose. Prose is a
# request; a hook is enforcement. This fires when Claude tries to end a turn
# with unverified work, and pushes back once.
#
# LOOP SAFETY is the whole design. It blocks AT MOST ONCE per distinct tree
# state: the marker is keyed to HEAD + a hash of `git status --porcelain` +
# `git diff --stat`. If Claude stops again having changed nothing, the marker
# already exists and the hook allows the stop. Any real edit changes the hash
# and re-arms it once. A Stop hook that can loop is worse than no Stop hook.
# UNCHANGED from the previous version of this file.
#
# exit 0 + no output  = allow the stop
# {"decision":"block"} = Claude keeps working, reason is fed back
#
# ATTRIBUTION (rebuilt 2026-08-21, GolfHelm Engineering OS P2). The OLD
# mechanism read the whole dirty tree and diffed it against a per-session
# baseline file — correct only when git alone could tell sessions apart, which
# it fundamentally cannot: `git status --porcelain` reports what's dirty, never
# who dirtied it. One session was blocked five times for 17-21 files it never
# touched while a peer session's count moved underneath it (2026-08-18).
#
# The FIX is event-time ownership: `.claude/session-state/<session_id>.jsonl`
# (written by record-session-touch.mjs at the moment of every successful
# Write/Edit/MultiEdit) is ground truth for "did THIS session write this
# file" — no git-diffing, no peer-attribution ambiguity, because it was never
# inferred from the shared tree in the first place. `.claude/hooks/lib/
# stop-check.mjs` folds that ledger into a mapping/context/memory verdict;
# this script stays bash for the loop-safety/exit-code machinery that was
# already correct and untouched by the attribution bug.
#
# Git is now a FALLBACK cross-check only, for the one case session-state
# cannot cover by construction: a session with ZERO recorded touches (either
# it genuinely wrote nothing, or the recording hooks did not fire — e.g. an
# older harness, a disabled hook, a wiring bug). In that case the old
# baseline-diff mechanism still runs, but ADVISORY ONLY — it can no longer
# block, because it is exactly the mechanism proven unable to attribute
# correctly under concurrency. See the ADVISORY branch below.
set -uo pipefail

# shellcheck source=lib/active-root.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/active-root.sh"

# ACTIVE worktree. Verifying the wrong checkout is how a Stop gate passes
# while the work it was meant to verify sits in another tree.
ACTIVE_ROOT="$(helm_active_root)"
cd "$ACTIVE_ROOT" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v node >/dev/null 2>&1 || exit 0

SRC_RE='\.(ts|tsx|js|jsx|mjs|cjs|sql|css)$'

# Stop hooks receive JSON on stdin; session_id is what makes attribution
# per-session (both here and for stop-check.mjs, which resolves the SAME
# .claude/session-state/<session_id>.jsonl file record-session-touch.mjs
# wrote to during this session — the raw, unsanitized id, since that is what
# every PostToolUse/PreToolUse hook in this build also received and used).
STDIN_JSON=$(cat 2>/dev/null || true)
SESSION_ID=$(printf '%s' "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null)
[ -z "$SESSION_ID" ] && SESSION_ID="ppid-$PPID"
SESSION_ID_SAFE=$(printf '%s' "$SESSION_ID" | tr -c 'A-Za-z0-9._-' '_')

STOP_CHECK_JSON=$(node "$ACTIVE_ROOT/.claude/hooks/lib/stop-check.mjs" "$SESSION_ID" 2>/dev/null)
printf '%s' "$STOP_CHECK_JSON" | jq -e . >/dev/null 2>&1 || STOP_CHECK_JSON='{"touchedFiles":[]}'

# Counts/lists below are computed from .verifiableFiles, NOT .touchedFiles —
# .touchedFiles includes files a delegated_verification event already covers
# (a subagent's/worker session's own PR + CI verified them; this session has
# no local context to redo that work) and .verifiableFiles is touchedFiles
# minus those. Non-repo paths (e.g. session scratchpad artifacts) never
# appear in EITHER list — record-session-touch.mjs excludes them at the
# recording step, since there is nothing there to gate.
TOUCHED_COUNT=$(printf '%s' "$STOP_CHECK_JSON" | jq '.verifiableFiles | length')
TOUCHED_SRC_COUNT=$(printf '%s' "$STOP_CHECK_JSON" | jq --arg re "$SRC_RE" '[.verifiableFiles[] | select(test($re))] | length')
MAPPING_GAP_COUNT=$(printf '%s' "$STOP_CHECK_JSON" | jq '.mappingGaps | length')
CONTEXT_GAP_COUNT=$(printf '%s' "$STOP_CHECK_JSON" | jq '.contextGaps | length')
MEMORY_GAP_COUNT=$(printf '%s' "$STOP_CHECK_JSON" | jq '.memoryGaps | length')
DATE_GAP_COUNT=$(printf '%s' "$STOP_CHECK_JSON" | jq '.dateGaps | length')
DELEGATED_COUNT=$(printf '%s' "$STOP_CHECK_JSON" | jq '.delegatedFiles | length')

# `.git` is a DIRECTORY in a normal clone and a FILE in a worktree.
GITDIR=$(git rev-parse --git-dir 2>/dev/null || echo ".git")
BASE="$GITDIR/claude-stop-baseline-$SESSION_ID_SAFE"

# ── FALLBACK PATH: this session's own ledger shows nothing SOURCE touched ──
# Either genuinely nothing changed, or the recording hooks did not fire. The
# old git-baseline-diff logic still runs here, but ONLY as an advisory signal
# — it must never block, because it cannot attribute correctly under
# concurrency (that is exactly the bug this rebuild fixes). Preserved mostly
# unchanged from the prior version of this file.
#
# Gated on TOUCHED_SRC_COUNT, not TOUCHED_COUNT — the OLD script only ever
# cared about SRC_RE-matching files (ts/tsx/js/jsx/mjs/cjs/sql/css); a
# doc-only session (e.g. touching ONLY memory/features/<id>.md, which is
# exactly the memory-update step the MEMORY GAP message below instructs) must
# not itself trip the "unverified source" gate control-plane loop. A real gap
# (mapping/context/memory) still reaches the main path regardless, because a
# non-source file CAN carry a real gap — package.json maps to
# feature_awareness_system via its code.services glob, for one.
if [ "${TOUCHED_SRC_COUNT:-0}" -eq 0 ] && [ "${MAPPING_GAP_COUNT:-0}" -eq 0 ] \
   && [ "${CONTEXT_GAP_COUNT:-0}" -eq 0 ] && [ "${MEMORY_GAP_COUNT:-0}" -eq 0 ] \
   && [ "${DATE_GAP_COUNT:-0}" -eq 0 ]; then
  DIRTY_NOW=$(git status --porcelain 2>/dev/null | grep -E "$SRC_RE" | awk '{print $NF}' | sort)
  if [ ! -f "$BASE" ]; then
    printf '%s\n' "$DIRTY_NOW" > "$BASE"
    exit 0
  fi
  find "$GITDIR" -maxdepth 1 -name 'claude-stop-baseline-*' -mmin +720 -delete 2>/dev/null
  NEW_SINCE_BASELINE=$(comm -13 <(sort "$BASE" 2>/dev/null) <(printf '%s\n' "$DIRTY_NOW") 2>/dev/null | grep -E "$SRC_RE" || true)
  GIT_ONLY_COUNT=$(printf '%s' "$NEW_SINCE_BASELINE" | grep -cE "$SRC_RE" || true)
  printf '%s\n' "$DIRTY_NOW" > "$BASE"
  if [ "${GIT_ONLY_COUNT:-0}" -gt 0 ]; then
    cat >&2 <<ADVISORY
[stop-verify] git shows ${GIT_ONLY_COUNT} dirty source file(s) since this session's
last stop, but this session's OWN ledger (.claude/session-state/${SESSION_ID_SAFE}.jsonl)
recorded zero touches. Either these are a peer session's changes (git cannot
tell — that is the whole reason attribution moved to session-state), or the
record-session-touch.mjs hook is not wired/firing for this session. This is a
NOTE, not a block: verify the hook is active if these files are actually yours.
  ${NEW_SINCE_BASELINE}
ADVISORY
  fi
  exit 0
fi

# ── MAIN PATH: this session touched something, or has an outstanding gap ───
STATE=$(printf '%s%s%s' "$(git rev-parse HEAD 2>/dev/null)" \
                        "$(git status --porcelain 2>/dev/null)" \
                        "$(git diff --stat 2>/dev/null)" \
        | shasum | cut -d' ' -f1)
MARK="$GITDIR/claude-stop-verify-$STATE"

# Already pushed back on this exact tree state — let it go (loop safety).
[ -f "$MARK" ] && exit 0

find "$GITDIR" -maxdepth 1 -name 'claude-stop-verify-*' -mmin +240 -delete 2>/dev/null
: > "$MARK"
printf '%s\n' "$(git status --porcelain 2>/dev/null | grep -E "$SRC_RE" | awk '{print $NF}' | sort)" > "$BASE"

TOUCHED_LIST=$(printf '%s' "$STOP_CHECK_JSON" | jq -r '.verifiableFiles[]' | head -8 | tr '\n' ' ')

# 'use server' build trigger — scoped to THIS SESSION's touched .ts/.tsx
# files (an improvement on the old whole-tree diff, now that we know exactly
# which files are ours). Same real incident this guards against: an
# `export type` inside a 'use server' module passed typecheck AND unit tests,
# then threw ReferenceError at runtime, past 8,763 green tests.
#
# Built as an ARRAY, not a bare unquoted variable expansion — this repo's
# routes include `[id]`-style dynamic segments, which an unquoted `$VAR`
# expansion hands to bash as a glob character class, not a literal path.
# guard-bash.sh's `-f` (noglob) exists for exactly this reason; this script
# does not set `-f` script-wide (it would change every other expansion
# here too), so the array form is the locally-scoped equivalent — each
# element is passed to `git diff` as one already-delimited argument, immune
# to both word-splitting and glob expansion regardless of its contents.
TOUCHED_TS_FILES=()
while IFS= read -r line; do
  [ -n "$line" ] && TOUCHED_TS_FILES+=("$line")
done < <(printf '%s' "$STOP_CHECK_JSON" | jq -r --arg re '\.(ts|tsx)$' '.verifiableFiles[] | select(test($re))')

SERVER_ACTION=""
if [ "${#TOUCHED_TS_FILES[@]}" -gt 0 ] && git diff -- "${TOUCHED_TS_FILES[@]}" 2>/dev/null | grep -q "'use server'"; then
  SERVER_ACTION="
A 'use server' module this session touched changed. \`npm run build\` is
REQUIRED here — typecheck and unit tests both pass while an \`export type\` in
a 'use server' file throws ReferenceError at runtime. That shipped 100%-dead
golf messaging past 8,763 green tests."
fi

RLS_RELEVANT=$(printf '%s' "$STOP_CHECK_JSON" | jq -r '.rlsRelevant')
AUTOGEN_RELEVANT=$(printf '%s' "$STOP_CHECK_JSON" | jq -r '.autogenRelevant')
RLS_LINE="  npm run test:rls     (any RLS/policy/migration change)"
[ "$RLS_RELEVANT" = "true" ] && RLS_LINE="  npm run test:rls     REQUIRED — this session touched a migration/RLS file"
DOCS_LINE="  npm run docs:check   (any AUTOGEN inventory source changed)"
[ "$AUTOGEN_RELEVANT" = "true" ] && DOCS_LINE="  npm run docs:check   REQUIRED — this session touched an AUTOGEN inventory source"

# ── Layer 1: mapping/context/memory findings (spec §12's three new gate
#    dimensions), only when non-empty. In normal operation
#    guard-feature-context.mjs already prevented mapping/context gaps at edit
#    time, so these firing here means that gate was bypassed or is missing —
#    this is defense in depth, not the primary enforcement point.
GAP_SECTION=""
if [ "${MAPPING_GAP_COUNT:-0}" -gt 0 ]; then
  MAPPING_LIST=$(printf '%s' "$STOP_CHECK_JSON" | jq -r '.mappingGaps[] | "  - " + .')
  GAP_SECTION="${GAP_SECTION}

MAPPING GAP — touched file(s) under a governed path with no feature mapping in memory/registry.yml:
${MAPPING_LIST}
Run 'npm run knowledge:map -- --files <path>' to acknowledge, or add the mapping to memory/registry.yml."
fi
if [ "${CONTEXT_GAP_COUNT:-0}" -gt 0 ]; then
  CONTEXT_LIST=$(printf '%s' "$STOP_CHECK_JSON" | jq -r '.contextGaps[] | "  - " + .path + " (feature: " + .feature_id + ")"')
  GAP_SECTION="${GAP_SECTION}

CONTEXT GAP — touched file(s) whose mapped feature's context was not loaded (or not loaded before the touch) this session:
${CONTEXT_LIST}
Read the feature's memory/features/<id>.md, or run knowledge:context for it."
fi
if [ "${MEMORY_GAP_COUNT:-0}" -gt 0 ]; then
  MEMORY_LIST=$(printf '%s' "$STOP_CHECK_JSON" | jq -r '.memoryGaps[] | "  - " + .feature_id + ": " + .doc')
  GAP_SECTION="${GAP_SECTION}

MEMORY GAP — feature(s) touched this session with neither a memory-doc update nor a recorded no_memory_change_reason:
${MEMORY_LIST}
If truth changed, update the doc (and append to memory/ledgers/changes/<id>.md). If this was
genuinely non-behavioral, record why:
  node .claude/hooks/lib/record-event.mjs no-memory-change --reason <format-only|generated-file-refresh|test-only-no-contract-change|comment-correction|mechanical-refactor-with-proven-equivalent-behavior>
Bare \"not needed\" is never accepted."
fi
if [ "${DATE_GAP_COUNT:-0}" -gt 0 ]; then
  DATE_LIST=$(printf '%s' "$STOP_CHECK_JSON" | jq -r '.dateGaps[] | "  - " + .')
  GAP_SECTION="${GAP_SECTION}

DATE GAP — ledger entr(y/ies) touched this session with no explicit YYYY-MM-DD date in the new content (owner directive: explicit dates on everything):
${DATE_LIST}
Add a YYYY-MM-DD date to the entry you just wrote."
fi

DELEGATED_NOTE=""
if [ "${DELEGATED_COUNT:-0}" -gt 0 ]; then
  DELEGATED_LIST=$(printf '%s' "$STOP_CHECK_JSON" | jq -r '.delegatedFiles[] | "  - " + .path + (if .pr then " (PR #" + (.pr|tostring) + ")" else "" end)')
  DELEGATED_NOTE="

${DELEGATED_COUNT} file(s) touched this session are DELEGATED (verified elsewhere, not re-demanded here):
${DELEGATED_LIST}"
fi

REASON=$(cat <<EOF
${TOUCHED_COUNT} file(s) touched by this session are unverified: ${TOUCHED_LIST}${DELEGATED_NOTE}

Before ending the turn, run the gates that apply and report their real exit
codes — do not infer them:
  npm run typecheck
  npm run lint
  npm test
  npm run build        (required if a 'use server' file or component changed)
${RLS_LINE}
${DOCS_LINE}

Never pipe a gate without 'set -o pipefail' — the pipeline reports the LAST
command's exit code, so a failing suite reads as success.
Never delete, skip, or weaken a test to reach green.${SERVER_ACTION}${GAP_SECTION}

If you already ran these and they passed, say so with the exit codes and stop —
this will not fire again for this tree state. If a gate is genuinely unrunnable
here (supabase start needs Docker, which this machine lacks), name that limit
and stop.
EOF
)

jq -nc --arg reason "$REASON" '{decision: "block", reason: $reason}'
exit 0
