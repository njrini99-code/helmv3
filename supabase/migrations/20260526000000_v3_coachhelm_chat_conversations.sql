-- W32-pt1 / Migration A: golf_coachhelm_chat_conversations + RLS.
--
-- One purpose: per-coach chat conversation rows. Each row is one
-- thread (pinned/archived flags for the history UX). Messages live
-- in the companion table (Migration B). Strict coach-ownership —
-- per Part XII.5, player chat is deferred.
--
-- RLS Pattern 2: coach-owned, no player access at all.
--
-- VERIFIED 2026-05-25 against prod project qmnssrrolpinvwjjnufo:
--   SELECT to_regclass('public.golf_coachhelm_chat_conversations')::text;
--   -> null (safe to create)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_coachhelm_chat_conversations CASCADE;
--   (CASCADE because messages FK to this table.)

CREATE TABLE IF NOT EXISTS public.golf_coachhelm_chat_conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid        NOT NULL REFERENCES public.golf_coaches(id) ON DELETE CASCADE,
  title       text,
  pinned      boolean     NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.golf_coachhelm_chat_conversations IS
  'v3 W32 coach chat thread. Per Part XII coach-only (player chat deferred to v2). pinned + archived_at drive the history UX sort.';

-- Coach-side history list reads: ORDER BY pinned DESC, updated_at DESC.
CREATE INDEX IF NOT EXISTS golf_coachhelm_chat_conversations_coach_idx
  ON public.golf_coachhelm_chat_conversations(coach_id, updated_at DESC);

ALTER TABLE public.golf_coachhelm_chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conversations_coach_only
  ON public.golf_coachhelm_chat_conversations;
CREATE POLICY chat_conversations_coach_only
  ON public.golf_coachhelm_chat_conversations
  FOR ALL
  TO authenticated
  USING (coach_id = public.current_coach_id())
  WITH CHECK (coach_id = public.current_coach_id());
