#!/usr/bin/env bash
# Start the local Supabase stack, retrying when ghcr.io rate-limits the pulls.
#
# `supabase start` pulls ~12 images in parallel. When several PRs start the
# stack at once, ghcr.io answers `toomanyrequests` (a burst limit, even for
# authenticated pulls) and the CLI gives up after its own short retries.
# Images that did pull stay in the local Docker cache, so each attempt pulls
# fewer images and the burst shrinks. A failure that is not a rate limit
# (e.g. a broken migration) fails on the first attempt, unretried.
#
# Arguments are passed through to `supabase start` on every attempt, e.g.
# `-x studio,realtime,...` so a job pulls only the containers it uses (fewer
# pulls, smaller rate-limit burst — ci.yml's Supabase job, 2026-09-23).
set -uo pipefail

# A rate limit can pin one image: every other image pulls, but ghcr.io keeps
# refusing the same image's config blob on every attempt. Before retrying,
# pull each image the CLI gave up on from a mirror (the same supabase/*
# image on public.ecr.aws or Docker Hub) and tag it with the ghcr.io name the
# CLI asks for; `supabase start` uses an image already in the local cache.
pull_from_mirror() {
  local ref="$1" rest="${1#ghcr.io/}" mirror
  for mirror in "public.ecr.aws/${rest}" "docker.io/${rest}"; do
    if docker pull --quiet "$mirror" >/dev/null 2>&1 && docker tag "$mirror" "$ref"; then
      echo "::notice::pulled ${ref} from mirror ${mirror}"
      return 0
    fi
  done
  echo "::warning::no mirror served ${ref}"
  return 1
}

attempts=4
log="$(mktemp)"
trap 'rm -f "$log"' EXIT

for ((i = 1; i <= attempts; i++)); do
  supabase start "$@" 2>&1 | tee "$log"
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
  grep -oE 'failed to pull docker image from all registries: ghcr\.io/supabase/[a-z0-9._-]+:[A-Za-z0-9._-]+' "$log" \
    | sed 's/.*registries: //' | sort -u | while read -r ref; do pull_from_mirror "$ref" || true; done
  sleep "$delay"
done
