-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 10 Nov 2026 for the CoachHelm chat rebuild (the server owns the
--   conversation). Not applied anywhere, not run against any database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261110120000_coachhelm_chat_model_messages.sql
--   after npm run test:rls passes on a local stack (the pgTAP file is
--   supabase/tests/rls/coachhelm_chat_model_messages.sql).
--
-- Risk: LOW. Additive only: two nullable jsonb columns and two CHECK
--   constraints on public.golf_coachhelm_chat_messages. No row is rewritten,
--   no existing column, policy, grant or index changes, and every row valid
--   today stays valid (both columns are NULL on every existing row).
--   ADD COLUMN with no default is a catalog-only change; the constraints are
--   added NOT VALID and validated in a second statement. Both run in the one
--   transaction db:apply gives the file, so the lock ADD CONSTRAINT takes is
--   held until that transaction commits: the scan is of a small table
--   (hundreds of rows, milliseconds) and lock_timeout bounds the wait at 3s.
--
-- What: the model's own record of each chat turn, so the server, not the
--   browser, is what the model is replayed from.
--   1. model_messages jsonb NULL: on an ASSISTANT row, the exact messages its
--      turn added to the conversation, in order, as sent to and returned by
--      the model API: the coach's message, each assistant message (thinking
--      blocks with their signatures, text, tool calls) and each tool-result
--      message. Appended to while a turn continues (a decision on a card),
--      never edited. NULL on user rows, on rows written before this
--      migration, and on a database without it.
--   2. pending_decision jsonb NULL: on an assistant row whose turn is waiting
--      for the coach to confirm or cancel an action: which tool calls of the
--      last assistant message already have a result and which wait
--      ({ order, results, tasks, steps }). NULL when nothing waits.
--
-- RLS: unchanged. This migration adds, drops and alters no policy. The coach
--   policy chat_messages_coach_only (FOR ALL, through the conversation's
--   coach) already scopes both columns to the owning coach, exactly as it
--   scopes ui_parts. (The held 20261101090200 adds player policies to the
--   same table; whether it has been applied makes no difference here, so
--   nothing below counts the table's policies.) Grants unchanged (table
--   level). A coach can therefore read and write their own rows' new columns
--   with their own session, as they can ui_parts today: that is a self-only
--   surface (it steers only their own model; every write the chat makes still
--   goes through the action ledger and the server actions' own checks). The
--   stricter alternative, column privileges plus service-role reads, is a
--   separate decision recorded in memory/features/coachhelm-ai.md.
--
-- Code that reads it: src/lib/coachhelm/v3/chat/engine/store.ts. The code
--   runs WITHOUT this migration: on 42703 / PGRST204 it replays earlier turns
--   as text and keeps a waiting card's turn in its action-ledger row
--   (golf_coachhelm_action_runs.proposed_input.resume). Applying this
--   migration changes no behaviour a coach can see except that the model
--   remembers its earlier reads exactly instead of as prose.
--
-- ORDER: after 20260725170000 (ui_parts, the action ledger). Independent of
--   the other held Ask migrations (20261101090000 .. 090300): any order.
--
-- VERIFY: select 1 where (select count(*) from information_schema.columns
-- VERIFY:   where table_schema = 'public' and table_name =
-- VERIFY:   'golf_coachhelm_chat_messages' and column_name in
-- VERIFY:   ('model_messages', 'pending_decision') and data_type = 'jsonb'
-- VERIFY:   and is_nullable = 'YES') = 2;
-- VERIFY: select 1 where (select count(*) from pg_catalog.pg_constraint
-- VERIFY:   where conrelid = 'public.golf_coachhelm_chat_messages'::regclass
-- VERIFY:   and conname in (
-- VERIFY:   'golf_coachhelm_chat_messages_model_messages_array',
-- VERIFY:   'golf_coachhelm_chat_messages_pending_decision_object')
-- VERIFY:   and convalidated) = 2;
-- VERIFY: select 1 where exists (select 1 from pg_catalog.pg_policies where
-- VERIFY:   schemaname = 'public' and tablename =
-- VERIFY:   'golf_coachhelm_chat_messages' and policyname =
-- VERIFY:   'chat_messages_coach_only' and cmd = 'ALL');
-- VERIFY: select 1 where not has_table_privilege('anon',
-- VERIFY:   'public.golf_coachhelm_chat_messages', 'SELECT');
--
-- ROLLBACK (one transaction; supabase/rollbacks/
--   20261110120000_coachhelm_chat_model_messages.rollback.sql):
-- ROLLBACK: alter table public.golf_coachhelm_chat_messages drop constraint
--   if exists golf_coachhelm_chat_messages_pending_decision_object;
-- ROLLBACK: alter table public.golf_coachhelm_chat_messages drop constraint
--   if exists golf_coachhelm_chat_messages_model_messages_array;
-- ROLLBACK: alter table public.golf_coachhelm_chat_messages drop column if
--   exists pending_decision;
-- ROLLBACK: alter table public.golf_coachhelm_chat_messages drop column if
--   exists model_messages;
--   Cost of rolling back: the stored model messages are lost. The chat keeps
--   working (it falls back to text replay, as before the migration), but a
--   card waiting for Confirm at that moment can no longer be confirmed and
--   says so.

-- No BEGIN or COMMIT in this file: db:apply runs the whole file and its ledger
-- row in one transaction, and a COMMIT here would close that transaction
-- before the ledger row is written.
SET lock_timeout = '3s';

ALTER TABLE public.golf_coachhelm_chat_messages
ADD COLUMN IF NOT EXISTS model_messages jsonb NULL;

ALTER TABLE public.golf_coachhelm_chat_messages
ADD COLUMN IF NOT EXISTS pending_decision jsonb NULL;

COMMENT ON COLUMN public.golf_coachhelm_chat_messages.model_messages IS
'CoachHelm chat: the exact model API messages this assistant turn added to the conversation (user message, assistant content blocks as returned including thinking signatures, tool results), in order. Append-only. NULL on user rows and on rows written before 20261110120000.'; -- noqa: LT05

COMMENT ON COLUMN public.golf_coachhelm_chat_messages.pending_decision IS
'CoachHelm chat: set while this assistant turn waits for the coach to confirm or cancel an action: { order, results, tasks, steps }. NULL when nothing waits.'; -- noqa: LT05

DO $chat_model_messages$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_chat_messages'::regclass
      AND conname = 'golf_coachhelm_chat_messages_model_messages_array'
  ) THEN
    ALTER TABLE public.golf_coachhelm_chat_messages
        ADD CONSTRAINT golf_coachhelm_chat_messages_model_messages_array
      CHECK (model_messages IS NULL
          OR jsonb_typeof(model_messages) = 'array') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_chat_messages'::regclass
      AND conname = 'golf_coachhelm_chat_messages_pending_decision_object'
  ) THEN
    ALTER TABLE public.golf_coachhelm_chat_messages
        ADD CONSTRAINT golf_coachhelm_chat_messages_pending_decision_object
      CHECK (pending_decision IS NULL
          OR jsonb_typeof(pending_decision) = 'object') NOT VALID;
  END IF;
END
$chat_model_messages$;

ALTER TABLE public.golf_coachhelm_chat_messages
VALIDATE CONSTRAINT golf_coachhelm_chat_messages_model_messages_array;

ALTER TABLE public.golf_coachhelm_chat_messages
VALIDATE CONSTRAINT golf_coachhelm_chat_messages_pending_decision_object;
