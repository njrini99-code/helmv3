-- STATUS: WRITTEN, NOT APPLIED. Held for the owner's apply
-- (supabase/migrations/HELD.md). Prepared for Clubhouse Messages: "Delete
-- conversation" (owner, 2026-10-08), a per-person hide of a conversation.
-- Apply: npm run db:apply --
-- supabase/migrations/20261008160000_golf_conversation_hidden_at.sql
-- Risk: LOW. One nullable column with no default and no backfill (a
-- catalog-only change, no table rewrite), and the inbox function re-created
-- with one extra WHERE condition that every existing row passes (hidden_at is
-- NULL everywhere). Grants, owner, SECURITY DEFINER and search_path are kept as
-- they are live (checked 2026-10-08 with pg_get_functiondef).
--
-- What it does. A participant can hide a conversation from their own inbox
-- without leaving it and without touching what anyone else sees: the row's
-- hidden_at is set to now(). The inbox function (get_golf_conversations_with_
-- details) skips a conversation whose hidden_at is set unless a message has
-- arrived after it, so a new message brings the thread back on its own. The
-- messages themselves are never changed or deleted. Team channels are not
-- hideable; the server action refuses them.
--
-- RLS: unchanged. The baseline's "golf_participants_update" (UPDATE, user_id =
-- auth.uid(), with the same check) already lets a participant write their own
-- row, as the mute setting does; the table grants are table-wide, so the new
-- column is covered as the existing ones are.
--
-- Nothing depends on it before it is applied: the Clubhouse offers "Delete
-- conversation" only when a probe of the column succeeds, and the server action
-- answers "not available yet" if the column is missing. Applying turns it on;
-- then run npm run db:types.
--
-- ROLLBACK: ALTER TABLE public.golf_conversation_participants
--   DROP COLUMN IF EXISTS hidden_at;
-- and re-create get_golf_conversations_with_details from
-- 20260803120100_bind_definer_rpcs_to_session.sql (its body is the live one
-- minus the hidden_at condition). Dropping the column first would break the
-- function, so restore the function in the same transaction.
--
-- VERIFY: select count(*) = 1 from information_schema.columns
-- VERIFY: where table_schema = 'public'
-- VERIFY: and table_name = 'golf_conversation_participants'
-- VERIFY: and column_name = 'hidden_at' and is_nullable = 'YES';
-- VERIFY: select count(*) = 1 from pg_proc p
-- VERIFY: join pg_namespace n on n.oid = p.pronamespace
-- VERIFY: where n.nspname = 'public'
-- VERIFY: and p.proname = 'get_golf_conversations_with_details'
-- VERIFY: and pg_get_functiondef(p.oid) like '%hidden_at%';

SET lock_timeout = '3s';

ALTER TABLE public.golf_conversation_participants
ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

COMMENT ON COLUMN public.golf_conversation_participants.hidden_at IS
'When this participant hid the conversation from their own inbox '
'(Clubhouse Delete conversation). Null: shown. A message newer than '
'this brings the conversation back. Per person; the conversation and '
'its messages are untouched.';

CREATE OR REPLACE FUNCTION public.get_golf_conversations_with_details(
    p_user_id uuid
)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    updated_at timestamptz,
    creator_id uuid,
    last_message_content text,
    last_message_at timestamptz,
    last_message_sender_id uuid,
    unread_count bigint,
    participant_ids uuid[],
    participant_names text[],
    is_group boolean,
    title text,
    participant_count bigint,
    is_team_channel boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.created_at, c.updated_at, c.created_by,
    (SELECT m.content FROM golf_messages m WHERE m.conversation_id=c.id AND m.is_deleted=FALSE ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.created_at FROM golf_messages m WHERE m.conversation_id=c.id AND m.is_deleted=FALSE ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.sender_id FROM golf_messages m WHERE m.conversation_id=c.id AND m.is_deleted=FALSE ORDER BY m.created_at DESC LIMIT 1),
    (SELECT COUNT(*) FROM golf_messages m WHERE m.conversation_id=c.id AND m.read=FALSE AND m.is_deleted=FALSE AND m.sender_id!=v_uid),
    ARRAY(SELECT cp2.user_id FROM golf_conversation_participants cp2 WHERE cp2.conversation_id=c.id),
    ARRAY(SELECT COALESCE(u.email,'Unknown') FROM golf_conversation_participants cp2 JOIN users u ON u.id=cp2.user_id WHERE cp2.conversation_id=c.id),
    COALESCE(c.is_team_chat,FALSE), c.title,
    (SELECT COUNT(*) FROM golf_conversation_participants cp2 WHERE cp2.conversation_id=c.id),
    COALESCE(c.is_team_channel,FALSE)
  FROM golf_conversations c JOIN golf_conversation_participants cp ON cp.conversation_id=c.id
  WHERE cp.user_id=v_uid
    AND (
      cp.hidden_at IS NULL
      OR EXISTS (SELECT 1 FROM golf_messages hm WHERE hm.conversation_id=c.id AND hm.is_deleted=FALSE AND hm.created_at > cp.hidden_at)
    )
  ORDER BY c.is_team_channel DESC NULLS LAST, c.updated_at DESC;
END;
$function$;
