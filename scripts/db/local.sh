#!/usr/bin/env bash
# scripts/db/local.sh — bring up the local Supabase/Postgres stack that
# mirrors production (D1, Helm Database Plan).
#
# WHAT THIS DOES
#   1. `supabase start`            — boots the local Docker stack.
#   2. poll `supabase status`      — wait until the API is actually answering
#                                    rather than trusting `start`'s own exit.
#   3. `supabase db reset`         — replays every migration in
#                                    supabase/migrations/ plus the seed files
#                                    named in supabase/config.toml's
#                                    [db.seed].sql_paths (includes the
#                                    scrubbed prod sample when present).
#   4. print the Studio URL and the NAMES of the env vars to set — never
#      values. Copy the actual values from `supabase status` yourself.
#
# Never prints a key, token, or connection string.
#
# Flags:
#   --reset     force `supabase db reset` even if the stack is already up
#   --no-seed   passes `--no-seed` through to `supabase db reset` (migrations
#               replay, seed files do not load)
#   --stop      stop the stack (`supabase stop`) and exit
#
# npm scripts: db:local, db:local:stop

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

SUPABASE_CLI="./node_modules/.bin/supabase"
DO_RESET=0
NO_SEED=0
DO_STOP=0

for arg in "$@"; do
  case "$arg" in
    --reset) DO_RESET=1 ;;
    --no-seed) NO_SEED=1 ;;
    --stop) DO_STOP=1 ;;
    *)
      echo "scripts/db/local.sh: unknown flag '$arg' (known: --reset --no-seed --stop)" >&2
      exit 2
      ;;
  esac
done

if [ ! -x "$SUPABASE_CLI" ]; then
  echo "Repository Supabase CLI not found at $SUPABASE_CLI — run npm install first." >&2
  exit 1
fi

if [ "$DO_STOP" -eq 1 ]; then
  echo "Stopping local Supabase stack..."
  "$SUPABASE_CLI" stop
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not reachable. Start Docker Desktop and try again." >&2
  exit 1
fi

START_TS=$(date +%s)

ALREADY_UP=0
if "$SUPABASE_CLI" status >/dev/null 2>&1; then
  ALREADY_UP=1
fi

echo "Starting local Supabase stack (supabase start)..."
"$SUPABASE_CLI" start >/dev/null

echo "Waiting for the API to answer..."
READY=0
for _ in $(seq 1 40); do
  if "$SUPABASE_CLI" status >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 3
done

if [ "$READY" -ne 1 ]; then
  echo "Local Supabase stack did not become ready in time." >&2
  exit 1
fi

RESET_ARGS=()
if [ "$NO_SEED" -eq 1 ]; then
  RESET_ARGS+=(--no-seed)
fi

if [ "$ALREADY_UP" -eq 1 ] && [ "$DO_RESET" -ne 1 ]; then
  echo "Stack was already running — skipping db reset (pass --reset to force a fresh replay)."
else
  echo "Replaying migrations (supabase db reset)..."
  "$SUPABASE_CLI" db reset "${RESET_ARGS[@]}"
fi

END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

STATUS_OUT="$("$SUPABASE_CLI" status 2>/dev/null || true)"
STUDIO_URL="$(printf '%s\n' "$STATUS_OUT" | grep -i 'Studio URL' | awk '{print $NF}')"

echo ""
echo "Local Supabase stack is up (${ELAPSED}s)."
if [ -n "$STUDIO_URL" ]; then
  echo "Studio: $STUDIO_URL"
fi
echo ""
echo "Set these env vars in .env.local (copy VALUES from 'supabase status' — never printed here):"
echo "  NEXT_PUBLIC_SUPABASE_URL"
echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY   (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"
echo ""
echo "Run: ./node_modules/.bin/supabase status   to see the values."
