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
vercel deploy --prod --yes \
  --scope "$SCOPE" \
  --build-env "NEXT_PUBLIC_SENTRY_RELEASE=$SHA" \
  --env "NEXT_PUBLIC_SENTRY_RELEASE=$SHA"

echo
echo "Deployed. READY is not LIVE — verify all three before trusting it:"
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
