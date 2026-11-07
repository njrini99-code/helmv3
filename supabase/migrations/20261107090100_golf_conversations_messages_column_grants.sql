-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). PRIORITY: security fix, ships ahead of the Messages redesign.
-- Apply: npm run db:apply -- supabase/migrations/20261107090100_golf_conversations_messages_column_grants.sql
-- Risk: MEDIUM. No data changes, but it narrows who can write which column on the two hottest messaging tables.
-- Columns the app writes (full sweep 2026-11-07 over src/**, scripts/**, supabase/functions/**, including the
-- participantsTable / messagesTable variable forms and every .upsert):
--   golf_conversations: updated_at only (messages.ts:278 + :1228, message-attachments.ts:285, message-polls.ts:130).
--   golf_messages:      content + edited_at (updateMessage), is_deleted + content + payload (deleteMessage, closeGolfPoll),
--                       has_attachments (message-attachments.ts:273 AND the SECURITY INVOKER trigger
--                       update_message_has_attachments(), which runs as the sender), read (only by the DEFINER RPC
--                       mark_golf_messages_read, which this does not affect).
--   service_role (the push fan-out stamps notify_anyway_pushed_at) is unaffected by column grants.
-- App change needed: NONE. `title` and `read` are in the grant because the coordinator asked for them; nothing in src writes
-- either on Golf today, so dropping them from the lists below is a safe tightening.
--
-- The holes (confirmed on production and staging, 2026-11-07):
--   golf_conversations_update_v2 lets ANY member update EVERY column. golf_conversation_created_by_me() reads created_by, and
--   golf_participants_insert_v2 / golf_participants_delete trust it, so a member can set created_by to themselves and then
--   remove coaches from a team chat, or set team_id to another team and add that team's players (minors) to the chat.
--   golf_messages_update_v2 is `sender_id = auth.uid()` with every column writable, so a sender can set conversation_id to a
--   conversation they are not in (skipping the INSERT membership check) and back-date created_at.
--   golf_conversations_insert_v2 does not tie created_by to the caller, so a user can create a conversation "owned" by
--   someone else (and make that person the add/remove authority).
--
-- The fix:
--   1. Column grants. golf_conversations: UPDATE (updated_at). golf_messages: UPDATE (content, edited_at, is_deleted,
--      payload, read, has_attachments). Everything else becomes read-only to clients. pinned_at / pinned_by / reply_to_id /
--      kind / notify_anyway* are not writable by clients either (notify_anyway* are also guarded by their own trigger).
--   2. BEFORE UPDATE guards that freeze identity columns for authenticated and anon sessions even if a grant is widened:
--      conversations: id, created_by, team_id, is_team_chat, is_team_channel, created_at.
--      messages:      id, conversation_id, sender_id, created_at, kind, reply_to_id.
--      They key on current_user, not the JWT, so the table owner, service_role and SECURITY DEFINER code pass. That also lets
--      Postgres run its own `ON DELETE SET NULL` updates (golf_messages.reply_to_id, golf_conversations.team_id): those run as
--      the table owner. Without that a sender could not hard-delete a message that has a reply.
--   3. golf_conversations_insert_v2 now also requires created_by = auth.uid(). Both app inserts already set it
--      (messages.ts:439 and :1055). The team channel is created by service-role scripts, which bypass RLS.
--   4. anon loses every privilege on both tables (defence in depth; RLS is all that keeps anon out today).
--
-- Not changed (follow-up, report): any team player can INSERT a conversation with is_team_channel = true (the policy only
-- checks team membership). That is a separate decision for the owner; see the report.
--
-- ORDER: after 20261107090000. No app deploy is needed before or after.
--
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_conversations', 'UPDATE') and not has_table_privilege('authenticated', 'public.golf_messages', 'UPDATE') and not has_table_privilege('anon', 'public.golf_conversations', 'SELECT') and not has_table_privilege('anon', 'public.golf_messages', 'SELECT');
-- VERIFY: select 1 where has_column_privilege('authenticated', 'public.golf_conversations', 'updated_at', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_conversations', 'title', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversations', 'created_by', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversations', 'team_id', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversations', 'is_team_chat', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversations', 'is_team_channel', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversations', 'created_at', 'UPDATE');
-- VERIFY: select 1 where has_column_privilege('authenticated', 'public.golf_messages', 'content', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_messages', 'edited_at', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_messages', 'is_deleted', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_messages', 'payload', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_messages', 'read', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_messages', 'has_attachments', 'UPDATE');
-- VERIFY: select 1 where not has_column_privilege('authenticated', 'public.golf_messages', 'conversation_id', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_messages', 'sender_id', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_messages', 'created_at', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_messages', 'kind', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_messages', 'reply_to_id', 'UPDATE');
-- VERIFY: select 1 where (select count(*) from pg_trigger where not tgisinternal and tgname in ('golf_conversations_identity_guard', 'golf_messages_identity_guard')) = 2;
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_conversations' and policyname = 'golf_conversations_insert_v2' and with_check like '%created_by%';
--
-- ROLLBACK: (one transaction; re-opens the holes, use only to restore a broken writer while a fix is prepared):
--   drop trigger if exists golf_messages_identity_guard on public.golf_messages;
--   drop trigger if exists golf_conversations_identity_guard on public.golf_conversations;
--   drop function if exists public.golf_messages_identity_guard();
--   drop function if exists public.golf_conversations_identity_guard();
--   grant update on public.golf_conversations to authenticated;
--   grant update on public.golf_messages to authenticated;
--   drop policy if exists golf_conversations_insert_v2 on public.golf_conversations;
--   create policy golf_conversations_insert_v2 on public.golf_conversations for insert
--     with check (team_id is null or public.is_golf_team_coach(team_id) or public.is_golf_team_player(team_id));
--   -- anon had ALL privileges before; do not restore them unless something proves a need.
-- pgTAP: supabase/tests/rls/golf_conversations_messages_column_grants.sql

SET lock_timeout = '3s';

DO $$
DECLARE
  v_col text;
BEGIN
  IF to_regclass('public.golf_conversations') IS NULL
     OR to_regclass('public.golf_messages') IS NULL THEN
    RAISE EXCEPTION 'golf_conversations / golf_messages are missing';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['title', 'updated_at', 'created_by', 'team_id',
      'is_team_chat', 'is_team_channel', 'created_at'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'golf_conversations'
        AND column_name = v_col
    ) THEN
      RAISE EXCEPTION 'golf_conversations.% is missing', v_col;
    END IF;
  END LOOP;
  FOREACH v_col IN ARRAY ARRAY['content', 'edited_at', 'is_deleted', 'payload',
      'read', 'has_attachments', 'conversation_id', 'sender_id', 'created_at',
      'kind', 'reply_to_id'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'golf_messages'
        AND column_name = v_col
    ) THEN
      RAISE EXCEPTION 'golf_messages.% is missing', v_col;
    END IF;
  END LOOP;
END $$;

-- 1. Grants ------------------------------------------------------------------

REVOKE UPDATE ON public.golf_conversations FROM PUBLIC, anon, authenticated;
GRANT UPDATE (updated_at) ON public.golf_conversations TO authenticated;

REVOKE UPDATE ON public.golf_messages FROM PUBLIC, anon, authenticated;
GRANT UPDATE (content, edited_at, is_deleted, payload, has_attachments)
ON public.golf_messages TO authenticated;

REVOKE ALL ON public.golf_conversations FROM anon;
REVOKE ALL ON public.golf_messages FROM anon;

-- 2. Identity guards ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.golf_conversations_identity_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Client sessions only. service_role, the table owner and definer functions pass,
  -- and so does Postgres's own ON DELETE SET NULL on team_id (it runs as the owner).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.is_team_chat IS DISTINCT FROM OLD.is_team_chat
     OR NEW.is_team_channel IS DISTINCT FROM OLD.is_team_channel
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A conversation''s owner, team and kind cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.golf_conversations_identity_guard() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS golf_conversations_identity_guard ON public.golf_conversations;
CREATE TRIGGER golf_conversations_identity_guard
BEFORE UPDATE ON public.golf_conversations
FOR EACH ROW
WHEN (
    old.id IS DISTINCT FROM new.id
    OR old.created_by IS DISTINCT FROM new.created_by
    OR old.team_id IS DISTINCT FROM new.team_id
    OR old.is_team_chat IS DISTINCT FROM new.is_team_chat
    OR old.is_team_channel IS DISTINCT FROM new.is_team_channel
    OR old.created_at IS DISTINCT FROM new.created_at
)
EXECUTE FUNCTION public.golf_conversations_identity_guard();

CREATE OR REPLACE FUNCTION public.golf_messages_identity_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Client sessions only. Postgres's ON DELETE SET NULL on reply_to_id runs as the
  -- table owner, so deleting a message that has replies still works.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id THEN
    RAISE EXCEPTION 'A message cannot be moved, re-attributed, back-dated or re-typed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.golf_messages_identity_guard() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS golf_messages_identity_guard ON public.golf_messages;
CREATE TRIGGER golf_messages_identity_guard
BEFORE UPDATE ON public.golf_messages
FOR EACH ROW
WHEN (
    old.id IS DISTINCT FROM new.id
    OR old.conversation_id IS DISTINCT FROM new.conversation_id
    OR old.sender_id IS DISTINCT FROM new.sender_id
    OR old.created_at IS DISTINCT FROM new.created_at
    OR old.kind IS DISTINCT FROM new.kind
    OR old.reply_to_id IS DISTINCT FROM new.reply_to_id
)
EXECUTE FUNCTION public.golf_messages_identity_guard();

-- 3. A conversation is created as yourself ------------------------------------

DROP POLICY IF EXISTS golf_conversations_insert_v2 ON public.golf_conversations;
CREATE POLICY golf_conversations_insert_v2 ON public.golf_conversations
FOR INSERT TO authenticated
WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
        team_id IS NULL
        OR public.is_golf_team_coach(team_id)
        OR public.is_golf_team_player(team_id)
    )
);
