-- Convergence subset of 20260624000200_baseball_practice_deepening.sql.
-- APPLIED TO PROD 2026-07-04 via MCP (route sweep found /baseball/player/
-- practice 42703-ing): prod had the LATER practice-blocks columns
-- (source_reason, source_signal_id, completion_*) but never the V7
-- row-content set — code reads AND writes these; block creation with a
-- description was silently broken. Additive only, idempotent, definitions
-- verbatim from the canonical migration.
DO $$
BEGIN
  IF to_regclass('public.baseball_practice_blocks') IS NOT NULL THEN
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS station_type text;
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS group_label text;
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS equipment text;
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS measurement_target text;
    ALTER TABLE public.baseball_practice_blocks
      ADD COLUMN IF NOT EXISTS is_measured boolean NOT NULL DEFAULT false;
  END IF;
END $$;
