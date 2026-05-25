-- W30 / Migration B: golf_coachhelm_llm_calls table + RLS.
--
-- One purpose: append-only log of every LLM call the compose() wrapper
-- makes. One row per call. Used for cost attribution, prompt-hash dedup
-- diagnostics, citation-verification audit, and the deferred admin
-- dashboard.
--
-- Append-only — no UPDATE or DELETE policies. RLS readers: coach sees
-- their own calls. Service-role writes happen server-side via the
-- compose() wrapper, RLS doesn't apply to service role.
--
-- VERIFIED 2026-05-25 against prod project qmnssrrolpinvwjjnufo:
--   SELECT to_regclass('public.golf_coachhelm_llm_calls')::text;
--   -> null (safe to create)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_coachhelm_llm_calls;

CREATE TABLE IF NOT EXISTS public.golf_coachhelm_llm_calls (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task                 text        NOT NULL,
  coach_id             uuid        REFERENCES public.golf_coaches(id)  ON DELETE SET NULL,
  player_id            uuid        REFERENCES public.golf_players(id)  ON DELETE SET NULL,
  prompt_hash          text        NOT NULL,
  model_id             text        NOT NULL,
  prompt_tokens        int         NOT NULL CHECK (prompt_tokens >= 0),
  completion_tokens    int         NOT NULL CHECK (completion_tokens >= 0),
  cost_usd             numeric     NOT NULL CHECK (cost_usd >= 0),
  citations            jsonb,
  verified             boolean     NOT NULL,
  fallback_to_template boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_coachhelm_llm_calls_task_check
    CHECK (task IN ('round_review','hero_narrative','coach_chat'))
);

COMMENT ON TABLE public.golf_coachhelm_llm_calls IS
  'v3 W30 append-only LLM call log. One row per compose() invocation. Used for cost attribution, dedup diagnostics, citation audit, and admin spend dashboard (deferred).';

-- Common filter shapes for admin dashboard + per-coach drill-downs.
CREATE INDEX IF NOT EXISTS golf_coachhelm_llm_calls_created_idx
  ON public.golf_coachhelm_llm_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS golf_coachhelm_llm_calls_coach_task_idx
  ON public.golf_coachhelm_llm_calls(coach_id, task, created_at DESC);

ALTER TABLE public.golf_coachhelm_llm_calls ENABLE ROW LEVEL SECURITY;

-- Coach can read calls attributed to them. No INSERT/UPDATE/DELETE
-- policies — writes flow through service-role compose() wrapper.
DROP POLICY IF EXISTS llm_calls_coach_read ON public.golf_coachhelm_llm_calls;
CREATE POLICY llm_calls_coach_read
  ON public.golf_coachhelm_llm_calls
  FOR SELECT
  TO authenticated
  USING (coach_id = public.current_coach_id());
