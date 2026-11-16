#!/usr/bin/env bash
# Vercel Ignored Build Step — second guard behind vercel.json.
#
# Vercel semantics:
#   exit 0 = skip/ignore this build
#   exit 1 = proceed with build
#
# vercel.json sets git.deploymentEnabled to false for every branch, so a push
# never creates a deployment in the first place. This script only decides
# what happens to deployments someone starts on purpose:
#
#   - CLI deploys carry no VERCEL_GIT_COMMIT_REF: allowed.
#   - Deploys started from the Git source through the Vercel API or connector
#     (create_deployment with gitSource) carry the branch: allowed only for a
#     production build of main, so what goes live is what is merged.
#   - Any other branch, or main as a preview: skipped (cost control).
set -euo pipefail

branch="${VERCEL_GIT_COMMIT_REF:-}"
vercel_env="${VERCEL_ENV:-}"

echo "Vercel branch: ${branch:-unknown} | VERCEL_ENV: ${vercel_env:-unknown}"

if [ -z "$branch" ]; then
  echo "No Git commit ref detected; allowing manually triggered deployment."
  exit 1
fi

if [ "$branch" = "main" ] && [ "$vercel_env" = "production" ]; then
  echo "Production build of main; allowing deployment."
  exit 1
fi

echo "Git deployment of '${branch}' (${vercel_env:-unknown}); skipping."
exit 0
