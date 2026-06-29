#!/usr/bin/env bash
# Poll the Vercel API for the preview deployment matching CIRCLE_SHA1
# until it's READY (or timeout). On success, echoes the full URL.
#
# Required env:
#   VERCEL_TOKEN       — API token from https://vercel.com/account/tokens
#                        (Project Settings > Environment Variables in CircleCI)
#   VERCEL_PROJECT_ID  — from .vercel/project.json
#   CIRCLE_SHA1        — auto-provided by CircleCI
#
# Optional env:
#   VERCEL_TEAM_ID     — if the project lives under a team scope
#   POLL_TIMEOUT_S     — default 600 (10 min); Vercel previews usually
#                        finish in 1-3 min
#   POLL_INTERVAL_S    — default 10
#
# Exits non-zero with a useful message on timeout or API error. If CircleCI is
# not configured with Vercel credentials yet, exits zero with no stdout so the
# caller can skip the advisory Lighthouse run without blocking the PR.
# Designed to be source'd OR run with `eval $(...)` to set
# PREVIEW_URL in the calling shell. Standalone use: `bash this | tail -1`.
#
# SECURITY NOTE: VERCEL_TOKEN is a bearer credential — handle it like
# a password. Don't echo it. Don't write it to logs.

set -euo pipefail

if [[ -z "${VERCEL_TOKEN:-}" || -z "${VERCEL_PROJECT_ID:-}" ]]; then
  echo "Skipping Lighthouse preview: VERCEL_TOKEN or VERCEL_PROJECT_ID is not configured in CircleCI." >&2
  exit 0
fi

if [[ -z "${CIRCLE_SHA1:-}" ]]; then
  echo "Skipping Lighthouse preview: CIRCLE_SHA1 is not set." >&2
  exit 0
fi

POLL_TIMEOUT_S="${POLL_TIMEOUT_S:-600}"
POLL_INTERVAL_S="${POLL_INTERVAL_S:-10}"
TEAM_QUERY=""
if [[ -n "${VERCEL_TEAM_ID:-}" ]]; then
  TEAM_QUERY="&teamId=${VERCEL_TEAM_ID}"
fi

API="https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=20${TEAM_QUERY}"
START_TS=$(date +%s)

echo "Polling Vercel for preview at SHA ${CIRCLE_SHA1:0:7} (timeout: ${POLL_TIMEOUT_S}s)…" >&2

while true; do
  ELAPSED=$(( $(date +%s) - START_TS ))
  if (( ELAPSED > POLL_TIMEOUT_S )); then
    echo "Timeout after ${ELAPSED}s waiting for Vercel preview." >&2
    exit 1
  fi

  RESPONSE=$(curl -fsS -H "Authorization: Bearer ${VERCEL_TOKEN}" "$API") || {
    echo "Vercel API call failed (transient?). Retrying in ${POLL_INTERVAL_S}s." >&2
    sleep "$POLL_INTERVAL_S"
    continue
  }

  # Find the deployment whose meta.githubCommitSha matches CIRCLE_SHA1
  # AND whose state is READY. jq's `select` returns the first match.
  MATCH=$(echo "$RESPONSE" | jq -r --arg sha "$CIRCLE_SHA1" '
    [.deployments[]
      | select(.meta.githubCommitSha == $sha)
    ][0] // empty
  ')

  if [[ -z "$MATCH" || "$MATCH" == "null" ]]; then
    echo "No Vercel deployment yet for SHA ${CIRCLE_SHA1:0:7} (elapsed ${ELAPSED}s)…" >&2
    sleep "$POLL_INTERVAL_S"
    continue
  fi

  STATE=$(echo "$MATCH" | jq -r '.state')
  URL=$(echo "$MATCH" | jq -r '.url')

  case "$STATE" in
    READY)
      echo "Preview READY at https://${URL} (elapsed ${ELAPSED}s)." >&2
      # stdout is the URL only — caller captures with $(...)
      echo "https://${URL}"
      exit 0
      ;;
    ERROR|CANCELED)
      echo "Vercel deployment ${STATE} — see Vercel dashboard." >&2
      exit 1
      ;;
    *)
      # BUILDING, QUEUED, INITIALIZING, etc.
      echo "Vercel state=${STATE} for ${URL} (elapsed ${ELAPSED}s) — polling…" >&2
      sleep "$POLL_INTERVAL_S"
      ;;
  esac
done
