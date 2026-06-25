-- ============================================================================
-- Migration: 20260624000020_baseball_import_lineage.sql
-- Purpose: Source-registry import lineage for BaseballHelm stat ingestion.
--          Tracks each import run (file -> rows -> commit/rollback) and the
--          external-system id mapping used to match incoming rows to players.
-- Wave 1 / packet: source-registry (stats-integrations)
--
-- GUARDRAILS:
--   * ADDITIVE ONLY (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--     DROP POLICY IF EXISTS then CREATE POLICY). Safe on a live DB.
--   * RLS enabled on every new table with team-scoped staff policies that
--     mirror the existing baseball_* pattern (is_baseball_team_coach).
--   * No GRANT to anon. Service role bypasses RLS by design.
--   * Sport-prefixed names only (baseball_*).
-- ============================================================================

-- ============================================================================
-- SECTION 1: baseball_import_runs
--   One row per ingest attempt. Lineage from uploaded file through commit /
--   rollback so a coach can audit and undo a stat import.
-- ============================================================================

CREATE TABLE IF NOT EXISTS baseball_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  -- Provenance contract (v2_data_contracts_expanded.md:40-64): source_label is a
  -- REQUIRED human label for every run, never null. A run with no source label is
  -- un-auditable, which the contract forbids.
  source_label TEXT NOT NULL DEFAULT '',
  -- import_type: the kind of object this run ingested (stats, roster, lifting...).
  -- Contract-required so the duplicate-file warning can be scoped per import kind
  -- (a stats CSV and a roster CSV that happen to hash the same are distinct runs).
  import_type TEXT NOT NULL DEFAULT 'stats',
  file_name TEXT,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'parsing', 'matching', 'review', 'committed', 'rolled_back', 'failed'
  )),
  total_rows INTEGER NOT NULL DEFAULT 0,
  matched_rows INTEGER NOT NULL DEFAULT 0,
  unmatched_rows INTEGER NOT NULL DEFAULT 0,
  -- Validation tallies (contract-required): how many parsed rows were valid vs.
  -- carried a warning vs. a hard error, so the run header is queryable without
  -- scanning every baseball_import_rows child.
  valid_row_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  -- created_by is contract-required NOT NULL: every run is attributable to the
  -- staff member who started it (the RLS insert policy already proves they are a
  -- coach of team_id; this records WHICH coach for the audit trail).
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_baseball_import_runs_team
  ON baseball_import_runs(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_import_runs_source
  ON baseball_import_runs(source_id);
CREATE INDEX IF NOT EXISTS idx_baseball_import_runs_status
  ON baseball_import_runs(status);

-- ============================================================================
-- SECTION 2: baseball_player_external_ids
--   Maps an external source's player id to an internal baseball_players.id so
--   future imports can match deterministically. Unique per (source, ext id).
-- ============================================================================

-- NOTE on column naming: the contract (v2_data_contracts_expanded.md:17-38) names
-- the source-identifier column `source`; the implemented column (and all code that
-- references it) is `source_id`. They are the same concept — the source-system
-- identifier — so we keep the implemented, code-referenced `source_id` name and
-- reconcile the CONSTRAINT that actually carries the contract's correctness intent:
-- the unique key must be TEAM-SCOPED so the same external id can legitimately exist
-- for two different teams' players without colliding.
CREATE TABLE IF NOT EXISTS baseball_player_external_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- team_id (contract-required NOT NULL): scopes the external-id map to a team so
  -- the same vendor external id can map to a player on team A and a different
  -- player on team B without a cross-team UNIQUE collision.
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  -- source_display_name (contract): the human-readable source name shown in the
  -- match UI ("GameChanger", "TrackMan") alongside the opaque source_id.
  source_display_name TEXT,
  confidence NUMERIC DEFAULT 1.0,
  -- verified (contract): whether a coach explicitly confirmed this mapping (vs. an
  -- auto-resolved/inferred one), so the match UI can distinguish trusted links.
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  -- Contract unique key (v2_data_contracts_expanded.md:37): TEAM-scoped, replacing
  -- the cross-team-colliding UNIQUE(source_id, external_id).
  CONSTRAINT unique_baseball_player_external_id UNIQUE (team_id, source_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_baseball_player_external_ids_player
  ON baseball_player_external_ids(player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_player_external_ids_source
  ON baseball_player_external_ids(source_id);
-- Contract index (v2_data_contracts_expanded.md:38): (team_id, player_id) for the
-- team-scoped "all external ids for this player" lookup the match path runs.
CREATE INDEX IF NOT EXISTS idx_baseball_player_external_ids_team_player
  ON baseball_player_external_ids(team_id, player_id);

-- ============================================================================
-- SECTION 3: RLS — baseball_import_runs (team-scoped staff)
--   Mirrors existing baseball_* team-management tables: staff (coach/staff of
--   the team) get full read/write via is_baseball_team_coach(team_id).
-- ============================================================================

ALTER TABLE baseball_import_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_import_runs_select" ON baseball_import_runs;
CREATE POLICY "baseball_import_runs_select" ON baseball_import_runs
  FOR SELECT TO authenticated
  USING (is_baseball_team_coach(team_id));

DROP POLICY IF EXISTS "baseball_import_runs_insert" ON baseball_import_runs;
CREATE POLICY "baseball_import_runs_insert" ON baseball_import_runs
  FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));

DROP POLICY IF EXISTS "baseball_import_runs_update" ON baseball_import_runs;
CREATE POLICY "baseball_import_runs_update" ON baseball_import_runs
  FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id))
  WITH CHECK (is_baseball_team_coach(team_id));

DROP POLICY IF EXISTS "baseball_import_runs_delete" ON baseball_import_runs;
CREATE POLICY "baseball_import_runs_delete" ON baseball_import_runs
  FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));

-- ============================================================================
-- SECTION 4: RLS — baseball_player_external_ids (team-scoped staff via player)
--   baseball_players has NO direct team_id column; player<->team membership is
--   modeled by baseball_team_members(team_id, player_id, status). Scope staff
--   access through that membership table using the same is_baseball_team_coach
--   guard the rest of the baseball_* schema uses.
-- ============================================================================

ALTER TABLE baseball_player_external_ids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_player_external_ids_select" ON baseball_player_external_ids;
CREATE POLICY "baseball_player_external_ids_select" ON baseball_player_external_ids
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_team_members tm
      WHERE tm.player_id = baseball_player_external_ids.player_id
        AND is_baseball_team_coach(tm.team_id)
    )
  );

DROP POLICY IF EXISTS "baseball_player_external_ids_insert" ON baseball_player_external_ids;
CREATE POLICY "baseball_player_external_ids_insert" ON baseball_player_external_ids
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM baseball_team_members tm
      WHERE tm.player_id = baseball_player_external_ids.player_id
        AND is_baseball_team_coach(tm.team_id)
    )
  );

DROP POLICY IF EXISTS "baseball_player_external_ids_update" ON baseball_player_external_ids;
CREATE POLICY "baseball_player_external_ids_update" ON baseball_player_external_ids
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_team_members tm
      WHERE tm.player_id = baseball_player_external_ids.player_id
        AND is_baseball_team_coach(tm.team_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM baseball_team_members tm
      WHERE tm.player_id = baseball_player_external_ids.player_id
        AND is_baseball_team_coach(tm.team_id)
    )
  );

DROP POLICY IF EXISTS "baseball_player_external_ids_delete" ON baseball_player_external_ids;
CREATE POLICY "baseball_player_external_ids_delete" ON baseball_player_external_ids
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM baseball_team_members tm
      WHERE tm.player_id = baseball_player_external_ids.player_id
        AND is_baseball_team_coach(tm.team_id)
    )
  );

-- ============================================================================
-- SECTION 5: CONVERGENCE — tighten an already-applied (looser) table to the
--   data contract WITHOUT breaking a live DB.
--
--   The CREATE TABLE blocks above only define the contract-correct shape for a
--   FRESH install. On a DB where the older, looser table was already created
--   (nullable source_label / no import_type / nullable created_by / missing
--   count columns / cross-team-colliding unique key), CREATE TABLE IF NOT EXISTS
--   is a no-op — so we converge the existing table here. Every step is ADDITIVE
--   and BACKFILL-SAFE (ADD COLUMN IF NOT EXISTS; backfill before SET NOT NULL;
--   guarded constraint swap that aborts cleanly if real data would violate it),
--   so it is safe to re-run and safe on the shared GolfHelm production DB.
-- ============================================================================

-- ── baseball_import_runs: add the contract columns if missing ───────────────
ALTER TABLE baseball_import_runs
  ADD COLUMN IF NOT EXISTS import_type TEXT NOT NULL DEFAULT 'stats';
ALTER TABLE baseball_import_runs
  ADD COLUMN IF NOT EXISTS valid_row_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE baseball_import_runs
  ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE baseball_import_runs
  ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0;

-- Backfill, then enforce NOT NULL on source_label (contract: required label).
UPDATE baseball_import_runs
  SET source_label = COALESCE(NULLIF(source_label, ''), source_id, 'unknown')
  WHERE source_label IS NULL OR source_label = '';
ALTER TABLE baseball_import_runs
  ALTER COLUMN source_label SET DEFAULT '';
ALTER TABLE baseball_import_runs
  ALTER COLUMN source_label SET NOT NULL;

-- created_by: enforce NOT NULL only when no legacy NULLs remain. A guarded block
-- so a live DB with pre-existing attributable-only-to-service rows is not broken
-- by a hard failure — instead the column stays nullable and the gap is logged.
DO $$
DECLARE
  null_creators INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_creators
    FROM baseball_import_runs WHERE created_by IS NULL;
  IF null_creators = 0 THEN
    ALTER TABLE baseball_import_runs ALTER COLUMN created_by SET NOT NULL;
  ELSE
    RAISE NOTICE 'baseball_import_runs: % run(s) have NULL created_by; leaving column nullable (backfill creator then re-run to enforce contract NOT NULL).', null_creators;
  END IF;
END $$;

-- ── baseball_player_external_ids: add the contract columns if missing ───────
ALTER TABLE baseball_player_external_ids
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES baseball_teams(id) ON DELETE CASCADE;
ALTER TABLE baseball_player_external_ids
  ADD COLUMN IF NOT EXISTS source_display_name TEXT;
ALTER TABLE baseball_player_external_ids
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE baseball_player_external_ids
  ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE baseball_player_external_ids
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Backfill team_id from the player's team membership (the only team a player's
-- external-id map can belong to). Where a player maps to exactly one team, that
-- is unambiguous; rows that cannot be resolved stay NULL and the NOT NULL is
-- left unenforced (logged) rather than failing the live migration.
UPDATE baseball_player_external_ids e
  SET team_id = tm.team_id
  FROM baseball_team_members tm
  WHERE e.team_id IS NULL
    AND tm.player_id = e.player_id
    AND tm.team_id = (
      SELECT m2.team_id FROM baseball_team_members m2
      WHERE m2.player_id = e.player_id
      GROUP BY m2.team_id
      HAVING COUNT(*) = 1
      LIMIT 1
    );

DO $$
DECLARE
  null_teams INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_teams
    FROM baseball_player_external_ids WHERE team_id IS NULL;
  IF null_teams = 0 THEN
    ALTER TABLE baseball_player_external_ids ALTER COLUMN team_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'baseball_player_external_ids: % row(s) have an unresolved team_id; leaving column nullable (backfill team then re-run to enforce contract NOT NULL).', null_teams;
  END IF;
END $$;

-- Reconcile the unique key to the contract's TEAM-scoped form. Guarded: only swap
-- when team_id is fully populated AND no real cross-team duplicate would break the
-- new key (so a live DB is never left without a working uniqueness guard).
DO $$
DECLARE
  has_team_scoped BOOLEAN;
  null_teams INTEGER;
  dup_rows INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_baseball_player_external_id'
      AND conrelid = 'baseball_player_external_ids'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%team_id%'
  ) INTO has_team_scoped;

  IF has_team_scoped THEN
    RETURN; -- fresh install already created the team-scoped key
  END IF;

  SELECT COUNT(*) INTO null_teams
    FROM baseball_player_external_ids WHERE team_id IS NULL;
  SELECT COUNT(*) INTO dup_rows FROM (
    SELECT 1 FROM baseball_player_external_ids
    WHERE team_id IS NOT NULL
    GROUP BY team_id, source_id, external_id HAVING COUNT(*) > 1
  ) d;

  IF null_teams = 0 AND dup_rows = 0 THEN
    ALTER TABLE baseball_player_external_ids
      DROP CONSTRAINT IF EXISTS unique_baseball_player_external_id;
    ALTER TABLE baseball_player_external_ids
      ADD CONSTRAINT unique_baseball_player_external_id
      UNIQUE (team_id, source_id, external_id);
  ELSE
    RAISE NOTICE 'baseball_player_external_ids: cannot swap to team-scoped UNIQUE yet (% null team_id, % cross-team dup group(s)); leaving (source_id, external_id) key in place.', null_teams, dup_rows;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_baseball_player_external_ids_team_player
  ON baseball_player_external_ids(team_id, player_id);

-- ============================================================================
-- END migration 20260624000020_baseball_import_lineage.sql
-- ============================================================================
