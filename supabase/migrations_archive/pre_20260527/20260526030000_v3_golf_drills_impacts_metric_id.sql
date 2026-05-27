-- W38 — add impacts_metric_id to golf_drills.
--
-- One purpose: link each drill to the v3 metric it targets so Practice
-- Rx (composePracticeRx) can filter drill_library → drills where
-- impacts_metric_id = goal.metric_id.
--
-- Nullable — existing drills without a tagged metric still work for
-- the existing drill browser; only goal-driven Practice Rx requires
-- the tag. Future content work will backfill it across the library.
--
-- VERIFIED 2026-05-26 against prod project qmnssrrolpinvwjjnufo:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='golf_drills' AND column_name='impacts_metric_id';
--   -> 0 rows (safe to add)
--
-- ROLLBACK:
--   ALTER TABLE public.golf_drills DROP COLUMN impacts_metric_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'golf_drills'
      AND column_name = 'impacts_metric_id'
  ) THEN
    ALTER TABLE public.golf_drills
      ADD COLUMN impacts_metric_id text
      REFERENCES public.golf_metrics(metric_id);
  END IF;
END $$;

-- Partial index for the Practice Rx filter — only the tagged subset
-- matters for the per-goal lookup query.
CREATE INDEX IF NOT EXISTS golf_drills_impacts_metric_idx
  ON public.golf_drills(impacts_metric_id)
  WHERE impacts_metric_id IS NOT NULL;
