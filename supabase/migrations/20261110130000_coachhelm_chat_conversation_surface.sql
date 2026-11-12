-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 10 Nov 2026 for the CoachHelm chat rebuild (quick chat lists its own
--   earlier threads). Not applied anywhere, not run against any database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261110130000_coachhelm_chat_conversation_surface.sql
--   after npm run test:rls passes on a local stack (the pgTAP file is
--   supabase/tests/rls/coachhelm_chat_conversation_surface.sql).
--
-- Risk: LOW. Additive only: one nullable text column and one CHECK constraint
--   on public.golf_coachhelm_chat_conversations. No row is rewritten, no
--   existing column, policy, grant or index changes, and every row valid today
--   stays valid (the column is NULL on every existing row). ADD COLUMN with no
--   default is a catalog-only change; the constraint is added NOT VALID and
--   validated in a second statement, both inside the one transaction db:apply
--   gives the file. The table is small (hundreds of rows) and lock_timeout
--   bounds the wait at 3s.
--
-- What: surface text NULL: which chat surface a conversation was started on
--   ('ask', 'quick_chat' or 'practice_helper'), written once when the
--   conversation is created and never changed. NULL on conversations created
--   before this migration and on a database without it. The conversations list
--   returns it so quick chat can list its own earlier threads.
--
-- RLS: unchanged. The table's existing policies already scope every column
--   of a row to the owning coach. Grants unchanged (table level).
--
-- Code that reads and writes it: src/lib/coachhelm/v3/chat/persistence.ts
--   (createConversation, listConversations). The code runs WITHOUT this
--   migration: on 42703 / PGRST204 it creates the conversation without the
--   label and lists every conversation with surface null.
--
-- ORDER: independent of 20261110120000 and of the other held Ask migrations.
--
-- VERIFY: select 1 where exists (select 1 from information_schema.columns
-- VERIFY:   where table_schema = 'public' and table_name =
-- VERIFY:   'golf_coachhelm_chat_conversations' and column_name = 'surface'
-- VERIFY:   and data_type = 'text' and is_nullable = 'YES');
-- VERIFY: select 1 where exists (select 1 from pg_catalog.pg_constraint
-- VERIFY:   where conrelid =
-- VERIFY:   'public.golf_coachhelm_chat_conversations'::regclass and conname =
-- VERIFY:   'golf_coachhelm_chat_conversations_surface_known'
-- VERIFY:   and convalidated);
-- VERIFY: select 1 where not has_table_privilege('anon',
-- VERIFY:   'public.golf_coachhelm_chat_conversations', 'SELECT');
--
-- ROLLBACK (one transaction; supabase/rollbacks/
--   20261110130000_coachhelm_chat_conversation_surface.rollback.sql):
-- ROLLBACK: alter table public.golf_coachhelm_chat_conversations drop
--   constraint if exists golf_coachhelm_chat_conversations_surface_known;
-- ROLLBACK: alter table public.golf_coachhelm_chat_conversations drop column
--   if exists surface;
--   Cost of rolling back: the labels are lost; every conversation lists with
--   surface null again and quick chat's own history shows nothing until new
--   conversations are labelled. No conversation or message is lost.

-- No BEGIN or COMMIT in this file: db:apply runs the whole file and its ledger
-- row in one transaction, and a COMMIT here would close that transaction
-- before the ledger row is written.
SET lock_timeout = '3s';

ALTER TABLE public.golf_coachhelm_chat_conversations
ADD COLUMN IF NOT EXISTS surface text NULL;

COMMENT ON COLUMN public.golf_coachhelm_chat_conversations.surface IS
'CoachHelm chat: the surface the conversation was started on (ask, quick_chat, practice_helper). Written once at creation. NULL on conversations created before 20261110130000.'; -- noqa: LT05

DO $chat_conversation_surface$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_chat_conversations'::regclass
      AND conname = 'golf_coachhelm_chat_conversations_surface_known'
  ) THEN
    ALTER TABLE public.golf_coachhelm_chat_conversations
        ADD CONSTRAINT golf_coachhelm_chat_conversations_surface_known
      CHECK (surface IS NULL
          OR surface IN ('ask', 'quick_chat', 'practice_helper')) NOT VALID;
  END IF;
END
$chat_conversation_surface$;

ALTER TABLE public.golf_coachhelm_chat_conversations
VALIDATE CONSTRAINT golf_coachhelm_chat_conversations_surface_known;
