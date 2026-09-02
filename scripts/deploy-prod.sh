#!/usr/bin/env bash
#
# Promote main to production, WITH the commit stamped into the Sentry release.
#
# WHY THIS EXISTS
# ---------------
# `vercel deploy --prod` uploads local source with no git connection, so Vercel
# never sets VERCEL_GIT_COMMIT_SHA. `src/instrumentation.ts` reads:
#
#     NEXT_PUBLIC_SENTRY_RELEASE || VERCEL_GIT_COMMIT_SHA
#
# With neither set, the release tag on production events carries forward a SHA
# from some earlier deploy. On 2026-08-16 that stale tag caused a live
# production deploy to be misdiagnosed as "production is running old code",
# and nearly triggered an unnecessary --force redeploy. Answering "what commit
# is actually in production?" took a scan of all 55 client bundles.
#
# Stamping the release makes that a one-line lookup: read the `release` tag on
# any production Sentry event and it IS the commit.
#
# USAGE
#     scripts/deploy-prod.sh            # deploy current HEAD
#     DRY_RUN=1 scripts/deploy-prod.sh  # print what would happen, deploy nothing
#
set -euo pipefail

# fsmonitor in this repo intermittently fails with
# "fsmonitor_ipc__send_query: unspecified error". git falls back to a real
# filesystem scan and still reports correctly, but the dirty-tree guard below
# is the one thing standing between a half-finished edit and production — so
# disable the daemon rather than trust a degraded cache to report honestly.
git() { command git -c core.fsmonitor=false "$@"; }

# The Vercel CLI is REPO-LOCAL. AGENTS.md: "Use repo-local platform CLIs:
# ./node_modules/.bin/supabase and ./node_modules/.bin/vercel. Do not assume
# global Supabase or Vercel binaries."
#
# This script called bare `vercel` and therefore could not run at all on a
# machine without a global install — discovered 2026-09-01 attempting the first
# promote of nine merged fixes, which died at "vercel: command not found" AFTER
# passing every guard above it. A deploy script that cannot deploy is worse than
# no deploy script: it reads as a working release path right up until you need it.
VERCEL_BIN="./node_modules/.bin/vercel"
if [ ! -x "$VERCEL_BIN" ]; then
  VERCEL_BIN="$(command -v vercel || true)"
fi
if [ -z "$VERCEL_BIN" ] || [ ! -x "$VERCEL_BIN" ]; then
  echo "REFUSING: no Vercel CLI found at ./node_modules/.bin/vercel or on PATH." >&2
  echo "Run \`npm install\` (the CLI is a repo dependency)." >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SHA="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"

# --- Guards. A production promote is not the place to discover a dirty tree. ---

if [ -n "$(git status --porcelain)" ]; then
  echo "REFUSING: working tree is dirty. A CLI deploy uploads the LOCAL tree, so" >&2
  echo "uncommitted changes would ship. Commit, stash, or clean first:" >&2
  git status --short >&2
  exit 1
fi

if [ "$BRANCH" != "main" ]; then
  echo "REFUSING: on branch '$BRANCH', not main." >&2
  echo "If you genuinely mean to promote a non-main branch, run vercel directly." >&2
  exit 1
fi

git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "REFUSING: local main differs from origin/main." >&2
  echo "  local : $(git rev-parse --short HEAD)" >&2
  echo "  origin: $(git rev-parse --short origin/main)" >&2
  echo "Pull or push first, so the deployed commit is one that exists on the remote." >&2
  exit 1
fi

echo "Deploying $SHORT ($BRANCH) to production"
echo "  release tag -> $SHA"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1 — nothing deployed."
  exit 0
fi

# --scope is REQUIRED and its absence is not obvious. This project lives under
# the `nick-rinis-projects` TEAM, and without --scope the CLI resolves a
# personal context and the deploy dies with a bare:
#
#     {"status":"error","reason":"deploy_failed","message":"Not authorized"}
#
# which reads like a credentials problem and is not — `vercel whoami`,
# `vercel project ls` and `vercel ls` all succeed at that moment. Observed on
# this script's first real run, 2026-08-16.
#
# Read the team from .vercel/project.json rather than hardcoding it, so a
# re-link cannot silently point the deploy at the wrong org.
SCOPE="$(node -e 'try{process.stdout.write(require("./.vercel/project.json").orgId||"")}catch{}' 2>/dev/null)"
if [ -z "$SCOPE" ]; then
  echo "REFUSING: could not read orgId from .vercel/project.json." >&2
  echo "Run \`vercel link\` first — deploying without --scope fails as 'Not authorized'." >&2
  exit 1
fi
echo "  scope       -> $SCOPE"

# --build-env: available to `next build`, which is when Next inlines
#   NEXT_PUBLIC_* into the bundle. This is the one that actually matters.
# --env: available at runtime too, so the server-side Sentry init agrees with
#   the client bundle rather than reporting a different release.
# --archive=tgz: .claude/rules/shipping.md has required this since the
# 2026-08-03 and 2026-08-09 rejections (48,139 and 19,795 files against a
# 15,000 cap) and the 2026-08-20 promote that stalled at "Uploading (0.0B/1.6GB)".
# This script never passed it — the rule lived only in prose while the one
# command it governs ignored it. Measured 2026-09-01 the upload is 5,720 files
# / 96.5 MB, comfortably under the file cap, so the cap is no longer the
# reason; the 10 MB request-body limit is, and a single tarball is what avoids
# it. Cheap insurance against a class of failure this repo has hit three times.
"$VERCEL_BIN" deploy --prod --yes \
  --archive=tgz \
  --scope "$SCOPE" \
  --build-env "NEXT_PUBLIC_SENTRY_RELEASE=$SHA" \
  --env "NEXT_PUBLIC_SENTRY_RELEASE=$SHA"

# --- From here on the deploy has HAPPENED. ---------------------------------
#
# Every exit path below must say what it knows about the release, because
# "the script died" and "nothing was deployed" are no longer the same thing.
#
# 2026-09-02: the promote of a9638cecf succeeded — READY, alias moved, stamp in
# the served bundle — and this script then died with a bare exit 134 right
# after "Verifying the promote actually took effect...". Nothing else printed,
# the marker was never written, and it took a macOS crash report to learn that
# the DEPLOY had been fine and only the CHECK had crashed. `set -e` is the
# right default for the guards above (a refusal should stop everything); after
# the deploy it turns any tool failure into a silent abort that reads as a
# failed release. So from here on an unexpected non-zero exit is reported as
# DEPLOY NOT VERIFIED, naming the command that died and the evidence gathered
# up to that point, and pointing at the by-hand check.
VERIFY_VERDICT=""   # "verified" | "not-verified" once a verdict has been printed
ALIAS_DPL="?"; HTTP="?"; STAMPED="?"; CHUNK_TMP=""
FAILED_RC=""; FAILED_CMD=""; FAILED_LINE=""
on_err() { FAILED_RC=$?; FAILED_CMD=$BASH_COMMAND; FAILED_LINE=$1; }
on_exit() {
  local rc=$?
  [ -n "$CHUNK_TMP" ] && rm -f "$CHUNK_TMP"
  [ "$rc" -ne 0 ] || return 0
  [ -z "$VERIFY_VERDICT" ] || return 0
  echo >&2
  echo "DEPLOY NOT VERIFIED." >&2
  echo "  The deploy command finished, but this script CRASHED before it could record a verdict:" >&2
  echo "    exit ${FAILED_RC:-$rc} from: ${FAILED_CMD:-unknown command} (line ${FAILED_LINE:-?})" >&2
  echo "  Evidence gathered before the crash: alias=$ALIAS_DPL  http=$HTTP  release-stamp-found=$STAMPED  expected-sha=$SHORT" >&2
  echo "  This is a failure to CHECK, not evidence that the deploy failed — production may" >&2
  echo "  well be serving $SHORT. Do not redeploy on this alone. Check by hand:" >&2
  echo "    npm run release:status" >&2
  echo "  (The session-start hook re-probes the served bundle and rewrites the marker" >&2
  echo "  itself once that check can reach the site.)" >&2
}
trap 'on_err $LINENO' ERR
trap on_exit EXIT

echo
# VERIFY, DO NOT NARRATE.
#
# This block used to print three commands for a human to run. Nobody ran them,
# and on 2026-09-01 eight merged fixes sat unreleased without anyone noticing —
# a deploy that is never checked is indistinguishable from a deploy that never
# happened. The instructions are now the implementation.
echo "Verifying the promote actually took effect..."

# 1. Which deployment the production alias points at. Informational — the id
#    should match the one the deploy printed — and NEVER fatal.
#
# READ EVERYTHING THE CLI PRINTS BEFORE PARSING ANY OF IT. This used to be
#
#     "$VERCEL_BIN" inspect ... 2>&1 | awk '/^ *id\t/ {print $2; exit}'
#
# and that `exit` is what killed the 2026-09-02 promote. awk hung up on the
# pipe as soon as it saw the `id` row — the second row the CLI prints; name,
# target, status, url, created and the alias list all follow it, and the CLI
# prints every one of them to STDERR, which `2>&1` had put on that same pipe.
# The CLI's next write got EPIPE, and rather than exiting it allocated until
# V8 aborted at the --max-old-space-size ceiling about 90 seconds later
# (crash report: node::OOMErrorHandler <- Heap::FatalProcessOutOfMemory).
# SIGABRT is exit 134; `pipefail` carried it out of the command substitution
# and `set -e` turned it into a dead script with the deploy already done.
# Reproduced deterministically with that pipeline; gone the moment the reader
# consumes the whole stream. Capture first, parse second, and never let a
# reader hang up on a process that is still talking.
INSPECT_RC=0
INSPECT_OUT="$("$VERCEL_BIN" inspect helmsportslabs.com --scope "$SCOPE" 2>&1)" || INSPECT_RC=$?
ALIAS_DPL="$(printf '%s\n' "$INSPECT_OUT" | awk '/^ *id\t/ && !seen { print $2; seen = 1 }')" || ALIAS_DPL=""
if [ "$INSPECT_RC" -ne 0 ]; then
  ALIAS_DPL="UNKNOWN"
  echo "  alias -> UNKNOWN (vercel inspect exited $INSPECT_RC — informational only; verification continues)"
elif [ -z "$ALIAS_DPL" ]; then
  ALIAS_DPL="UNKNOWN"
  echo "  alias -> UNKNOWN (no 'id' row in vercel inspect output — informational only; verification continues)"
else
  echo "  alias -> $ALIAS_DPL"
fi
if [ "$ALIAS_DPL" = "UNKNOWN" ]; then
  # The macOS keychain lines are Node reading system CAs (NODE_USE_SYSTEM_CA);
  # they are noise here and would crowd out the line that says what broke.
  printf '%s\n' "$INSPECT_OUT" | grep -v 'failed to copy trust settings' | tail -n 5 | sed 's/^/    | /' || true
fi

# 2. The site answers.
HTTP="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 https://helmsportslabs.com/ || echo 000)"
echo "  https://helmsportslabs.com/ -> $HTTP"

# 3. The release stamp reached the BUNDLE. It is inlined into the JS chunks,
#    never the HTML — grepping the page source finds nothing even on a correct
#    deploy (verified 2026-08-16, the stamp appeared in 2 of 32 chunks). So
#    sample chunks, not the document.
#
# No pipes into early-exiting readers here either. `curl | grep -q` — the
# previous shape — is the awk defect in miniature: grep -q hangs up on the
# first match, curl can then get EPIPE writing the rest and exit 23, and
# `pipefail` would report a FOUND stamp as a failed check. Each chunk goes to
# a file and is grepped from disk.
STAMPED=0
PAGE="$(curl -s --max-time 30 https://helmsportslabs.com/ || true)"
CHUNKS="$(printf '%s' "$PAGE" | grep -o '/_next/static/chunks/[^"]*\.js' | sort -u | awk 'NR <= 12')" || CHUNKS=""
CHUNK_TMP="$(mktemp)"
for c in $CHUNKS; do
  if curl -s --max-time 30 -o "$CHUNK_TMP" "https://helmsportslabs.com$c" && grep -q "$SHA" "$CHUNK_TMP"; then
    STAMPED=1
    break
  fi
done
rm -f "$CHUNK_TMP"
CHUNK_TMP=""

if [ "$HTTP" != "200" ] || [ "$STAMPED" != "1" ]; then
  VERIFY_VERDICT="not-verified"
  echo >&2
  echo "DEPLOY NOT VERIFIED." >&2
  echo "  http=$HTTP  release-stamp-found=$STAMPED  expected-sha=$SHORT" >&2
  echo "  A READY build whose alias never moved serves nobody. Investigate before" >&2
  echo "  treating $SHORT as live:  npm run release:status" >&2
  exit 1
fi

echo "  release stamp $SHORT found in the served bundle."

# Record the VERIFIED release so the session-start hook has an offline answer.
# Written only after the checks above passed, so this file means "proven
# live", never "we ran a deploy command". Gitignored: it is machine state, not
# repo state. Format: `<sha> <ISO-8601 UTC>` — the date is what lets a reader
# see how old the claim is; the hook labels an old marker as such.
#
# WRITTEN TO THE CANONICAL CHECKOUT, NOT JUST THE CWD. Deploys promote from a
# worktree pinned at the merged main SHA (AGENTS.md), and until 2026-09-01
# this wrote only `.claude/session-state/` under the cwd — the worktree's,
# which is retired minutes later — so the canonical marker sat at 53ae81a4c
# while production served fb425aa2b, and every session opened with "16
# unreleased commits" against a real figure of 1. `--git-common-dir` is the
# shared .git from any linked worktree; its parent is the canonical root.
STAMP="$SHA $(date -u +%Y-%m-%dT%H:%M:%SZ)"
CANON="$(cd "$(git rev-parse --git-common-dir)/.." 2>/dev/null && pwd -P)" || CANON=""
RECORDED=""
for root in "$CANON" "$(pwd -P)"; do
  [ -n "$root" ] && [ -d "$root" ] || continue
  case " $RECORDED " in *" $root/.claude/session-state/last-verified-release "*) continue ;; esac
  mkdir -p "$root/.claude/session-state" 2>/dev/null || true
  if printf '%s\n' "$STAMP" > "$root/.claude/session-state/last-verified-release" 2>/dev/null; then
    RECORDED="$RECORDED $root/.claude/session-state/last-verified-release"
  fi
done
echo "  recorded ->${RECORDED:- NOWHERE (marker could not be written; the session hook will re-probe)}"
VERIFY_VERDICT="verified"

echo
echo "✅ VERIFIED LIVE: production is serving $SHORT."
echo
echo "Reference — what was checked:"
echo "  1. vercel inspect helmsportslabs.com --scope $SCOPE"
echo "     The printed deployment id must equal the one above. A READY"
echo "     production build whose alias never moved serves nobody."
echo "  2. curl -s -o /dev/null -w '%{http_code}' https://helmsportslabs.com/"
echo "  3. Release stamp reached the BUNDLE (not the HTML — NEXT_PUBLIC_* is"
echo "     inlined into JS chunks, so grepping the page source finds nothing"
echo "     even on a correct deploy; verified 2026-08-16, 2 of 32 chunks):"
echo "       curl -s https://helmsportslabs.com/ \\"
echo "         | grep -o '/_next/static/chunks/[^\"]*\\.js' | sort -u \\"
echo "         | while read c; do curl -s \"https://helmsportslabs.com\$c\" \\"
echo "             | grep -q $SHA && echo \"stamp in \$c\"; done"
echo
echo "If the release tag still shows an older SHA, the build did not pick up"
echo "--build-env — do NOT assume the code is stale on that evidence alone."
echo
echo "FIRST RUN ONLY — confirm the var did NOT persist into project settings:"
echo "  vercel env ls production | grep NEXT_PUBLIC_SENTRY_RELEASE"
echo "Expect NO match. --env is per-deployment; a stored value would pin every"
echo "future deploy to $SHORT and turn this traceability fix into a permanent lie."
