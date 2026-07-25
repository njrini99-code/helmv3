-- ============================================================================
-- golf_coach_philosophy — signal controls
-- ----------------------------------------------------------------------------
-- Three coach-facing controls whose values the CoachHelm engine already reads
-- from hard-coded constants. Adding the columns turns those constants into
-- per-coach settings without changing any default behaviour.
--
--   min_insight_confidence  — the floor `shouldShowInsight()` compares against.
--                             The orchestrator called it without a threshold,
--                             so every coach was pinned to the module default
--                             of 0.30 (insight-scorer.ts DEFAULT_MINIMUM_THRESHOLD).
--   min_rounds_for_signal   — how many logged rounds a player needs before
--                             CoachHelm will speak about them at all. The
--                             honesty gates ("Need 3+ rounds") were fixed at 3.
--   alert_digest            — whether alerts surface as they are generated
--                             ('immediate') or are batched ('daily' / 'weekly').
--
-- DEFAULTS ARE THE CURRENT HARD-CODED VALUES on purpose: applying this
-- migration must not shift alert volume for any existing coach. A coach only
-- changes behaviour by moving a control.
--
-- Additive only — no drops, no rewrites, no backfill of existing rows beyond
-- the column default. Safe to run against a live table.
-- ============================================================================

ALTER TABLE public.golf_coach_philosophy
  ADD COLUMN IF NOT EXISTS min_insight_confidence numeric(3, 2) NOT NULL DEFAULT 0.30,
  ADD COLUMN IF NOT EXISTS min_rounds_for_signal  smallint      NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS alert_digest           text          NOT NULL DEFAULT 'immediate';

-- Range guards. The UI clamps too, but the DB is the last line: a bad value
-- here would silently mute or flood every alert for that coach.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_coach_philosophy_min_insight_confidence_range'
  ) THEN
    ALTER TABLE public.golf_coach_philosophy
      ADD CONSTRAINT golf_coach_philosophy_min_insight_confidence_range
      CHECK (min_insight_confidence >= 0.10 AND min_insight_confidence <= 0.90);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_coach_philosophy_min_rounds_for_signal_range'
  ) THEN
    ALTER TABLE public.golf_coach_philosophy
      ADD CONSTRAINT golf_coach_philosophy_min_rounds_for_signal_range
      CHECK (min_rounds_for_signal >= 1 AND min_rounds_for_signal <= 15);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_coach_philosophy_alert_digest_values'
  ) THEN
    ALTER TABLE public.golf_coach_philosophy
      ADD CONSTRAINT golf_coach_philosophy_alert_digest_values
      CHECK (alert_digest IN ('immediate', 'daily', 'weekly'));
  END IF;
END $$;

COMMENT ON COLUMN public.golf_coach_philosophy.min_insight_confidence IS
  'Confidence floor an insight must clear to surface. Consumed by shouldShowInsight() in the v2 orchestrator. Default 0.30 = the prior hard-coded DEFAULT_MINIMUM_THRESHOLD.';
COMMENT ON COLUMN public.golf_coach_philosophy.min_rounds_for_signal IS
  'Logged rounds a player needs before CoachHelm will surface signals about them. Default 3 = the prior hard-coded honesty gate.';
COMMENT ON COLUMN public.golf_coach_philosophy.alert_digest IS
  'immediate | daily | weekly — how alerts are delivered to this coach.';
