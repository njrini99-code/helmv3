-- v3 Wave 9 part 2 — extend golf_coachhelm_settings: llm_budget_usd_per_day
--
-- Per-coach daily LLM spend cap. NULL = use the platform default budget
-- (defined in v3/llm/budget.ts, defaulting to USD 5/day at W30 ship).
-- W30 prediction-priority ordering kicks in when the cap is reached:
-- round_review > coach_chat > hero_narrative (fallback to template).
--
-- Read by:
--   - W30 v3/llm/budget.ts before every compose() call
--   - W30 admin /admin/coachhelm/llm-spend dashboard
--
-- Written by:
--   - Admin per-coach overrides (W30 admin UI)
--   - Engine never writes this column
--
-- VERIFIED 2026-05-24 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='golf_coachhelm_settings'
--     AND column_name='llm_budget_usd_per_day';
--   -> [] (column does not exist; safe to add)
--
-- ROLLBACK:
--   ALTER TABLE public.golf_coachhelm_settings
--     DROP CONSTRAINT IF EXISTS golf_coachhelm_settings_llm_budget_nonneg_check,
--     DROP COLUMN IF EXISTS llm_budget_usd_per_day;

ALTER TABLE public.golf_coachhelm_settings
  ADD COLUMN IF NOT EXISTS llm_budget_usd_per_day numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'golf_coachhelm_settings_llm_budget_nonneg_check'
      AND conrelid = 'public.golf_coachhelm_settings'::regclass
  ) THEN
    ALTER TABLE public.golf_coachhelm_settings
      ADD CONSTRAINT golf_coachhelm_settings_llm_budget_nonneg_check
      CHECK (llm_budget_usd_per_day IS NULL OR llm_budget_usd_per_day >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.golf_coachhelm_settings.llm_budget_usd_per_day IS
  'v3 LLM spend cap (USD/day) for this coach''s players combined. NULL = use platform default. Enforced in v3/llm/budget.ts before every compose() call. Exhaustion triggers priority fallback: round_review > coach_chat > hero_narrative -> template.';
