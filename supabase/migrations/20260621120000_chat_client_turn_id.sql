-- P1-11 — Coach chat: client_turn_id for idempotent retries + orphan-free turns.
--
-- The chat send route used to (1) append the user turn BEFORE the budget gate,
-- leaving an orphan user-only turn when the budget was exhausted, and (2) had no
-- way to dedupe a retried send (a flaky network → double-tap created two turns).
--
-- This adds a stable, client-supplied turn id so the route can:
--   • upsert the user turn idempotently (same client_turn_id → no duplicate), and
--   • carry the id onto the matching assistant/failure turn so the whole exchange
--     is retry-safe.
--
-- Nullable (legacy rows + tool-ledger rows have none) and only unique-per-
-- conversation when present, so it never blocks the existing tool/assistant rows.

ALTER TABLE public.golf_coachhelm_chat_messages
  ADD COLUMN IF NOT EXISTS client_turn_id text;

-- Turn lifecycle for the assistant side. 'complete' = a normal grounded answer
-- (the default for legacy + new rows); 'failed' = the agent/model errored, so the
-- UI renders a visible "couldn't answer" bubble with a Retry instead of leaving
-- the user turn orphaned. Nullable so historical rows read as 'complete' via the
-- read mapper's coalesce.
ALTER TABLE public.golf_coachhelm_chat_messages
  ADD COLUMN IF NOT EXISTS status text;

-- One user/assistant turn per (conversation, client_turn_id). Partial so the
-- many rows WITHOUT a client_turn_id (legacy + synthetic tool rows) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS golf_coachhelm_chat_messages_conv_turn_uniq
  ON public.golf_coachhelm_chat_messages (conversation_id, role, client_turn_id)
  WHERE client_turn_id IS NOT NULL;
