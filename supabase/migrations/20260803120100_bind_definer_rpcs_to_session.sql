-- ============================================================================
-- #1267 / #1268 — SECURITY DEFINER functions that filter on a caller-supplied
-- identity instead of auth.uid(). Pass any UUID, get that person's data.
--
-- Reproduced before this change, impersonating the demo golf player:
--   get_baseball_conversations_with_details('<another user>')  -> 2 conversations
--     (caller participates in 1, target in 2, shared 0; direct RLS read gives 1)
--   get_player_stats_summary('<a Guilford College player>')    -> full profile
--     (scoring avg 75.29, 15 rounds, best 68, GIR 64.75%, fairway 60.80%),
--     while golf_players and golf_rounds for that id both correctly return 0
--   user_conversation_ids('<another user>')                    -> 2 (own: 3)
--
-- Fix shape follows the golf twin, get_golf_conversations_with_details, which
-- was hardened by 20260621041824 and returns the caller's own rows regardless
-- of the argument.
--
-- Signatures are preserved deliberately: every existing caller keeps working.
-- For the two conversation functions the argument becomes vestigial — all five
-- RLS policies that call user_conversation_ids already pass
-- `(SELECT auth.uid())`, so binding to the session changes nothing for them:
--   golf_conversations_select_v2 / _update_v2,
--   golf_participants_select_v2,
--   golf_messages_select_v2 / _insert_v2
-- REVOKE was considered and rejected — those policies are evaluated as the
-- querying user, so removing EXECUTE from `authenticated` would break golf
-- messaging for everyone (observed: anon hits "permission denied for function
-- user_conversation_ids" on golf_messages).
--
-- get_player_stats_summary keeps a real parameter, because a coach legitimately
-- reads a player's summary. It gains the ownership check it never had.
-- ============================================================================

-- 1. Baseball conversations ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_baseball_conversations_with_details(p_user_id uuid)
RETURNS TABLE(
  id uuid, created_at timestamp with time zone, updated_at timestamp with time zone,
  creator_id text, last_message_content text, last_message_at timestamp with time zone,
  last_message_sender_id uuid, unread_count bigint,
  participant_ids uuid[], participant_names text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  -- p_user_id is retained for call-site compatibility and deliberately IGNORED.
  -- Filtering on it is what allowed any authenticated caller to read any user's
  -- inbox, message bodies included (#1267).
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.created_at,
    c.updated_at,
    c.created_by::text AS creator_id,
    (SELECT m.content    FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.created_at FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.sender_id  FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT COUNT(*)     FROM baseball_messages m WHERE m.conversation_id = c.id AND m.read = FALSE AND m.sender_id <> v_uid),
    ARRAY(SELECT cp2.user_id FROM baseball_conversation_participants cp2 WHERE cp2.conversation_id = c.id),
    ARRAY(SELECT COALESCE(u.email, 'Unknown') FROM baseball_conversation_participants cp2 JOIN users u ON u.id = cp2.user_id WHERE cp2.conversation_id = c.id)
  FROM baseball_conversations c
  JOIN baseball_conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = v_uid
  ORDER BY c.updated_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_baseball_conversations_with_details(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_baseball_conversations_with_details(uuid) TO authenticated, service_role;

-- 2. Golf conversation id helper ----------------------------------------------
CREATE OR REPLACE FUNCTION public.user_conversation_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- p_user_id retained for call-site compatibility and deliberately IGNORED;
  -- every RLS policy that calls this already passes (SELECT auth.uid()).
  SELECT conversation_id
  FROM golf_conversation_participants
  WHERE user_id = (SELECT auth.uid());
$function$;

REVOKE EXECUTE ON FUNCTION public.user_conversation_ids(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_conversation_ids(uuid) TO authenticated, service_role;

-- 3. Player stats summary -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_player_stats_summary(p_player_id uuid)
RETURNS TABLE(
  scoring_average numeric, rounds_played integer, best_round integer, worst_round integer,
  last_5_average numeric, last_10_average numeric, improvement_trend numeric,
  trend_direction text, gir_percentage numeric, fairway_percentage numeric,
  putts_per_round numeric, scrambling_percentage numeric,
  is_stale boolean, last_updated timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- The parameter is genuine here (a coach reads a player's summary), so it is
  -- gated rather than ignored. Without this, any authenticated user could read
  -- any player's full performance profile across organizations (#1268).
  IF NOT (
       p_player_id IN (SELECT gp.id FROM golf_players gp WHERE gp.user_id = (SELECT auth.uid()))
    OR public.user_is_coach_of_golf_player(p_player_id)
    OR public.user_is_teammate_of_golf_player(p_player_id)
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    psc.scoring_average,
    psc.rounds_played,
    psc.best_round,
    psc.worst_round,
    psc.last_5_average,
    psc.last_10_average,
    psc.improvement_trend,
    psc.trend_direction,
    psc.gir_percentage,
    psc.driving_accuracy_percentage AS fairway_percentage,
    psc.putts_per_round,
    psc.scrambling_percentage,
    psc.is_stale,
    psc.updated_at AS last_updated
  FROM golf_player_stats_cache psc
  WHERE psc.player_id = p_player_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_player_stats_summary(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_player_stats_summary(uuid) TO authenticated, service_role;
