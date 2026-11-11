-- ROLLBACK for 20261110130000_coachhelm_chat_conversation_surface.sql.
--
-- Prior definition: public.golf_coachhelm_chat_conversations had no surface column and no surface CHECK constraint (the
-- forward migration only adds; it changes no existing column, policy, grant or index). Before this file is used against
-- production, confirm that against the live catalog (information_schema.columns for the table) and record the capture date
-- here: this file was written with the migration on 2026-11-10, when the migration had not been applied anywhere, so there
-- was nothing live to capture yet.
--
-- Forward change: branch agent/coachhelm-chat-rebuild (the commit that adds the migration). Approval and deployment
-- record to update on apply: supabase/migrations/HELD.md, the row for this migration.
--
-- WHAT ROLLING BACK COSTS: every conversation's surface label is deleted. The chat keeps working
-- (src/lib/coachhelm/v3/chat/persistence.ts creates and lists conversations without the column), and quick chat's own
-- history shows nothing until new conversations are labelled. No conversation or message is lost.
--
-- Sentry verification window after a rollback: one hour of chat traffic with no "createConversation" failures
-- (action v3.chat.stream.conv) and no failures of the conversations list (action v3.chat.conversations).

BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.golf_coachhelm_chat_conversations
DROP CONSTRAINT IF EXISTS golf_coachhelm_chat_conversations_surface_known;

ALTER TABLE public.golf_coachhelm_chat_conversations
DROP COLUMN IF EXISTS surface;

COMMIT;

-- Verification (expect one row):
-- select 1 where not exists (select 1 from information_schema.columns where table_schema = 'public'
--   and table_name = 'golf_coachhelm_chat_conversations' and column_name = 'surface');
