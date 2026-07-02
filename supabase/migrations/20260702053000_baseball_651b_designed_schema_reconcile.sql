-- #651b: complete the designed elite-stat-event schema on the 3 tables where
-- 20260624000080_baseball_elite_stat_event_model.sql's `CREATE TABLE IF NOT
-- EXISTS` silently no-op'd because the table already existed under an older
-- schema — baseball_stat_sources, baseball_catching_events,
-- baseball_baserunning_events. (baseball_pitch_events / batted_ball_events /
-- swing_events were genuinely new and got the full designed schema
-- correctly; baseball_fielding_events / plate_appearances / the practice-
-- effectiveness/decision-log columns are handled in the narrower #651a
-- migration since they have no column-NAME mismatches — only these 3 tables
-- do.)
--
-- DECISION (owner-approved): Option 1 — add the full designed column set
-- additively, backfill new columns from their legacy equivalents where a
-- clean mapping exists, and leave every legacy column in place untouched
-- (harmless, flagged here for eventual deprecation once the dual-write in
-- stat-event-imports.ts has been live long enough that nothing still reads
-- the legacy names). Rejected Option 2 (rewrite the 5 read-model/action
-- files to query the legacy names instead) because the code already needs
-- trust-layer columns — data_context/trust_tier/visibility/source_id — that
-- have NO legacy equivalent at all on these 3 tables, so Option 2 would still
-- require adding columns AND a 5-file rewrite: strictly more work for the
-- same result.
--
-- All 3 tables confirmed EMPTY (0 rows) in prod at authoring time, so the
-- backfill UPDATEs below are no-ops today — they exist as a defensive,
-- idempotent (`WHERE new IS NULL`) safety net, not a real data migration.
-- Columns with no clean legacy source (e.g. baseball_stat_sources.source_key,
-- lead_size/jump_time/home_to_first/etc. on baserunning_events) are added
-- nullable with no backfill — nothing legacy captures that data today.
--
-- Additive-only: every column is `ADD COLUMN IF NOT EXISTS`, every FK
-- references a table that already exists, every CHECK constraint is
-- guarded (`IF NOT EXISTS` on pg_constraint) so a re-run is a no-op. No
-- DROP, no RENAME, no golf_* object touched, no anon grant.

-- ----------------------------------------------------------------------------
-- baseball_stat_sources
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_stat_sources
  ADD COLUMN IF NOT EXISTS "source_key" text NULL,
  ADD COLUMN IF NOT EXISTS "source_name" text NULL,
  ADD COLUMN IF NOT EXISTS "source_category" text NULL,
  ADD COLUMN IF NOT EXISTS "trust_tier" text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS "is_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "default_visibility" text NOT NULL DEFAULT 'staff_only',
  ADD COLUMN IF NOT EXISTS "requires_review" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ai_can_use" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "expected_cadence_days" integer NULL,
  ADD COLUMN IF NOT EXISTS "field_mapping_profile" jsonb NULL,
  ADD COLUMN IF NOT EXISTS "created_by" uuid NULL;
-- source_key/source_name/source_category are left NULLABLE here (the
-- original design has them NOT NULL with no default) — deliberately
-- conservative: the table already has legacy NOT NULL columns (name,
-- source_type) with their own semantics, and forcing NOT NULL on the new
-- trio right now would be safe only because the table is empty; leaving them
-- nullable removes any risk of this migration ordering vs. the dual-write
-- code fix mattering. Tighten to NOT NULL in a follow-up once
-- stat-event-imports.ts's dual-write has been live and confirmed populating
-- every insert.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_source_key_check'
  ) THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT "baseball_stat_sources_source_key_check"
      CHECK ("source_key" IS NULL OR "source_key" IN (
        'manual', 'gamechanger_xml', 'statcrew_xml', 'ncaa_live_stats',
        'prestosports_xml', 'sidearm_xml', 'statbroadcast_xml',
        'trackman_csv', 'rapsodo_csv', 'yakkertech_csv', 'hittrax_csv',
        'pocket_radar_csv', 'blast_csv', 'diamond_kinetics_csv',
        'synergy_export', 'six_four_three_export', 'awre_video', 'onform_export',
        'armcare_csv', 'teambuildr_csv', 'teamworks_csv',
        'google_sheets', 'generic_csv', 'generic_xlsx', 'pdf_extract'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_source_category_check'
  ) THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT "baseball_stat_sources_source_category_check"
      CHECK ("source_category" IS NULL OR "source_category" IN (
        'official_game', 'player_development', 'tracking', 'video',
        'strength', 'academics', 'operations'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_trust_tier_check'
  ) THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT "baseball_stat_sources_trust_tier_check"
      CHECK ("trust_tier" IN (
        'official', 'verified_vendor', 'coach_reviewed', 'player_submitted',
        'unverified', 'inferred'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_stat_sources_default_visibility_check'
  ) THEN
    ALTER TABLE public.baseball_stat_sources
      ADD CONSTRAINT "baseball_stat_sources_default_visibility_check"
      CHECK ("default_visibility" IN ('staff_only', 'player_visible', 'restricted'));
  END IF;
END $$;

-- Backfill (no-op today — table is empty; guarded for safety/idempotency).
UPDATE public.baseball_stat_sources
  SET source_name = "name"
  WHERE source_name IS NULL AND "name" IS NOT NULL;

-- ----------------------------------------------------------------------------
-- baseball_catching_events
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_catching_events
  ADD COLUMN IF NOT EXISTS "catcher_id" uuid NULL REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "data_context" text NOT NULL DEFAULT 'official_game',
  ADD COLUMN IF NOT EXISTS "event_type" text NULL,
  ADD COLUMN IF NOT EXISTS "pop_time" numeric NULL,
  ADD COLUMN IF NOT EXISTS "exchange_time" numeric NULL,
  ADD COLUMN IF NOT EXISTS "throw_accuracy" text NULL,
  ADD COLUMN IF NOT EXISTS "block_result" text NULL,
  ADD COLUMN IF NOT EXISTS "steal_result" text NULL,
  ADD COLUMN IF NOT EXISTS "video_id" uuid NULL,
  ADD COLUMN IF NOT EXISTS "external_event_id" text NULL,
  ADD COLUMN IF NOT EXISTS "import_run_id" uuid NULL REFERENCES public.baseball_import_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "source_id" uuid NULL REFERENCES public.baseball_stat_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "trust_tier" text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'staff_only';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_catching_events_data_context_check'
  ) THEN
    ALTER TABLE public.baseball_catching_events
      ADD CONSTRAINT "baseball_catching_events_data_context_check"
      CHECK ("data_context" IN (
        'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
        'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_catching_events_event_type_check'
  ) THEN
    ALTER TABLE public.baseball_catching_events
      ADD CONSTRAINT "baseball_catching_events_event_type_check"
      CHECK ("event_type" IS NULL OR "event_type" IN (
        'receive', 'block', 'throwdown', 'game_call', 'mound_visit'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_catching_events_visibility_check'
  ) THEN
    ALTER TABLE public.baseball_catching_events
      ADD CONSTRAINT "baseball_catching_events_visibility_check"
      CHECK ("visibility" IN ('staff_only', 'player_visible', 'restricted'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_baseball_catch_team_catcher"
  ON public.baseball_catching_events ("team_id", "catcher_id", "data_context");
CREATE INDEX IF NOT EXISTS "idx_baseball_catch_import"
  ON public.baseball_catching_events ("import_run_id");

-- Backfill (no-op today — table is empty; guarded for safety/idempotency).
-- catcher_id: the legacy column is `player_id` (same real-world meaning on
-- this table). block_result/pop_time: legacy names differ (blocking_result,
-- pop_time_seconds) but same semantics. steal_result: LOSSY best-effort
-- mapping — legacy captured this as two booleans (caught_stealing,
-- stolen_base_attempt) rather than the new tri-state text; any future real
-- row should be re-reviewed by a human, this backfill is a safety net only.
UPDATE public.baseball_catching_events
  SET catcher_id = player_id
  WHERE catcher_id IS NULL AND player_id IS NOT NULL;
UPDATE public.baseball_catching_events
  SET block_result = blocking_result
  WHERE block_result IS NULL AND blocking_result IS NOT NULL;
UPDATE public.baseball_catching_events
  SET pop_time = pop_time_seconds
  WHERE pop_time IS NULL AND pop_time_seconds IS NOT NULL;
UPDATE public.baseball_catching_events
  SET steal_result = CASE
    WHEN caught_stealing THEN 'caught'
    WHEN stolen_base_attempt THEN 'attempted'
    ELSE NULL
  END
  WHERE steal_result IS NULL AND (caught_stealing IS TRUE OR stolen_base_attempt IS TRUE);

-- ----------------------------------------------------------------------------
-- baseball_baserunning_events
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_baserunning_events
  ADD COLUMN IF NOT EXISTS "runner_id" uuid NULL REFERENCES public.baseball_players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "data_context" text NOT NULL DEFAULT 'official_game',
  ADD COLUMN IF NOT EXISTS "lead_size" numeric NULL,
  ADD COLUMN IF NOT EXISTS "jump_time" numeric NULL,
  ADD COLUMN IF NOT EXISTS "home_to_first" numeric NULL,
  ADD COLUMN IF NOT EXISTS "first_to_third" numeric NULL,
  ADD COLUMN IF NOT EXISTS "second_to_home" numeric NULL,
  ADD COLUMN IF NOT EXISTS "sixty_time" numeric NULL,
  ADD COLUMN IF NOT EXISTS "decision_quality" text NULL,
  ADD COLUMN IF NOT EXISTS "video_id" uuid NULL,
  ADD COLUMN IF NOT EXISTS "external_event_id" text NULL,
  ADD COLUMN IF NOT EXISTS "import_run_id" uuid NULL REFERENCES public.baseball_import_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "source_id" uuid NULL REFERENCES public.baseball_stat_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "trust_tier" text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'staff_only',
  ADD COLUMN IF NOT EXISTS "measured_at" timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_baserunning_events_data_context_check'
  ) THEN
    ALTER TABLE public.baseball_baserunning_events
      ADD CONSTRAINT "baseball_baserunning_events_data_context_check"
      CHECK ("data_context" IN (
        'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
        'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'baseball_baserunning_events_visibility_check'
  ) THEN
    ALTER TABLE public.baseball_baserunning_events
      ADD CONSTRAINT "baseball_baserunning_events_visibility_check"
      CHECK ("visibility" IN ('staff_only', 'player_visible', 'restricted'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_baseball_baserun_team_runner"
  ON public.baseball_baserunning_events ("team_id", "runner_id", "data_context");
CREATE INDEX IF NOT EXISTS "idx_baseball_baserun_import"
  ON public.baseball_baserunning_events ("import_run_id");

-- Backfill (no-op today — table is empty; guarded for safety/idempotency).
-- runner_id: legacy column is `player_id` (same real-world meaning).
-- lead_size/jump_time/home_to_first/first_to_third/second_to_home/
-- sixty_time/decision_quality have no legacy equivalent — nothing to
-- backfill from.
UPDATE public.baseball_baserunning_events
  SET runner_id = player_id
  WHERE runner_id IS NULL AND player_id IS NOT NULL;

-- Rollback: additive-only per house rule — every column added here is
-- nullable or has a safe DEFAULT, so columns may simply stay (harmless) on
-- rollback; `git revert` this migration's commit rather than DROP COLUMN on
-- shared prod. If a DROP is ever truly required:
--   ALTER TABLE public.baseball_baserunning_events
--     DROP COLUMN IF EXISTS runner_id, DROP COLUMN IF EXISTS data_context,
--     DROP COLUMN IF EXISTS lead_size, DROP COLUMN IF EXISTS jump_time,
--     DROP COLUMN IF EXISTS home_to_first, DROP COLUMN IF EXISTS first_to_third,
--     DROP COLUMN IF EXISTS second_to_home, DROP COLUMN IF EXISTS sixty_time,
--     DROP COLUMN IF EXISTS decision_quality, DROP COLUMN IF EXISTS video_id,
--     DROP COLUMN IF EXISTS external_event_id, DROP COLUMN IF EXISTS import_run_id,
--     DROP COLUMN IF EXISTS source_id, DROP COLUMN IF EXISTS trust_tier,
--     DROP COLUMN IF EXISTS visibility, DROP COLUMN IF EXISTS measured_at;
--   ALTER TABLE public.baseball_catching_events
--     DROP COLUMN IF EXISTS catcher_id, DROP COLUMN IF EXISTS data_context,
--     DROP COLUMN IF EXISTS event_type, DROP COLUMN IF EXISTS pop_time,
--     DROP COLUMN IF EXISTS exchange_time, DROP COLUMN IF EXISTS throw_accuracy,
--     DROP COLUMN IF EXISTS block_result, DROP COLUMN IF EXISTS steal_result,
--     DROP COLUMN IF EXISTS video_id, DROP COLUMN IF EXISTS external_event_id,
--     DROP COLUMN IF EXISTS import_run_id, DROP COLUMN IF EXISTS source_id,
--     DROP COLUMN IF EXISTS trust_tier, DROP COLUMN IF EXISTS visibility;
--   ALTER TABLE public.baseball_stat_sources
--     DROP COLUMN IF EXISTS source_key, DROP COLUMN IF EXISTS source_name,
--     DROP COLUMN IF EXISTS source_category, DROP COLUMN IF EXISTS trust_tier,
--     DROP COLUMN IF EXISTS is_enabled, DROP COLUMN IF EXISTS default_visibility,
--     DROP COLUMN IF EXISTS requires_review, DROP COLUMN IF EXISTS ai_can_use,
--     DROP COLUMN IF EXISTS expected_cadence_days,
--     DROP COLUMN IF EXISTS field_mapping_profile, DROP COLUMN IF EXISTS created_by;
