-- ============================================================================
-- Migration: 20260624000510_baseball_event_supersede.sql
-- Purpose: Close GAP 5 (event-import re-import corrections are not reversible).
--          The event commit path UPDATE-in-place when an (source_id, external id)
--          row already exists, deliberately omitting import_run_id so a later
--          rollback never removes another run's row — but that ALSO means the
--          overwrite is permanent: rollbackEventImport can only delete rows THIS
--          run created, never restore a value THIS run clobbered.
--
--          Fix = the SUPERSEDE-not-overwrite model. A correction INSERTs a new
--          event row stamped with the correcting run's import_run_id and marks the
--          prior row superseded_by_run_id = <this run> + superseded_at. Reads
--          filter `superseded_by_run_id IS NULL`. Rollback then deletes this run's
--          created rows AND un-supersedes the rows this run superseded — fully
--          reversible, never destructive (feedback_golf_no_destructive_writes).
--          This also yields the v9 "corrected/uncorrected" badge state for free.
--
-- Packet: qa-screens (Import Dossier + adapters — stats-integrations DEEPEN)
--
-- GUARDRAILS:
--   * ADDITIVE ONLY — ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--   * Columns added to the 3 event-grain tables the commit writer touches
--     (GRAIN_TO_TABLE: pitch / batted_ball / swing).
--   * Sport-prefixed names only (baseball_*). No new RLS surface (same tables).
-- ============================================================================

-- ── Pitch events ────────────────────────────────────────────────────────────
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS superseded_by_run_id UUID
    REFERENCES baseball_import_runs(id) ON DELETE SET NULL;
ALTER TABLE baseball_pitch_events
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

-- ── Batted-ball events ──────────────────────────────────────────────────────
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS superseded_by_run_id UUID
    REFERENCES baseball_import_runs(id) ON DELETE SET NULL;
ALTER TABLE baseball_batted_ball_events
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

-- ── Swing events ────────────────────────────────────────────────────────────
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS superseded_by_run_id UUID
    REFERENCES baseball_import_runs(id) ON DELETE SET NULL;
ALTER TABLE baseball_swing_events
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

-- Partial indexes: reads filter to the CURRENT (non-superseded) row per grain,
-- and rollback finds the rows a given run superseded. Both predicates are partial
-- so the index stays small (most rows are never superseded).
CREATE INDEX IF NOT EXISTS idx_baseball_pitch_events_current
  ON baseball_pitch_events(team_id, pitcher_id)
  WHERE superseded_by_run_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_baseball_pitch_events_superseded_by
  ON baseball_pitch_events(superseded_by_run_id)
  WHERE superseded_by_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_batted_ball_events_current
  ON baseball_batted_ball_events(team_id, batter_id)
  WHERE superseded_by_run_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_baseball_batted_ball_events_superseded_by
  ON baseball_batted_ball_events(superseded_by_run_id)
  WHERE superseded_by_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_baseball_swing_events_current
  ON baseball_swing_events(team_id, player_id)
  WHERE superseded_by_run_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_baseball_swing_events_superseded_by
  ON baseball_swing_events(superseded_by_run_id)
  WHERE superseded_by_run_id IS NOT NULL;

-- ── ROLLBACK (manual) ───────────────────────────────────────────────────────
--   drop index if exists idx_baseball_pitch_events_current;
--   drop index if exists idx_baseball_pitch_events_superseded_by;
--   drop index if exists idx_baseball_batted_ball_events_current;
--   drop index if exists idx_baseball_batted_ball_events_superseded_by;
--   drop index if exists idx_baseball_swing_events_current;
--   drop index if exists idx_baseball_swing_events_superseded_by;
--   alter table baseball_pitch_events       drop column if exists superseded_by_run_id, drop column if exists superseded_at;
--   alter table baseball_batted_ball_events drop column if exists superseded_by_run_id, drop column if exists superseded_at;
--   alter table baseball_swing_events       drop column if exists superseded_by_run_id, drop column if exists superseded_at;
-- ============================================================================
-- END migration 20260624000510_baseball_event_supersede.sql
-- ============================================================================
