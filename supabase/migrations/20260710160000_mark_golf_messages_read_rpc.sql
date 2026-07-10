-- Feature-flow fix: golf messaging read-flag unread badge (P0)
--
-- markMessagesAsRead's flip of golf_messages.read=true for the OTHER
-- participant's rows was unconditionally blocked by RLS: the sole UPDATE
-- policy on golf_messages, golf_messages_update_v2, is
--   USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid())
-- Since that write targets rows where sender_id != viewer and the policy
-- only allows rows where sender_id = viewer, the two conditions are
-- mutually exclusive — the UPDATE always affected 0 rows, silently (no
-- error; caught by a try/catch that only logs). The 1:1 unread badge
-- (get_golf_conversations_with_details' `read = FALSE AND sender_id !=
-- viewer` count) could therefore never clear, no matter how many times a
-- conversation was opened and read.
--
-- Fix: a participant-checked SECURITY DEFINER RPC that performs the flip on
-- the caller's behalf, mirroring the pattern already used by
-- get_golf_conversations_with_details (20260621041824). Reuses the existing
-- user_conversation_ids() helper (defined in the 20260527 baseline) for the
-- participant check instead of re-deriving it inline.
CREATE OR REPLACE FUNCTION public.mark_golf_messages_read(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN; -- unauthenticated -> no-op
  END IF;

  -- Participant check: never trust the caller-supplied conversation id on
  -- its own — only flip rows in a conversation the caller actually belongs
  -- to (same helper golf_conversations_select_v2/_update_v2 RLS policies
  -- are built on).
  IF NOT EXISTS (
    SELECT 1 FROM public.user_conversation_ids(v_uid) AS conv_id
    WHERE conv_id = p_conversation_id
  ) THEN
    RETURN;
  END IF;

  UPDATE golf_messages
  SET read = true
  WHERE conversation_id = p_conversation_id
    AND sender_id != v_uid
    AND read = false;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_golf_messages_read(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_golf_messages_read(uuid) TO authenticated, service_role;
