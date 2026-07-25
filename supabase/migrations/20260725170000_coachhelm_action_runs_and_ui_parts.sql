-- ===========================================================================
-- CoachHelm command center — durable UI parts + the action audit ledger
-- ===========================================================================
-- Two additive changes. Both are metadata-only or empty-table operations on
-- PG 11+, so neither rewrites an existing table.
--
-- 1. golf_coachhelm_chat_messages.ui_parts
--    The chat streams typed parts — charts, entity mentions, approval requests,
--    action receipts — not just prose. Storing only `content` meant a reload
--    resurrected the words and threw away everything that made the answer
--    legible. `ui_parts` is the AI SDK UIMessage part array, so a refreshed
--    conversation renders identically to the live one.
--
--    Extending the existing JSONB ledger rather than adding a table: the parts
--    are per-message, always read with the message, and never queried
--    independently.
--
-- 2. golf_coachhelm_action_runs
--    Every mutation the agent proposes gets a row here BEFORE anything is
--    written, and the row is the idempotency record. A retried confirmation
--    with the same key returns the original result instead of creating a
--    second practice series.
--
--    It is also the audit evidence: proposed → approved | denied → completed |
--    failed, with the payload that was actually approved. "The AI created
--    eight events" needs to be answerable months later.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Durable UI parts
-- ---------------------------------------------------------------------------
ALTER TABLE public.golf_coachhelm_chat_messages
  ADD COLUMN IF NOT EXISTS ui_parts jsonb;

COMMENT ON COLUMN public.golf_coachhelm_chat_messages.ui_parts IS
  'AI SDK UIMessage parts for this message (text, tool calls, typed data parts, approvals, receipts). Lets a reload reproduce charts/mentions/approvals instead of only the prose in content.';

-- ---------------------------------------------------------------------------
-- 2. Action-run audit ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.golf_coachhelm_action_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership. coach_id drives RLS; team_id is the resolved active team at
  -- proposal time, recorded so an audit does not have to re-derive it.
  coach_id uuid NOT NULL REFERENCES public.golf_coaches(id) ON DELETE CASCADE,
  team_id  uuid NOT NULL REFERENCES public.golf_teams(id)   ON DELETE CASCADE,

  -- Where it came from.
  conversation_id uuid REFERENCES public.golf_coachhelm_chat_conversations(id) ON DELETE SET NULL,
  message_id      uuid REFERENCES public.golf_coachhelm_chat_messages(id)      ON DELETE SET NULL,

  -- What was asked for.
  tool_name text NOT NULL,
  -- The exact arguments shown to the coach in the preview. What was approved
  -- must equal what was executed, and this is the record of the former.
  proposed_input jsonb NOT NULL,

  -- Lifecycle. 'denied' is recorded, not discarded: a coach declining an
  -- action is signal about the agent's judgement.
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'denied', 'completed', 'failed')),

  -- Idempotency. Unique per coach, so a retried confirm returns the first
  -- result rather than creating a duplicate series.
  idempotency_key text NOT NULL,

  -- Outcome.
  result        jsonb,
  error_message text,
  -- Partial success is a real outcome: events created, one notification failed.
  partial_failures jsonb,

  proposed_at  timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  completed_at timestamptz,

  CONSTRAINT golf_coachhelm_action_runs_idem_unique UNIQUE (coach_id, idempotency_key)
);

COMMENT ON TABLE public.golf_coachhelm_action_runs IS
  'Audit + idempotency ledger for every mutation CoachHelm proposes. A row is written at proposal time; the unique (coach_id, idempotency_key) makes a retried confirmation return the original result instead of duplicating the write.';

CREATE INDEX IF NOT EXISTS idx_coachhelm_action_runs_coach_time
  ON public.golf_coachhelm_action_runs (coach_id, proposed_at DESC);

CREATE INDEX IF NOT EXISTS idx_coachhelm_action_runs_conversation
  ON public.golf_coachhelm_action_runs (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS — mirrors the chat tables exactly: a coach sees only their own runs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.golf_coachhelm_action_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coachhelm_action_runs_coach_only ON public.golf_coachhelm_action_runs;
CREATE POLICY coachhelm_action_runs_coach_only
  ON public.golf_coachhelm_action_runs
  FOR ALL
  USING (coach_id = public.current_coach_id())
  WITH CHECK (coach_id = public.current_coach_id());

-- Explicit grants. No anon access: this ledger is coach-private by definition.
REVOKE ALL ON public.golf_coachhelm_action_runs FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.golf_coachhelm_action_runs TO authenticated;
