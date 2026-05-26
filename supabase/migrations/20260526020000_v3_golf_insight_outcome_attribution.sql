-- W35 — golf_insight_outcome_attribution table + RLS.
--
-- One purpose: per-insight outcome attribution row. surfaced_at is
-- when the insight first hit a coach surface; baseline_value is the
-- 14-day pre-window average for target_metric_id; post_value is the
-- 21-day post-window average; delta = post - baseline; lift normalizes
-- against the player's broader 90-day trend so we don't credit
-- insights for ambient improvement.
--
-- One row per insight_id (composite key not needed — each insight
-- attributes once and stays in the ledger).
--
-- VERIFIED 2026-05-26 against prod project qmnssrrolpinvwjjnufo:
--   SELECT to_regclass('public.golf_insight_outcome_attribution')::text;
--   -> null (safe to create)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_insight_outcome_attribution;

CREATE TABLE IF NOT EXISTS public.golf_insight_outcome_attribution (
  insight_id        uuid        NOT NULL PRIMARY KEY
    REFERENCES public.golf_coach_insights(id) ON DELETE CASCADE,
  surfaced_at       timestamptz NOT NULL,
  target_metric_id  text        NOT NULL REFERENCES public.golf_metrics(metric_id),
  baseline_value    numeric     NOT NULL,
  post_value        numeric     NOT NULL,
  delta             numeric     NOT NULL,
  n_rounds_before   int         NOT NULL CHECK (n_rounds_before >= 0),
  n_rounds_after    int         NOT NULL CHECK (n_rounds_after >= 0),
  lift              numeric,
  attributed_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.golf_insight_outcome_attribution IS
  'v3 W35 per-insight outcome attribution. surfaced_at + baseline/post + delta + lift fuels coach-weights Bayesian updates and feeds golf_insight_effectiveness aggregates.';

CREATE INDEX IF NOT EXISTS golf_insight_outcome_attribution_metric_idx
  ON public.golf_insight_outcome_attribution(target_metric_id, attributed_at DESC);

ALTER TABLE public.golf_insight_outcome_attribution ENABLE ROW LEVEL SECURITY;

-- Coach can read attribution rows for their team's insights. The
-- insight's coach_id is on golf_coach_insights, which is what we join.
DROP POLICY IF EXISTS attribution_coach_read
  ON public.golf_insight_outcome_attribution;
CREATE POLICY attribution_coach_read
  ON public.golf_insight_outcome_attribution
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_coach_insights i
      WHERE i.id = golf_insight_outcome_attribution.insight_id
        AND i.coach_id = public.current_coach_id()
    )
  );
