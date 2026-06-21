-- Wave A · A1 — Harden get_golf_conversations_with_details
-- Audit findings: F004 (CRITICAL IDOR), F071 (soft-deleted message leak into preview/unread)
--
-- Before: SECURITY DEFINER function scoped to a CALLER-SUPPLIED p_user_id and
-- EXECUTE-granted to anon + PUBLIC -> any anon-key holder could read any user's
-- conversation list (last messages, participant user_ids + emails).
--
-- Fix: ignore p_user_id; always scope to auth.uid(). Exclude soft-deleted
-- messages from the last-message preview and unread count. Revoke anon/PUBLIC
-- EXECUTE (authenticated + service_role retain it). Signature preserved for
-- caller compatibility; the parameter is intentionally unused.
CREATE OR REPLACE FUNCTION public.get_golf_conversations_with_details(p_user_id uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, creator_id uuid, last_message_content text, last_message_at timestamp with time zone, last_message_sender_id uuid, unread_count bigint, participant_ids uuid[], participant_names text[], is_group boolean, title text, participant_count bigint, is_team_channel boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- IDOR fix: never trust the supplied p_user_id; always use the authenticated caller.
  IF v_uid IS NULL THEN
    RETURN; -- unauthenticated -> no rows
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.created_at,
    c.updated_at,
    c.created_by AS creator_id,
    (
      SELECT m.content FROM golf_messages m
      WHERE m.conversation_id = c.id AND m.is_deleted = FALSE
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_content,
    (
      SELECT m.created_at FROM golf_messages m
      WHERE m.conversation_id = c.id AND m.is_deleted = FALSE
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_at,
    (
      SELECT m.sender_id FROM golf_messages m
      WHERE m.conversation_id = c.id AND m.is_deleted = FALSE
      ORDER BY m.created_at DESC LIMIT 1
    ) AS last_message_sender_id,
    (
      SELECT COUNT(*) FROM golf_messages m
      WHERE m.conversation_id = c.id
        AND m.read = FALSE
        AND m.is_deleted = FALSE
        AND m.sender_id != v_uid
    ) AS unread_count,
    ARRAY(
      SELECT cp2.user_id FROM golf_conversation_participants cp2
      WHERE cp2.conversation_id = c.id
    ) AS participant_ids,
    ARRAY(
      SELECT COALESCE(u.email, 'Unknown')
      FROM golf_conversation_participants cp2
      JOIN users u ON u.id = cp2.user_id
      WHERE cp2.conversation_id = c.id
    ) AS participant_names,
    COALESCE(c.is_team_chat, FALSE) AS is_group,
    c.title,
    (
      SELECT COUNT(*) FROM golf_conversation_participants cp2
      WHERE cp2.conversation_id = c.id
    ) AS participant_count,
    COALESCE(c.is_team_channel, FALSE) AS is_team_channel
  FROM golf_conversations c
  JOIN golf_conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = v_uid
  ORDER BY
    c.is_team_channel DESC NULLS LAST,
    c.updated_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_golf_conversations_with_details(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_golf_conversations_with_details(uuid) TO authenticated, service_role;
