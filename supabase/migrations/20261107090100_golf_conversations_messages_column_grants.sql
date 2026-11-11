-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). PRIORITY: security fix,
-- ships ahead of the Messages redesign.
-- Apply: npm run db:apply -- <the path on the next line>
-- supabase/migrations/20261107090100_golf_conversations_messages_column_grants.sql  -- noqa: LT05
-- Risk: MEDIUM. No data changes, but it narrows who can write which column on
-- the two hottest messaging tables. Columns the app writes (full sweep
-- 2026-11-07 over src/**, scripts/**, supabase/functions/**, including the
-- participantsTable / messagesTable variable forms and every .upsert):
--   golf_conversations: updated_at only (messages.ts:278 + :1228,
--     message-attachments.ts:285, message-polls.ts:130).
--   golf_messages: content + edited_at (updateMessage); is_deleted + content
--     + payload (deleteMessage, closeGolfPoll); has_attachments
--     (message-attachments.ts:273 AND the SECURITY INVOKER trigger
--     update_message_has_attachments(), which runs as the sender). `read` is
--     written only by the DEFINER RPC mark_golf_messages_read, which column
--     grants do not affect.
--   service_role (the push fan-out stamps notify_anyway_pushed_at) is
--   unaffected by column grants.
-- App change needed: NONE. `title` and `read` are NOT granted: nothing in src
-- writes either on Golf, and a writable `title` would let any member rename a
-- coach's group. Checked 2026-11-10 against both the build production serves
-- (d0f467a73) and main (743cb23a1): every client write to these two tables
-- touches only the columns granted below, and both conversation inserts set
-- created_by to the caller.
--
-- The holes (confirmed on production and staging, 2026-11-07):
--   golf_conversations_update_v2 lets ANY member update EVERY column.
--   golf_conversation_created_by_me() reads created_by, and
--   golf_participants_insert_v2 / golf_participants_delete trust it, so a
--   member can set created_by to themselves and then remove coaches from a team
--   chat, or set team_id to another team and add that team's players (minors)
--   to the chat. golf_messages_update_v2 is `sender_id = auth.uid()` with every
--   column writable, so a sender can set conversation_id to a conversation they
--   are not in (skipping the INSERT membership check) and back-date created_at.
--   golf_conversations_insert_v2 does not tie created_by to the caller, so a
--   user can create a conversation "owned" by someone else (and make that
--   person the add/remove authority).
--
-- The fix:
--   1. Column grants. golf_conversations: UPDATE (updated_at). golf_messages:
--      UPDATE (content, edited_at, is_deleted, payload, has_attachments). A
--      client can no longer UPDATE any other column of an existing row: title,
--      created_by, team_id, is_team_chat, is_team_channel, created_at;
--      conversation_id, sender_id, created_at, kind, reply_to_id, read,
--      pinned_at, pinned_by, notify_anyway* (the last also have their own
--      trigger).
--      That is UPDATE only. INSERT keeps its table-wide grant, so on a NEW row
--      a client still sets every column the INSERT policies do not check.
--      Closed elsewhere: is_team_channel = true on a new conversation
--      (20261110090050). Not closed in this release: created_at, kind =
--      'system' and reply_to_id on a new message (20261110090100, deferred by
--      owner direction 2026-11-10). Still the caller's choice on INSERT after
--      all the
--      files: pinned_at, pinned_by, edited_at, is_deleted and read on a new
--      message; title, is_team_chat, created_at and updated_at on a new
--      conversation.
--   2. BEFORE UPDATE guards that freeze identity columns for authenticated and
--      anon sessions even if a grant is widened:
--        conversations: id, created_by, team_id, is_team_chat,
--                       is_team_channel, created_at.
--        messages:      id, conversation_id, sender_id, created_at, kind,
--                       reply_to_id.
--      They key on current_user, not the JWT, so the table owner, service_role
--      and SECURITY DEFINER code pass. That also lets Postgres run its own
--      `ON DELETE SET NULL` updates (golf_messages.reply_to_id,
--      golf_conversations.team_id): those run as the table owner. Without that
--      a sender could not hard-delete a message that has a reply.
--   3. golf_conversations_insert_v2 now also requires created_by = auth.uid().
--      Both app inserts already set it (messages.ts:439 and :1055). The team
--      channel is created by service-role scripts, which bypass RLS.
--   4. authenticated also loses TRUNCATE, MAINTAIN, TRIGGER and REFERENCES on
--      both tables (both reviews, 2026-11-10) and keeps SELECT, INSERT, DELETE
--      and the column UPDATEs above. TRUNCATE ignores RLS: `TRUNCATE
--      golf_messages CASCADE` is stopped by nothing else on production today
--      (authenticated holds TRUNCATE on the four tables that reference
--      golf_messages there, per the schema mirror), while `TRUNCATE
--      golf_conversations CASCADE` is refused only because authenticated has no
--      TRUNCATE on golf_conversation_read_marks. TRIGGER lets its holder attach
--      any trigger function it may execute; MAINTAIN is VACUUM / ANALYZE /
--      REINDEX / CLUSTER. None is reachable through PostgREST, so this is
--      defence in depth. authenticated still holds TRUNCATE on
--      golf_message_attachments, _mentions, _reactions and _responses (GRANT
--      ALL, like most Golf tables); that is a wider sweep, not this file.
--      Nothing needs them (local stack with every migration applied,
--      2026-11-10): the twelve foreign keys that reference these two tables all
--      sit on tables owned by postgres, and REFERENCES is only checked when a
--      constraint is CREATED, for the role creating it (the checks themselves
--      run as the table owner, so a client's message, attachment or reaction
--      insert still passes them); authenticated and anon own no table and
--      cannot create one in public; no function, cron job or client path
--      truncates, maintains or puts a trigger on either table.
--   5. anon loses every privilege on both tables (defence in depth; RLS is all
--      that keeps anon out today).
--
-- Not closed by this file: INSERT, beyond created_by (see point 1). In
-- particular any team player can still INSERT a conversation with
-- is_team_channel = true until 20261110090050 is applied, and a sender still
-- chooses created_at, kind and reply_to_id of a new message (20261110090100
-- would close that; it is deferred and not in this release).
--
-- LOCKS (pg_locks after each statement, local stack 2026-11-10). Two table
-- locks, each taken once, at the top:
--   golf_messages       SHARE ROW EXCLUSIVE, what CREATE OR REPLACE TRIGGER
--                       needs: writes wait, reads do not.
--   golf_conversations  ACCESS EXCLUSIVE, what DROP / CREATE POLICY needs:
--                       reads and writes wait.
-- GRANT and REVOKE take no table lock. An earlier draft took them as it went,
-- conversations first, then messages, and its DROP TRIGGER IF EXISTS took
-- ACCESS EXCLUSIVE on both tables wherever the trigger existed, so on every
-- re-apply (on a first apply, with nothing to drop, only a brief ACCESS SHARE).
-- Why messages first: a send holds its lock on golf_messages while its
-- foreign-key check reads golf_conversations. If this file held
-- golf_conversations and then waited for golf_messages, a send that arrived
-- while it waited would deadlock with it (reproduced on a scratch database;
-- Postgres cancels one of the two after deadlock_timeout). With golf_messages
-- first, a send waits at golf_messages holding nothing this file needs.
-- While this file waits for golf_conversations (a long read of it is what makes
-- it wait), reads of golf_conversations and writes to golf_messages queue
-- behind it; lock_timeout ends that after 3s with nothing changed. Apply
-- off-peak and run it again if it times out.
-- The locks sit in a DO block because `supabase db reset` refuses a top-level
-- LOCK TABLE ("can only be used in transaction blocks": it sends the file as
-- one pipeline, not inside BEGIN).
--
-- ORDER: after 20261107090000. No app deploy is needed before or after.
--
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_conversations', 'UPDATE') and not has_table_privilege('authenticated', 'public.golf_messages', 'UPDATE') and not has_table_privilege('anon', 'public.golf_conversations', 'SELECT') and not has_table_privilege('anon', 'public.golf_messages', 'SELECT'); -- noqa: LT05
-- VERIFY: select 1 where has_column_privilege('authenticated', 'public.golf_conversations', 'updated_at', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversations', 'title', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversations', 'created_by', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversations', 'team_id', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversations', 'is_team_chat', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversations', 'is_team_channel', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_conversations', 'created_at', 'UPDATE'); -- noqa: LT05
-- VERIFY: select 1 where has_column_privilege('authenticated', 'public.golf_messages', 'content', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_messages', 'edited_at', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_messages', 'is_deleted', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_messages', 'payload', 'UPDATE') and has_column_privilege('authenticated', 'public.golf_messages', 'has_attachments', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_messages', 'read', 'UPDATE'); -- noqa: LT05
-- VERIFY: select 1 where not has_column_privilege('authenticated', 'public.golf_messages', 'conversation_id', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_messages', 'sender_id', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_messages', 'created_at', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_messages', 'kind', 'UPDATE') and not has_column_privilege('authenticated', 'public.golf_messages', 'reply_to_id', 'UPDATE'); -- noqa: LT05
-- VERIFY: select 1 where exists (select 1 from pg_trigger where tgrelid = 'public.golf_conversations'::regclass and tgname = 'golf_conversations_identity_guard' and not tgisinternal and tgenabled = 'O') and exists (select 1 from pg_trigger where tgrelid = 'public.golf_messages'::regclass and tgname = 'golf_messages_identity_guard' and not tgisinternal and tgenabled = 'O'); -- noqa: LT05
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_conversations' and policyname = 'golf_conversations_insert_v2' and with_check like '%created_by%'; -- noqa: LT05
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_conversations', 'TRUNCATE, MAINTAIN, TRIGGER, REFERENCES') and not has_table_privilege('authenticated', 'public.golf_messages', 'TRUNCATE, MAINTAIN, TRIGGER, REFERENCES'); -- noqa: LT05
-- VERIFY: select 1 where has_table_privilege('authenticated', 'public.golf_conversations', 'SELECT') and has_table_privilege('authenticated', 'public.golf_conversations', 'INSERT') and has_table_privilege('authenticated', 'public.golf_conversations', 'DELETE') and has_table_privilege('authenticated', 'public.golf_messages', 'SELECT') and has_table_privilege('authenticated', 'public.golf_messages', 'INSERT') and has_table_privilege('authenticated', 'public.golf_messages', 'DELETE'); -- noqa: LT05
--
-- ROLLBACK: (one transaction; re-opens the holes, use only to restore a broken
-- writer while a fix is prepared). ORDER: roll back 20261110090500's function,
-- 20261110090300 and 20261110090200 first, in that order. While they are live
-- they trust is_team_channel, and restoring UPDATE lets any member set it on a
-- conversation of their own:
--   drop trigger if exists golf_messages_identity_guard
--     on public.golf_messages;
--   drop trigger if exists golf_conversations_identity_guard
--     on public.golf_conversations;
--   drop function if exists public.golf_messages_identity_guard();
--   drop function if exists public.golf_conversations_identity_guard();
--   grant update on public.golf_conversations to authenticated;
--   grant update on public.golf_messages to authenticated;
--   drop policy if exists golf_conversations_insert_v2
--     on public.golf_conversations;
--   create policy golf_conversations_insert_v2
--     on public.golf_conversations for insert
--     with check (team_id is null or public.is_golf_team_coach(team_id)
--                 or public.is_golf_team_player(team_id));
--   -- authenticated also held TRUNCATE, MAINTAIN, TRIGGER and REFERENCES on
--   -- both tables, and anon held ALL. Nothing uses either; do not restore
--   -- them unless something proves a need:
--   -- grant truncate, maintain, trigger, references
--   --   on public.golf_conversations, public.golf_messages to authenticated;
--   -- grant all on public.golf_conversations, public.golf_messages to anon;
-- pgTAP: supabase/tests/rls/golf_conversations_messages_column_grants.sql

-- SET LOCAL: the timeout ends with this file's transaction, so it cannot
-- follow a reused connection. db:apply, supabase db reset and psql -1 each
-- run the file as one transaction; under a plain `psql -f` this line only
-- warns and no timeout is set, so never apply it that way.
SET LOCAL lock_timeout = '3s';

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

-- 0. Both table locks, once, messages first (see LOCKS in the header) ---------

DO $$
BEGIN
  LOCK TABLE public.golf_messages IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.golf_conversations IN ACCESS EXCLUSIVE MODE;
END $$;

-- 1. Grants -------------------------------------------------------------------

REVOKE UPDATE ON public.golf_conversations FROM public, anon, authenticated;
GRANT UPDATE (updated_at) ON public.golf_conversations TO authenticated;

REVOKE UPDATE ON public.golf_messages FROM public, anon, authenticated;
GRANT UPDATE (content, edited_at, is_deleted, payload, has_attachments)
ON public.golf_messages TO authenticated;

-- TRUNCATE ignores RLS, and none of these four is used by a client session.
-- The trailing noqa is for sqlfluff 4.4.0, whose Postgres grammar has no
-- MAINTAIN (new in Postgres 17) and so cannot parse these statements.
REVOKE TRUNCATE, MAINTAIN, TRIGGER, REFERENCES  -- noqa: PRS
ON public.golf_conversations FROM public, authenticated;
REVOKE TRUNCATE, MAINTAIN, TRIGGER, REFERENCES  -- noqa: PRS
ON public.golf_messages FROM public, authenticated;

REVOKE ALL ON public.golf_conversations FROM anon;
REVOKE ALL ON public.golf_messages FROM anon;

-- 2. Identity guards ----------------------------------------------------------

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

REVOKE ALL ON FUNCTION public.golf_conversations_identity_guard()
FROM public, anon;

CREATE OR REPLACE TRIGGER golf_conversations_identity_guard
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

REVOKE ALL ON FUNCTION public.golf_messages_identity_guard()
FROM public, anon;

CREATE OR REPLACE TRIGGER golf_messages_identity_guard
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
