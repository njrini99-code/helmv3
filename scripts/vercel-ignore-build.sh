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

echo "Vercel branch: ${branch:-unknown}"

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
