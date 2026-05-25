-- v3 Wave 9 part 2 — extend golf_coachhelm_settings: llm_narrative_enabled
--
-- Per-coach feature flag for LLM-composed prose surfaces (round review,
-- hero narrative, coach chat). Defaults to false at W9; flips to true
-- per-coach via the GrowthBook flag in W30 once the LLM service ships
-- and the budget table is in place.
--
-- Read by:
--   - W30 v3/llm/compose.ts as a hard gate (no LLM call if false)
--   - W30 admin LLM-spend dashboard for coverage view
--   - W31 hero-narrative wrapper falls back to template when false
--   - W32 coach-chat surfaces a "Enable LLM" CTA when false
--
-- VERIFIED 2026-05-24 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='golf_coachhelm_settings'
--     AND column_name='llm_narrative_enabled';
--   -> [] (column does not exist; safe to add)
--
-- ROLLBACK:
--   ALTER TABLE public.golf_coachhelm_settings
--     DROP COLUMN IF EXISTS llm_narrative_enabled;

ALTER TABLE public.golf_coachhelm_settings
  ADD COLUMN IF NOT EXISTS llm_narrative_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.golf_coachhelm_settings.llm_narrative_enabled IS
  'v3 LLM gate: when false, all three LLM surfaces (round_review, hero_narrative, coach_chat) fall back to deterministic templates for this coach''s players. Default false at W9; flipped per-coach via GrowthBook in W30+.';
