-- #651 schema-drift reconcile — REVISED after deeper code-reference audit.
--
-- Original WS0.1 framing ("11 missing columns") undercounts this badly. The
-- whole 20260624000080_baseball_elite_stat_event_model.sql generation used
-- CREATE TABLE IF NOT EXISTS against 4 tables that already existed under an
-- older schema (baseball_stat_sources, baseball_catching_events,
-- baseball_fielding_events, baseball_baserunning_events) -- so for these 4,
-- the ENTIRE intended column set silently no-op'd, not just 1-2 columns each.
-- Confirmed by reading every .select()/.insert() call against these 4 tables
-- across stats-center.ts, engine-run.ts, stat-visuals.ts,
-- player-snapshot-cards.ts, loaders-events.ts, stat-event-imports.ts.
-- Only baseball_plate_appearances and baseball_decision_log are genuinely
-- narrow single/dual-column gaps (handled at the bottom of this file).
-- All 6 tables are EMPTY (0 rows) in prod -- every addition is backfill-free.
--
-- Amendments applied post-owner-review, on top of the original draft:
--   (a) baseball_fielding_events gets the code-expected column name
--       `throw_velocity` directly (not `throw_velocity_new`) -- decided:
--       the pre-existing `arm_velocity` column is a different metric (raw
--       arm strength vs. throw speed on a specific play) and is left
--       completely untouched; no rename, no naming question left open.
--   (b) baseball_stat_sources.name (legacy, previously NOT NULL with no
--       default) is relaxed to nullable via ALTER COLUMN ... DROP NOT NULL,
--       placed immediately after the stat_sources ADD COLUMN block below --
--       new-schema inserts target `source_name` (also added here) going
--       forward, so nothing needs to keep populating the legacy `name`.
--
-- Severity:
--   P0 ACTIVE TODAY: baseball_stat_sources -- resolveSourceId() /
--     resolveSourceIdReadonly() in stat-event-imports.ts .eq('source_key',...)
--     and .eq('source_name',...) 400 on EVERY event-import preview AND
--     commit (source_key doesn't exist live either -- this breaks the
--     read-only preview path too, not just the insert); the insert's other
--     6 fields (source_category, trust_tier, is_enabled, default_visibility,
--     requires_review, ai_can_use, expected_cadence_days, created_by) are
--     also all missing.
--   P0 ACTIVE TODAY: baseball_decision_log.detail -- Decision Room
--     "Resolve"/"Record decision note" inserts fail visibly.
--   P1 LATENT, dead-end reads only (no INSERT path exists anywhere in src/
--     for fielding/catching/baserunning/plate_appearances today; every read
--     site catches the error and returns an empty/degraded result, never
--     crashes): fielding_events (chance_difficulty, measured_at, arm_accuracy,
--     throw_velocity, data_context), catching_events (catcher_id, block_result,
--     steal_result, pop_time, throw_accuracy, data_context, measured_at),
--     baserunning_events (runner_id, home_to_first, data_context,
--     decision_quality, measured_at), plate_appearances (data_context).

-- ---------------------------------------------------------------------------
-- baseball_stat_sources (full reconcile -- live has name/source_type/
-- config_json/external_id_namespace/is_active/trust_level, a DIFFERENT older
-- schema; code needs the columns below, verbatim from the elite-stat-event
-- migration's spec)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_stat_sources
  ADD COLUMN IF NOT EXISTS source_key TEXT,
  ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS source_category TEXT,
  ADD COLUMN IF NOT EXISTS trust_tier TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_visibility TEXT NOT NULL DEFAULT 'staff_only',
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_can_use BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expected_cadence_days INTEGER,
  ADD COLUMN IF NOT EXISTS field_mapping_profile JSONB,
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- Amendment (b): relax the legacy `name` column so new-schema inserts (which
-- target source_name, not name) don't fail a NOT NULL they no longer need to
-- satisfy. Table confirmed empty -- no data loss.
--
-- Guarded: `name` only exists on prod's older baseball_stat_sources schema
-- (drift -- never created by the migration chain). A fresh database's
-- baseball_stat_sources (20260624000080_baseball_elite_stat_event_model.sql)
-- has no `name` column at all, so the bare ALTER COLUMN fails there with
-- "column \"name\" does not exist". Skip cleanly when absent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'baseball_stat_sources'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE public.baseball_stat_sources ALTER COLUMN name DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_source_key_check') THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT baseball_stat_sources_source_key_check
      CHECK (source_key IN (
        'manual', 'gamechanger_xml', 'statcrew_xml', 'ncaa_live_stats',
        'prestosports_xml', 'sidearm_xml', 'statbroadcast_xml',
        'trackman_csv', 'rapsodo_csv', 'yakkertech_csv', 'hittrax_csv',
        'pocket_radar_csv', 'blast_csv', 'diamond_kinetics_csv',
        'synergy_export', 'six_four_three_export', 'awre_video', 'onform_export',
        'armcare_csv', 'teambuildr_csv', 'teamworks_csv',
        'google_sheets', 'generic_csv', 'generic_xlsx', 'pdf_extract'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_source_category_check') THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT baseball_stat_sources_source_category_check
      CHECK (source_category IN (
        'official_game', 'player_development', 'tracking', 'video',
        'strength', 'academics', 'operations'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_trust_tier_check') THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT baseball_stat_sources_trust_tier_check
      CHECK (trust_tier IN ('official', 'verified_vendor', 'coach_reviewed', 'player_submitted', 'unverified', 'inferred'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_default_visibility_check') THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT baseball_stat_sources_default_visibility_check
      CHECK (default_visibility IN ('staff_only', 'player_visible', 'restricted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_baseball_stat_sources_team_key') THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT uq_baseball_stat_sources_team_key UNIQUE (team_id, source_key, source_name);
  END IF;
END $$;
-- source_key is intentionally nullable here (not NOT NULL like the original
-- spec) to guarantee this ALTER can never fail even if this ever runs against
-- a non-empty table by accident; flip to NOT NULL before relying on it if
-- Nick wants strict parity (safe today -- table has 0 rows).

-- ---------------------------------------------------------------------------
-- baseball_fielding_events (partial reconcile -- adds the 5 columns code
-- actually references beyond what already exists: chance_difficulty,
-- measured_at, arm_accuracy, throw_velocity, data_context)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_fielding_events
  ADD COLUMN IF NOT EXISTS chance_difficulty TEXT,
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arm_accuracy TEXT,
  ADD COLUMN IF NOT EXISTS throw_velocity NUMERIC,
  ADD COLUMN IF NOT EXISTS data_context TEXT NOT NULL DEFAULT 'official_game';
-- Amendment (a): the pre-existing "arm_velocity" column (raw arm strength) is
-- a different metric than the code-referenced "throw_velocity" (throw speed
-- on a specific play) -- left completely untouched, no rename.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_fielding_events_data_context_check') THEN
    ALTER TABLE public.baseball_fielding_events
      ADD CONSTRAINT baseball_fielding_events_data_context_check
      CHECK (data_context IN (
        'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
        'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- baseball_catching_events (partial reconcile -- adds the 7 columns code
-- references beyond what already exists under different names: catcher_id,
-- block_result, steal_result, pop_time, throw_accuracy, data_context,
-- measured_at. Existing player_id/blocking_result/pop_time_seconds/
-- caught_stealing/stolen_base_attempt/throw_velocity are left untouched --
-- additive only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_catching_events
  ADD COLUMN IF NOT EXISTS catcher_id UUID REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS block_result TEXT,
  ADD COLUMN IF NOT EXISTS steal_result TEXT,
  ADD COLUMN IF NOT EXISTS pop_time NUMERIC,
  ADD COLUMN IF NOT EXISTS throw_accuracy TEXT,
  ADD COLUMN IF NOT EXISTS data_context TEXT NOT NULL DEFAULT 'official_game',
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_catching_events_data_context_check') THEN
    ALTER TABLE public.baseball_catching_events
      ADD CONSTRAINT baseball_catching_events_data_context_check
      CHECK (data_context IN (
        'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
        'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- baseball_baserunning_events (partial reconcile -- adds the 5 columns code
-- references: runner_id, home_to_first, data_context, decision_quality,
-- measured_at. Existing player_id is left untouched -- additive only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_baserunning_events
  ADD COLUMN IF NOT EXISTS runner_id UUID REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS home_to_first NUMERIC,
  ADD COLUMN IF NOT EXISTS data_context TEXT NOT NULL DEFAULT 'official_game',
  ADD COLUMN IF NOT EXISTS decision_quality TEXT,
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_baserunning_events_data_context_check') THEN
    ALTER TABLE public.baseball_baserunning_events
      ADD CONSTRAINT baseball_baserunning_events_data_context_check
      CHECK (data_context IN (
        'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
        'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- baseball_plate_appearances (genuinely narrow -- already has import_run_id/
-- source_trust_level/source_visibility from a more modern migration; only
-- data_context is missing)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_plate_appearances
  ADD COLUMN IF NOT EXISTS data_context TEXT NOT NULL DEFAULT 'official_game';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_plate_appearances_data_context_check') THEN
    ALTER TABLE public.baseball_plate_appearances
      ADD CONSTRAINT baseball_plate_appearances_data_context_check
      CHECK (data_context IN (
        'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
        'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
      ));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- baseball_decision_log (genuinely narrow -- only detail is missing)
-- ---------------------------------------------------------------------------
ALTER TABLE public.baseball_decision_log
  ADD COLUMN IF NOT EXISTS detail TEXT;

-- Rollback (additive-only convention -- do not DROP COLUMN on shared prod DB;
-- all 6 tables are empty so a true DROP is low-risk if ever truly needed, but
-- prefer a follow-up migration dropping just the new CHECK/UNIQUE
-- constraints listed above; `name`'s NOT NULL relaxation is also harmless to
-- leave in place).
