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

# RELEASE DRIFT — merged is not shipped.
#
# On 2026-09-01 eight fixes sat merged on main with none in production. Nobody
# ignored it; nothing said it. Every session was told how far it was from
# origin/main and nothing about how far origin/main was from the users.
#
# TWO SOURCES, and the hook says which one it used.
#
#   LIVE    scripts/release-status.mjs reads the served bundle and finds the
#           stamped commit — the same check deploy-prod.sh runs after a
#           promote. Bounded (--timeout-ms, default 5000, below this hook's
#           10 s budget in settings.json) and never a git fetch (--no-fetch),
#           so a dead network degrades to the marker, not to a hung hook.
#           Skip it with HELM_SESSION_OFFLINE=1.
#   MARKER  .claude/session-state/last-verified-release, `<sha> <date>`,
#           written by deploy-prod.sh only after it verified the bundle. It is
#           machine state and it goes stale: a deploy from a worktree left the
#           canonical copy at 53ae81a4c while production served fb425aa2b, and
#           this hook opened sessions claiming 16 unreleased commits against a
#           real figure of 1. So the marker is read from the CANONICAL checkout
#           (deploy-prod.sh now writes it there), and when it is all we have
#           the context says "marker" and its date, never "verified".
#
# This block used to say a session-start hook must never make a network call.
# It still makes none for git; the one HTTPS probe is bounded, optional, and
# the reason a session can now be told the truth instead of a stale marker.
LVR_REL=".claude/session-state/last-verified-release"
CANON_ROOT=$(jqs '.canonicalRoot')
[ "$CANON_ROOT" = "?" ] && CANON_ROOT="$(pwd -P)"
BASE_REF_SHA=$(jqs '.baseSha')

release_line_from() {
  # $1 = sha, $2 = label. Emits the CTX line(s) for a known production sha.
  local sha="$1" label="$2" unreleased
  git cat-file -e "${sha}^{commit}" 2>/dev/null || return 1
  [ "$BASE_REF_SHA" != "?" ] || return 1
  unreleased=$(git rev-list --count "${sha}..${BASE_REF_SHA}" 2>/dev/null) || return 1
  if [ "${unreleased:-0}" -gt 0 ] 2>/dev/null; then
    CTX="${CTX}
- UNRELEASED: ${unreleased} commit(s) are merged to origin/main but NOT in
  production (production ${label}). Merging does not ship —
  vercel.json disables git deploys. Confirm with: npm run release:status"
  else
    CTX="${CTX}
- production: $(printf '%s' "$sha" | cut -c1-9) — serving origin/main (${label})"
  fi
  return 0
}

LIVE_SHA=""
if [ "${HELM_SESSION_OFFLINE:-0}" != "1" ] && [ -f scripts/release-status.mjs ]; then
  LIVE_JSON=$(node scripts/release-status.mjs --json --no-fetch \
    --timeout-ms "${HELM_SESSION_RELEASE_PROBE_MS:-5000}" 2>/dev/null || true)
  LIVE_SHA=$(printf '%s' "$LIVE_JSON" | jq -r '.deployed // empty' 2>/dev/null)
fi

if [ -n "$LIVE_SHA" ] && release_line_from "$LIVE_SHA" "verified live in the served bundle at session start"; then
  # Refresh the marker in both checkouts so the offline path stays honest.
  for root in "$CANON_ROOT" "$(pwd -P)"; do
    mkdir -p "$root/.claude/session-state" 2>/dev/null || true
    printf '%s %s\n' "$LIVE_SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$root/$LVR_REL" 2>/dev/null || true
  done
else
  LVR_FILE=""
  for cand in "$CANON_ROOT/$LVR_REL" "$LVR_REL"; do
    [ -f "$cand" ] && LVR_FILE="$cand" && break
  done
  if [ -n "$LVR_FILE" ]; then
    LVR_SHA=$(awk '{print $1}' "$LVR_FILE" 2>/dev/null | tr -d '[:space:]')
    LVR_DATE=$(awk '{print $2}' "$LVR_FILE" 2>/dev/null | tr -d '[:space:]')
    # Legacy one-field marker: the file's mtime is the only date it has.
    [ -z "$LVR_DATE" ] && LVR_DATE=$(date -u -r "$LVR_FILE" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "unknown date")
    if [ -n "$LVR_SHA" ] && release_line_from "$LVR_SHA" "per MARKER written ${LVR_DATE}; NOT re-verified this session — live probe failed or skipped"; then
      :
    else
      CTX="${CTX}
- release state: UNKNOWN — the marker at ${LVR_FILE} names a commit this
  checkout cannot resolve. Do not assume main is live. Check with: npm run release:status"
    fi
  else
    CTX="${CTX}
- release state: UNKNOWN — no verified production release recorded on this
  machine and the live probe failed or was skipped. Do not assume main is live.
  Check with: npm run release:status"
  fi
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
