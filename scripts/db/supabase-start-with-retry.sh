#!/usr/bin/env bash
# Start the local Supabase stack, retrying when ghcr.io rate-limits the pulls.
#
# `supabase start` pulls ~12 images in parallel. When several PRs start the
# stack at once, ghcr.io answers `toomanyrequests` (a burst limit, even for
# authenticated pulls) and the CLI gives up after its own short retries.
# Images that did pull stay in the local Docker cache, so each attempt pulls
# fewer images and the burst shrinks. A failure that is not a rate limit
# (e.g. a broken migration) fails on the first attempt, unretried.
set -uo pipefail

attempts=4
log="$(mktemp)"
trap 'rm -f "$log"' EXIT

for ((i = 1; i <= attempts; i++)); do
  supabase start 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  if [[ $status -eq 0 ]]; then
    exit 0
  fi
  if ! grep -q 'toomanyrequests' "$log"; then
    exit "$status"
  fi
  if [[ $i -eq $attempts ]]; then
    echo "::error::supabase start still rate-limited by ghcr.io after ${attempts} attempts"
    exit "$status"
  fi
  delay=$((i * 30))
  echo "::warning::ghcr.io rate-limited supabase start (attempt ${i}/${attempts}); retrying in ${delay}s"
  supabase stop --no-backup >/dev/null 2>&1 || true
  sleep "$delay"
done
