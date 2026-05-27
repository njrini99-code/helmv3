-- 20260421100000_canonical_coachhelm_schema.sql
-- Creates tables that the engine code references but production lacks.
-- Team A — Database Foundation (CoachHelm fix plan, 2026-04-21)
--
-- NOTE: Original plan used filename 20260421000000_canonical_coachhelm_schema.sql,
-- but 20260421000000..000007 are already occupied by CRM / admin-dashboard migrations.
-- Shifted to 10000x to keep ordering-after them.

-- =================================================================
-- golf_global_patterns: cross-learner writes to it; previously a phantom table
-- =================================================================
CREATE TABLE IF NOT EXISTS public.golf_global_patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature       TEXT NOT NULL,
  pattern_type    TEXT NOT NULL,
  conditions      JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcomes        JSONB NOT NULL DEFAULT '{}'::jsonb,
  prevalence      NUMERIC(5,4) NOT NULL DEFAULT 0,
  average_impact  NUMERIC(6,3) NOT NULL DEFAULT 0,
  confidence      NUMERIC(5,4) NOT NULL DEFAULT 0,
  instance_count  INTEGER NOT NULL DEFAULT 0,
  player_count    INTEGER NOT NULL DEFAULT 0,
  varied_by_tier      JSONB NOT NULL DEFAULT '{}'::jsonb,
  varied_by_handicap  JSONB NOT NULL DEFAULT '{}'::jsonb,
  contributing_players UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT golf_global_patterns_signature_unique UNIQUE (signature)
);
CREATE INDEX IF NOT EXISTS idx_golf_global_patterns_pattern_type ON public.golf_global_patterns (pattern_type);
CREATE INDEX IF NOT EXISTS idx_golf_global_patterns_confidence ON public.golf_global_patterns (confidence DESC);
ALTER TABLE public.golf_global_patterns ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- golf_insight_player_feedback: Team D's player feedback target
-- =================================================================
CREATE TABLE IF NOT EXISTS public.golf_insight_player_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id  UUID NOT NULL REFERENCES public.golf_coach_insights(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  rating      TEXT NOT NULL CHECK (rating IN ('helpful','not_helpful','dismissed','acknowledged')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT golf_insight_player_feedback_unique UNIQUE (insight_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_golf_insight_player_feedback_insight ON public.golf_insight_player_feedback (insight_id);
CREATE INDEX IF NOT EXISTS idx_golf_insight_player_feedback_player ON public.golf_insight_player_feedback (player_id, created_at DESC);
ALTER TABLE public.golf_insight_player_feedback ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- updated_at trigger for golf_global_patterns
-- =================================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS golf_global_patterns_touch ON public.golf_global_patterns;
CREATE TRIGGER golf_global_patterns_touch
  BEFORE UPDATE ON public.golf_global_patterns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
