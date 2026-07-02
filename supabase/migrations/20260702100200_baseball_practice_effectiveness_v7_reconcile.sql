-- baseball_practice_effectiveness_reviews V7-object reconcile.
--
-- LIVE-VERIFIED (2026-07-02): 20260624000094_baseball_practice_effectiveness.sql
-- CREATE TABLE IF NOT EXISTS'd this table against a pre-existing, differently
-- shaped table (an older player/coach post-practice rating survey: block_id,
-- reviewed_by_coach_id, overall_grade, reps_quality, energy_level,
-- focus_level, objective_completion_pct, notes, signal_raised) -- so the
-- IF NOT EXISTS made the ENTIRE V7 "AI Practice Effectiveness Object" CREATE a
-- no-op. 24 of its 25 columns never landed (only source_refs happens to
-- already exist). This is NOT the narrower 2-column gap #651/WS0.1 assumed --
-- confirmed by code trace: src/app/baseball/actions/practice-effectiveness.ts
-- upserts all 25 V7 fields by name (measureForTeam, ~lines 601-632), and its
-- own pre-upsert dispositions SELECT (~582-592) 400s against the live schema
-- today, short-circuiting before the upsert ever runs. The feature is fully
-- wired to a real nav entry + route (gated by can_manage_practice) and to the
-- Decision Room panel -- it silently no-ops (caught errors -> empty results)
-- rather than crashing, but it has never produced a single row (table has 0
-- rows in prod). Table is EMPTY, so every NOT NULL addition below is safe.
--
-- `updated_at` is also added -- referenced by practice-effectiveness.ts's
-- update() call but never part of the original V7 spec.
-- `verdict` is NOT added here -- it is owned by
-- 20260701030000_baseball_practice_effectiveness_verdict.sql (already drafted
-- on fix/baseball-p2-practice-effectiveness-verdicts) and must apply AFTER
-- this migration (it does not depend on any column added here, so order
-- relative to THIS file is flexible, but both must land before the practice
-- effectiveness feature works end-to-end).
--
-- Amendment: also adds a guarded UNIQUE (team_id, dedupe_key) constraint --
-- measureForTeam's upsert targets an onConflict of (team_id, dedupe_key) for
-- its "stable (team, practice, focus_area, metric) dedupe so a re-run
-- upserts" behavior (per the original V7 design comment), which requires a
-- real unique constraint on those two columns to work at all.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded CHECK/UNIQUE adds.

ALTER TABLE public.baseball_practice_effectiveness_reviews
  ADD COLUMN IF NOT EXISTS objective_id uuid REFERENCES public.baseball_practice_block_objectives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS focus_area text,
  ADD COLUMN IF NOT EXISTS metric_id text,
  ADD COLUMN IF NOT EXISTS player_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS linked_signal_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS metric_before numeric,
  ADD COLUMN IF NOT EXISTS metric_after numeric,
  ADD COLUMN IF NOT EXISTS sample_before integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sample_after integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS window_before_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS window_after_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'insufficient_sample',
  ADD COLUMN IF NOT EXISTS after_scope text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS confidence_tier text NOT NULL DEFAULT 'not_enough_sample',
  ADD COLUMN IF NOT EXISTS confounders jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS conclusion text,
  ADD COLUMN IF NOT EXISTS recommended_next_action jsonb,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'staff_only',
  ADD COLUMN IF NOT EXISTS disposition text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS generated_by text,
  ADD COLUMN IF NOT EXISTS generated_by_model text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- focus_area / conclusion are NOT NULL in the original V7 spec, but the table
-- already has application-facing NOT NULL semantics enforced at the app layer
-- (measureForTeam always sets both); added nullable here to avoid an
-- ADD COLUMN NOT NULL failure risk if this ever runs against a non-empty
-- table by mistake, with the CHECKs below still enforcing the enums. If Nick
-- wants strict NOT NULL parity with the original spec, flip these two to
-- NOT NULL (safe today -- table has 0 rows) before applying.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_effectiveness_reviews_direction_check') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT baseball_practice_effectiveness_reviews_direction_check
      CHECK (direction IN ('improved','stable','worse','insufficient_sample','too_early','not_tracked'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_effectiveness_reviews_after_scope_check') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT baseball_practice_effectiveness_reviews_after_scope_check
      CHECK (after_scope IN ('official_game','scrimmage','practice','mixed','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_effectiveness_reviews_confidence_tier_check') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT baseball_practice_effectiveness_reviews_confidence_tier_check
      CHECK (confidence_tier IN ('too_early','not_enough_sample','correlated_not_proven','no_signal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_effectiveness_reviews_visibility_check') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT baseball_practice_effectiveness_reviews_visibility_check
      CHECK (visibility IN ('staff_only','player_visible','restricted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'baseball_practice_effectiveness_reviews_disposition_check') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT baseball_practice_effectiveness_reviews_disposition_check
      CHECK (disposition IN ('new','dismissed','resolved','converted_to_task'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_baseball_practice_effectiveness_team_dedupe') THEN
    ALTER TABLE public.baseball_practice_effectiveness_reviews
      ADD CONSTRAINT uq_baseball_practice_effectiveness_team_dedupe UNIQUE (team_id, dedupe_key);
  END IF;
END $$;

-- Rollback: this is the additive-only convention -- do not DROP COLUMN on the
-- shared prod DB. A revert ships a follow-up migration dropping only the 5
-- CHECK constraints + the UNIQUE constraint above if they need to change; the
-- columns stay (nullable/additive, harmless, table is empty).
