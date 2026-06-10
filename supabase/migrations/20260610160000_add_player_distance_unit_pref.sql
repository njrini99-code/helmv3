-- Migration: add distance_unit_preference column to golf_players
--
-- Adds a per-player display-only preference for distance units.
-- DB storage is UNCHANGED: all distances stay in yards/feet as before.
-- This column is purely a display hint for the player-facing UI.
--
-- Default: 'yards'  (backwards-compatible; no existing rows are affected)
-- NOTE: Do NOT grant this column to anon; it is player-private data.
-- NOTE: Do NOT apply this migration manually — the orchestrator applies it
--       via MCP (supabase apply_migration).

ALTER TABLE golf_players
  ADD COLUMN IF NOT EXISTS distance_unit_preference text
    NOT NULL DEFAULT 'yards'
    CHECK (distance_unit_preference IN ('yards', 'meters'));

COMMENT ON COLUMN golf_players.distance_unit_preference IS
  'Player display preference for distance units: yards (default) or meters. '
  'DB storage (shots, holes, stats) is always in canonical yards/feet — '
  'this column is a UI hint only.';
