-- ROLLBACK for 20261110120000_coachhelm_chat_model_messages.sql.
--
-- Prior definition: public.golf_coachhelm_chat_messages had no model_messages and no pending_decision column and neither
-- CHECK constraint (the forward migration only adds; it changes no existing column, policy, grant or index). Before this
-- file is used against production, confirm that against the live catalog (information_schema.columns for the table) and
-- record the capture date here: this file was written with the migration on 2026-11-10, when the migration had not been
-- applied anywhere, so there was nothing live to capture yet.
--
-- Forward change: branch agent/coachhelm-chat-rebuild (the commit that adds the migration). Approval and deployment
-- record to update on apply: supabase/migrations/HELD.md, the row for this migration.
--
-- WHAT ROLLING BACK COSTS: every stored model message and every pending decision is deleted. The chat keeps answering
-- (src/lib/coachhelm/v3/chat/engine/store.ts falls back to replaying earlier turns as text when the columns are missing),
-- but the model no longer sees its earlier reads exactly, and a card that is waiting for Confirm at that moment can no
-- longer be confirmed: the coach is told to ask again. No coach-visible history is lost (ui_parts and content are untouched).
--
-- Sentry verification window after a rollback: one hour of chat/stream traffic with no "history could not be read" and no
-- "turn not stored" events (actions v3.chat.stream.history and v3.chat.stream.persist).

BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.golf_coachhelm_chat_messages
DROP CONSTRAINT IF EXISTS golf_coachhelm_chat_messages_pending_decision_object;

ALTER TABLE public.golf_coachhelm_chat_messages
DROP CONSTRAINT IF EXISTS golf_coachhelm_chat_messages_model_messages_array;

ALTER TABLE public.golf_coachhelm_chat_messages
DROP COLUMN IF EXISTS pending_decision;

ALTER TABLE public.golf_coachhelm_chat_messages
DROP COLUMN IF EXISTS model_messages;

COMMIT;

-- Verification (expect one row):
-- select 1 where not exists (select 1 from information_schema.columns where table_schema = 'public'
--   and table_name = 'golf_coachhelm_chat_messages' and column_name in ('model_messages', 'pending_decision'));
