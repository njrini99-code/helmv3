#!/usr/bin/env bash
# Vercel Ignored Build Step — skip non-main branches to prevent preview deploy floods.
#
# Vercel semantics:
#   exit 0 = skip/ignore this build
#   exit 1 = proceed with build
#
# Wire in vercel.json as "ignoreCommand", or paste this script path into the
# Vercel dashboard: Project → Settings → Git → Ignored Build Step.
set -euo pipefail

branch="${VERCEL_GIT_COMMIT_REF:-}"
vercel_env="${VERCEL_ENV:-}"

echo "Vercel branch: ${branch:-unknown} | VERCEL_ENV: ${vercel_env:-unknown}"

# Fail-open for real production builds: if Vercel reports a production
# environment we always build, even when VERCEL_GIT_COMMIT_REF is empty
# (some deploy contexts — redeploys, CLI/promote, non-git triggers — omit the
# branch ref). Missing the production branch here would wrongly SKIP a
# production deploy, which is worse than an extra build.
if [ "$vercel_env" = "production" ]; then
  echo "Production environment detected; allowing Vercel build."
  exit 1
fi

case "$branch" in
  main)
    echo "Production branch detected; allowing Vercel build."
    exit 1
    ;;
  *)
    echo "Non-main branch detected; skipping Vercel preview build to prevent runaway billing."
    exit 0
    ;;
esac
