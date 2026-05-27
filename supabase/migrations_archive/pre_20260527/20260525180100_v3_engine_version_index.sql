-- v3 Wave 21 — index on (engine_version, created_at DESC) for fast v3-vs-v2 filtering
--
-- Powers:
--   - Admin /admin/coachhelm/llm-spend type dashboards that filter by
--     engine_version
--   - W25 cutover-readiness queries ("are there still active v3
--     insights from the last 7 days?")
--   - W35 outcome attribution joins
--
-- Shipped as its own migration per Rule 2 (one purpose per migration).
--
-- VERIFIED 2026-05-25: column was created in the prior migration; index
-- doesn't exist yet.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.idx_coach_insights_engine_version;

CREATE INDEX IF NOT EXISTS idx_coach_insights_engine_version
  ON public.golf_coach_insights(engine_version, created_at DESC);
