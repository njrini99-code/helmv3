-- W35 — golf_coachhelm_coach_weights table + RLS.
--
-- One purpose: per-(coach, insight_type, intent) learned weight that
-- multiplies into the ranker (W36) when scoring which insights to
-- surface. Default 1.0 until sample_n ≥ 10; below that the ranker
-- treats the coach as "uncalibrated" and uses the global default.
--
-- VERIFIED 2026-05-26 against prod project qmnssrrolpinvwjjnufo:
--   SELECT to_regclass('public.golf_coachhelm_coach_weights')::text;
--   -> null (safe to create)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_coachhelm_coach_weights;

CREATE TABLE IF NOT EXISTS public.golf_coachhelm_coach_weights (
  coach_id      uuid        NOT NULL REFERENCES public.golf_coaches(id) ON DELETE CASCADE,
  insight_type  text        NOT NULL,
  intent        text        NOT NULL,
  weight        numeric     NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
  sample_n      int         NOT NULL DEFAULT 0   CHECK (sample_n >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, insight_type, intent)
);

COMMENT ON TABLE public.golf_coachhelm_coach_weights IS
  'v3 W35 Bayesian-updated per-coach weights. weight × |strokes_impact| × confidence = ranker score (W36). Default 1.0 until sample_n ≥ 10.';

ALTER TABLE public.golf_coachhelm_coach_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_weights_coach_only
  ON public.golf_coachhelm_coach_weights;
CREATE POLICY coach_weights_coach_only
  ON public.golf_coachhelm_coach_weights
  FOR SELECT
  TO authenticated
  USING (coach_id = public.current_coach_id());
