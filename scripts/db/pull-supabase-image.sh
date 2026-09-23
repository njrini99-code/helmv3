#!/usr/bin/env bash
# Put one supabase/* image into the local Docker cache under its ghcr.io name.
#
# `supabase test db` pulls ghcr.io/supabase/pg_prove itself, outside
# supabase-start-with-retry.sh, and ghcr.io's rate limit can refuse that
# pull outright. Try ghcr.io, then the same image on public.ecr.aws and
# Docker Hub, tagging a mirror hit with the ghcr.io name; the CLI then uses
# the cached image. Exits non-zero only if no registry served it.
#
# Usage: pull-supabase-image.sh ghcr.io/supabase/<image>:<tag>
set -uo pipefail

ref="${1:?usage: pull-supabase-image.sh ghcr.io/supabase/<image>:<tag>}"
rest="${ref#ghcr.io/}"

if docker image inspect "$ref" >/dev/null 2>&1; then
  exit 0
fi
for i in 1 2; do
  if docker pull --quiet "$ref" >/dev/null 2>&1; then
    exit 0
  fi
  sleep $((i * 10))
done
for mirror in "public.ecr.aws/${rest}" "docker.io/${rest}"; do
  if docker pull --quiet "$mirror" >/dev/null 2>&1 && docker tag "$mirror" "$ref"; then
    echo "::notice::pulled ${ref} from mirror ${mirror}"
    exit 0
  fi
done
echo "::warning::no registry served ${ref}"
exit 1
