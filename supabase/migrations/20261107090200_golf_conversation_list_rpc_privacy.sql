-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). PRIORITY: privacy fix, ships ahead of the Messages redesign.
-- Apply: npm run db:apply -- supabase/migrations/20261107090200_golf_conversation_list_rpc_privacy.sql
-- Risk: LOW. CREATE OR REPLACE with the SAME signature and return columns, so the Fairway hook and the Clubhouse build keep
-- working. Body changes: (1) participant_names no longer carries e-mail addresses, (2) unread_count counts from each
-- viewer's own last_read_at instead of the shared golf_messages.read flag, (3) search_path pinned to '' with every
-- name schema-qualified, (4) participant_ids and participant_names come from one ordered list, so index n in one is
-- the person at index n in the other.
-- App change needed: NONE required. src/hooks/golf/use-golf-messages.ts:1787-1793 builds `participant_names: []` and never
-- reads the field (the row is typed at :1418 only). src/hooks/use-messages.ts reads participant_names at :347 but belongs to
-- the Baseball RPC, which this file does not touch. unread_count is read at :2053 and :2087; the G-40 per-viewer recompute
-- (:1812-1900) still runs for groups and now agrees with the RPC. A direct message's count follows last_read_at the
-- way the badge (src/lib/golf/unread-message-count.ts) already does.
--
-- The leak (confirmed on production and staging, 2026-11-07): the old body returned
--   ARRAY(SELECT COALESCE(u.email, 'Unknown') FROM golf_conversation_participants cp2 JOIN users u ...)
-- from a SECURITY DEFINER function, so any member of any conversation (a teammate, a minor) got the e-mail address of every
-- co-participant by calling the RPC, whatever the users-table RLS says.
-- Now: a display name from golf_players (first + last) or golf_coaches (full_name), else 'Unknown'. No e-mail column of any
-- table is read. Names are visible to co-participants anyway (the Messages directory shows them).
--
-- Unread: COUNT(*) of messages in the conversation that are not the viewer's, not deleted and newer than the viewer's own
-- participant last_read_at (never read = everything). One member opening a group no longer clears it for everyone.
--
-- ORDER: any time; independent of M1/M2. Rollback re-opens the e-mail leak.
--
-- VERIFY: select 1 where pg_get_functiondef('public.get_golf_conversations_with_details(uuid)'::regprocedure) not ilike '%email%';
-- VERIFY: select 1 where exists (select 1 from pg_proc p where p.oid = 'public.get_golf_conversations_with_details(uuid)'::regprocedure and p.prosecdef and p.proconfig @> array['search_path=""']);
-- VERIFY: select 1 where has_function_privilege('authenticated', 'public.get_golf_conversations_with_details(uuid)', 'execute') and not has_function_privilege('anon', 'public.get_golf_conversations_with_details(uuid)', 'execute');
--
-- ROLLBACK: supabase/rollbacks/20261107090200_golf_conversation_list_rpc_privacy.rollback.sql (restores the 20261008160000 body)
-- pgTAP: supabase/tests/rls/golf_conversation_list_rpc_privacy.sql

SET lock_timeout = '3s';

DO $$
BEGIN
  IF to_regprocedure('public.get_golf_conversations_with_details(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.get_golf_conversations_with_details(uuid) is missing';
  END IF;
  IF to_regclass('public.golf_players') IS NULL
     OR to_regclass('public.golf_coaches') IS NULL THEN
    RAISE EXCEPTION 'golf_players / golf_coaches are missing';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_golf_conversations_with_details(p_user_id uuid)
RETURNS TABLE(
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
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    c.id,
    c.created_at,
    c.updated_at,
    c.created_by,
    (SELECT m.content FROM public.golf_messages m
      WHERE m.conversation_id = c.id AND m.is_deleted = FALSE
      ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.created_at FROM public.golf_messages m
      WHERE m.conversation_id = c.id AND m.is_deleted = FALSE
      ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.sender_id FROM public.golf_messages m
      WHERE m.conversation_id = c.id AND m.is_deleted = FALSE
      ORDER BY m.created_at DESC LIMIT 1),
    (SELECT COUNT(*) FROM public.golf_messages m
      WHERE m.conversation_id = c.id
        AND m.sender_id <> v_uid
        AND NOT COALESCE(m.is_deleted, FALSE)
        AND m.created_at > COALESCE(cp.last_read_at, '-infinity'::timestamptz)),
    ARRAY(SELECT cp2.user_id
          FROM public.golf_conversation_participants cp2
          WHERE cp2.conversation_id = c.id
          ORDER BY cp2.joined_at, cp2.id),
    ARRAY(SELECT COALESCE(
              (SELECT NULLIF(btrim(concat_ws(' ', gp.first_name, gp.last_name)), '')
                 FROM public.golf_players gp
                WHERE gp.user_id = cp2.user_id
                ORDER BY gp.id LIMIT 1),
              (SELECT NULLIF(btrim(gc.full_name), '')
                 FROM public.golf_coaches gc
                WHERE gc.user_id = cp2.user_id
                ORDER BY gc.id LIMIT 1),
              'Unknown')
          FROM public.golf_conversation_participants cp2
          WHERE cp2.conversation_id = c.id
          ORDER BY cp2.joined_at, cp2.id),
    COALESCE(c.is_team_chat, FALSE),
    c.title,
    (SELECT COUNT(*) FROM public.golf_conversation_participants cp2
      WHERE cp2.conversation_id = c.id),
    COALESCE(c.is_team_channel, FALSE)
  FROM public.golf_conversations c
  JOIN public.golf_conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = v_uid
    AND (
      cp.hidden_at IS NULL
      OR EXISTS (
        SELECT 1 FROM public.golf_messages hm
        WHERE hm.conversation_id = c.id
          AND hm.is_deleted = FALSE
          AND hm.created_at > cp.hidden_at
      )
    )
  ORDER BY c.is_team_channel DESC NULLS LAST, c.updated_at DESC;
END;
$$;

-- CREATE OR REPLACE keeps the existing ACL; state it anyway so a re-run is explicit.
REVOKE ALL ON FUNCTION public.get_golf_conversations_with_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_golf_conversations_with_details(uuid) TO authenticated, service_role;
