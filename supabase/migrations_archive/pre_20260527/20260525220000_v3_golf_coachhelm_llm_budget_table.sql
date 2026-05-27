-- W30 / Migration A: golf_coachhelm_llm_budget table + RLS.
--
-- One purpose: per-coach daily LLM spend ceiling. compose() reads the
-- (coach_id, today) row before every LLM call; if spent_usd >= budget_usd
-- it falls back to the non-LLM template path per Part XI.4 priority:
--   round_review > coach_chat > hero_narrative.
--
-- One row per (coach, date). budget_usd is admin-set (Part XXIII Migration
-- M6 puts the default on golf_coachhelm_settings.llm_budget_usd_per_day);
-- per-day rows are upserted lazily on first call of the day.
--
-- task_class_usage: jsonb breakdown {round_review: 0.42, hero: 0.08, …}
-- for the deferred admin dashboard. Updated atomically with spent_usd.
--
-- VERIFIED 2026-05-25 against prod project qmnssrrolpinvwjjnufo:
--   SELECT to_regclass('public.golf_coachhelm_llm_budget')::text;
--   -> null (safe to create)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_coachhelm_llm_budget;

CREATE TABLE IF NOT EXISTS public.golf_coachhelm_llm_budget (
  coach_id          uuid        NOT NULL REFERENCES public.golf_coaches(id) ON DELETE CASCADE,
  date              date        NOT NULL,
  spent_usd         numeric     NOT NULL DEFAULT 0   CHECK (spent_usd >= 0),
  budget_usd        numeric     NOT NULL             CHECK (budget_usd >= 0),
  task_class_usage  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, date)
);

COMMENT ON TABLE public.golf_coachhelm_llm_budget IS
  'v3 W30 per-coach daily LLM spend cap. compose() reads (coach_id, today) before every call; on exhaustion falls back to non-LLM template path per Part XI.4 priority (round_review > coach_chat > hero_narrative).';

CREATE INDEX IF NOT EXISTS golf_coachhelm_llm_budget_date_idx
  ON public.golf_coachhelm_llm_budget(date DESC);

ALTER TABLE public.golf_coachhelm_llm_budget ENABLE ROW LEVEL SECURITY;

-- Coach can read own row. Writes happen via SECURITY DEFINER RPC the
-- compose() wrapper invokes server-side, so no write policy here.
DROP POLICY IF EXISTS llm_budget_coach_read ON public.golf_coachhelm_llm_budget;
CREATE POLICY llm_budget_coach_read
  ON public.golf_coachhelm_llm_budget
  FOR SELECT
  TO authenticated
  USING (coach_id = public.current_coach_id());
