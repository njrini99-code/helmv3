#!/usr/bin/env bash
# Regenerate src/lib/types/database.ts from the live Supabase schema.
#
# WHY THIS SCRIPT EXISTS (2026-07-25)
# -----------------------------------
# `db:types` used to be a bare npm script:
#
#     npx supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/lib/types/database.ts
#
# That has a destructive failure mode. The shell performs the `>` redirect
# BEFORE running the command, so `database.ts` is truncated to zero bytes
# immediately — and then, if $SUPABASE_PROJECT_ID is unset (it is not exported
# in a plain shell; only the commit hook and CI set it), the CLI errors out and
# never writes anything back. The result is a one-line/empty `database.ts`, a
# repo-wide tsc failure, and a confusing diff. This was hit for real on
# 2026-07-25 while regenerating types for PR #1051.
#
# This script fixes both halves:
#   1. Resolve the project id the same way scripts/apply-migration.sh does
#      (env → .env.local → derive from NEXT_PUBLIC_SUPABASE_URL) and FAIL LOUDLY
#      before touching the output file.
#   2. Generate into a temp file and only move it into place after the CLI
#      succeeds AND the output looks like real type output — so a network
#      blip or an auth error can never leave a truncated file behind.

set -euo pipefail

OUT="src/lib/types/database.ts"

# ── Resolve the project id (mirrors scripts/apply-migration.sh) ──────────────
if [ -z "${SUPABASE_PROJECT_ID:-}" ]; then
  if [ -f .env.local ]; then
    SUPABASE_PROJECT_ID=$(grep -E "^SUPABASE_PROJECT_ID=" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ' || true)

    if [ -z "$SUPABASE_PROJECT_ID" ]; then
      SUPABASE_URL=$(grep -E "^NEXT_PUBLIC_SUPABASE_URL=" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ' || true)
      if [ -n "$SUPABASE_URL" ]; then
        SUPABASE_PROJECT_ID=$(echo "$SUPABASE_URL" | sed -n 's/.*https:\/\/\([^.]*\)\.supabase\.co.*/\1/p')
      fi
    fi
  fi

  if [ -z "${SUPABASE_PROJECT_ID:-}" ]; then
    echo "❌ SUPABASE_PROJECT_ID not found — refusing to run."
    echo "   $OUT has NOT been modified."
    echo "   Set it in .env.local, export it, or pass --project-id explicitly:"
    echo "     npx supabase gen types typescript --project-id <id> > $OUT"
    exit 1
  fi
fi

echo "🔑 Generating types with project id: ${SUPABASE_PROJECT_ID:0:10}…"

# ── Generate to a temp file; only replace $OUT on success ────────────────────
TMP=$(mktemp -t database-types)
trap 'rm -f "$TMP"' EXIT

if ! npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > "$TMP"; then
  echo "❌ supabase gen types failed — $OUT left untouched."
  exit 1
fi

# Sanity-check the payload before overwriting a file the whole repo compiles
# against. A truncated or error-page response is short and lacks the export.
if [ "$(wc -c < "$TMP" | tr -d ' ')" -lt 1000 ] || ! grep -q "export type Database" "$TMP"; then
  echo "❌ Generated output does not look like Supabase types (too short, or no"
  echo "   'export type Database'). $OUT left untouched. First lines received:"
  head -5 "$TMP"
  exit 1
fi

mv "$TMP" "$OUT"
trap - EXIT
echo "✅ Wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') lines)"
