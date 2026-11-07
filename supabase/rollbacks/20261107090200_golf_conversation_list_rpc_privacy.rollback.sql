-- ROLLBACK for 20261107090200_golf_conversation_list_rpc_privacy.sql.
-- Restores the body that production serves today (read-only copy 2026-11-07, identical to 20261008160000).
-- WARNING: this puts the participant_names e-mail leak and the shared-flag unread count back. Use it only to restore a
-- broken caller while a fix is prepared.

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.get_golf_conversations_with_details(p_user_id uuid)
RETURNS TABLE(id uuid, created_at timestamptz, updated_at timestamptz, creator_id uuid, last_message_content text, last_message_at timestamptz, last_message_sender_id uuid, unread_count bigint, participant_ids uuid[], participant_names text[], is_group boolean, title text, participant_count bigint, is_team_channel boolean)
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
