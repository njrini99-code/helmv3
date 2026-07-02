-- #651a: narrow schema-drift reconcile — the 4 tables where the live schema
-- otherwise matches what 20260624000080_baseball_elite_stat_event_model.sql
-- intended (no column-name mismatches, unlike catching/baserunning/
-- stat_sources — see #651b for those). All 4 tables confirmed EMPTY in prod
-- (0 rows each) at authoring time, so every ADD COLUMN below is safe with no
-- backfill needed; CHECK constraints match the original source migrations
-- verbatim. Idempotent (ADD COLUMN IF NOT EXISTS + guarded CHECK adds,
-- mirroring the pattern in 20260701030000_baseball_practice_effectiveness_verdict.sql).

-- ----------------------------------------------------------------------------
-- baseball_fielding_events — measured_at, chance_difficulty
-- (source: 20260624000080_baseball_elite_stat_event_model.sql, both nullable,
-- no CHECK in the original definition)
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_fielding_events
  ADD COLUMN IF NOT EXISTS "measured_at" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "chance_difficulty" text NULL;

-- ----------------------------------------------------------------------------
-- baseball_plate_appearances — data_context
-- (source: 20260624000080_baseball_elite_stat_event_model.sql:144-147)
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_plate_appearances
  ADD COLUMN IF NOT EXISTS "data_context" text NOT NULL DEFAULT 'official_game';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_plate_appearances_data_context_check'
  ) THEN
    ALTER TABLE public.baseball_plate_appearances
      ADD CONSTRAINT "baseball_plate_appearances_data_context_check"
      CHECK ("data_context" IN (
        'official_game', 'scrimmage', 'practice', 'bullpen', 'cage',
        'showcase', 'sensor', 'video', 'lift', 'readiness', 'manual'
      ));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_practice_effectiveness_reviews — disposition, focus_area
-- (source: 20260624000094_baseball_practice_effectiveness.sql:113,156-157)
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_practice_effectiveness_reviews
  ADD COLUMN IF NOT EXISTS "disposition" text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS "focus_area" text NOT NULL DEFAULT '';
-- focus_area has no DEFAULT in the original source (NOT NULL, no default) —
-- the table is confirmed empty, so a plain NOT NULL add would also succeed,
-- but DEFAULT '' is added here as a defensive guard against any row landing
-- between authoring and apply; app code should always supply a real value.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'baseball_practice_effectiveness_reviews_disposition_check'
  ) THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT "baseball_practice_effectiveness_reviews_disposition_check"
      CHECK ("disposition" IN ('new', 'dismissed', 'resolved', 'converted_to_task'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_bpe_disposition"
  ON public.baseball_practice_effectiveness_reviews ("team_id", "disposition");
CREATE INDEX IF NOT EXISTS "idx_bpe_focus"
  ON public.baseball_practice_effectiveness_reviews ("team_id", "focus_area");

-- ----------------------------------------------------------------------------
-- baseball_decision_log — detail
-- (source: 20260624000310_baseball_decision_log.sql:62, plain nullable text)
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_decision_log
  ADD COLUMN IF NOT EXISTS "detail" text NULL;

-- Rollback:
--   ALTER TABLE public.baseball_decision_log DROP COLUMN IF EXISTS "detail";
--   DROP INDEX IF EXISTS "idx_bpe_focus";
--   DROP INDEX IF EXISTS "idx_bpe_disposition";
--   ALTER TABLE public.baseball_practice_effectiveness_reviews
--     DROP CONSTRAINT IF EXISTS "baseball_practice_effectiveness_reviews_disposition_check",
--     DROP COLUMN IF EXISTS "focus_area",
--     DROP COLUMN IF EXISTS "disposition";
--   ALTER TABLE public.baseball_plate_appearances
--     DROP CONSTRAINT IF EXISTS "baseball_plate_appearances_data_context_check",
--     DROP COLUMN IF EXISTS "data_context";
--   ALTER TABLE public.baseball_fielding_events
--     DROP COLUMN IF EXISTS "chance_difficulty",
--     DROP COLUMN IF EXISTS "measured_at";
-- (Additive-only house rule: don't actually run this rollback on shared prod
-- unless truly necessary — columns are nullable/defaulted and harmless.)
