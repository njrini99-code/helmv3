#!/usr/bin/env bash
# Vercel Ignored Build Step — disable automatic Git deployments.
#
# Vercel semantics:
#   exit 0 = skip/ignore this build
#   exit 1 = proceed with build
#
# Git-triggered builds expose VERCEL_GIT_COMMIT_REF, so pushes to every branch
# are ignored. Deployments started outside the Git integration (for example via
# the Vercel CLI) do not normally have that variable and are still allowed.
set -euo pipefail

branch="${VERCEL_GIT_COMMIT_REF:-}"
vercel_env="${VERCEL_ENV:-}"

echo "Vercel branch: ${branch:-unknown} | VERCEL_ENV: ${vercel_env:-unknown}"

if [ -n "$branch" ]; then
  echo "Git-triggered deployment detected; skipping automatic deployment."
  exit 0
fi

echo "No Git commit ref detected; allowing manually triggered deployment."
exit 1
