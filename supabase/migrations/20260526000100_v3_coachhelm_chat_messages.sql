-- W32-pt1 / Migration B: golf_coachhelm_chat_messages + RLS.
--
-- One purpose: per-message rows for chat threads. Roles: user
-- (coach's input), assistant (model reply), tool (tool-call result
-- — the agent serializes its tool_calls + tool_results separately so
-- downstream UI can render them).
--
-- Append-only at the application layer (no UPDATE/DELETE policy).
-- cost_usd is nullable — only assistant rows carry a billable cost;
-- user + tool messages are free.
--
-- RLS: visible only to the conversation's owning coach via join.
--
-- VERIFIED 2026-05-25 against prod project qmnssrrolpinvwjjnufo:
--   SELECT to_regclass('public.golf_coachhelm_chat_messages')::text;
--   -> null (safe to create)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.golf_coachhelm_chat_messages;

CREATE TABLE IF NOT EXISTS public.golf_coachhelm_chat_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES public.golf_coachhelm_chat_conversations(id) ON DELETE CASCADE,
  role            text        NOT NULL,
  content         text,
  tool_calls      jsonb,
  tool_results    jsonb,
  cost_usd        numeric     CHECK (cost_usd IS NULL OR cost_usd >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_coachhelm_chat_messages_role_check
    CHECK (role IN ('user','assistant','tool'))
);

COMMENT ON TABLE public.golf_coachhelm_chat_messages IS
  'v3 W32 coach chat messages. Append-only. tool_calls + tool_results are jsonb so the agent can replay/inspect a turn without re-running the model.';

-- Sequential message render: ORDER BY conversation_id, created_at ASC.
CREATE INDEX IF NOT EXISTS golf_coachhelm_chat_messages_conv_idx
  ON public.golf_coachhelm_chat_messages(conversation_id, created_at ASC);

ALTER TABLE public.golf_coachhelm_chat_messages ENABLE ROW LEVEL SECURITY;

-- Coach sees messages iff they own the parent conversation.
DROP POLICY IF EXISTS chat_messages_coach_only
  ON public.golf_coachhelm_chat_messages;
CREATE POLICY chat_messages_coach_only
  ON public.golf_coachhelm_chat_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_coachhelm_chat_conversations c
      WHERE c.id = golf_coachhelm_chat_messages.conversation_id
        AND c.coach_id = public.current_coach_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.golf_coachhelm_chat_conversations c
      WHERE c.id = golf_coachhelm_chat_messages.conversation_id
        AND c.coach_id = public.current_coach_id()
    )
  );
