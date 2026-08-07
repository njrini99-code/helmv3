-- Baseball messaging has been 100% broken, and repairing it would have opened
-- the same cross-tenant hole golf just had. Both are fixed here, together.
--
-- THE RECURSION. Starting any new baseball conversation failed with
--   42P17 infinite recursion detected in policy for relation
--   "baseball_conversation_participants"
-- at the self-participant insert. The cycle is structural:
--   participants INSERT check -> reads baseball_conversations
--   -> baseball_conversations_select does a RAW EXISTS on participants
--   -> participants_select ...
-- Golf does not have this because golf_conversations_select goes through the
-- SECURITY DEFINER user_conversation_ids() instead of reading the participants
-- table directly. Baseball's equivalent, get_my_baseball_conversation_ids(), is
-- ALREADY security definer and already used by the participants policy — the
-- conversations policy simply never adopted it. It does now, which breaks the
-- cycle at exactly the place golf breaks it.
--
-- THE HOLE THIS WOULD HAVE OPENED. baseball_participants_insert_by_creator's
-- first disjunct was a bare `user_id = auth.uid()` with no tenancy condition —
-- character for character the defect that let a Denison player read a Guilford
-- team's private messages on the golf side. It has been unreachable only because
-- the recursion killed the request first, so fixing the recursion alone would
-- have made it live. It is bound to the caller's team in the same change.
--
-- VERIFIED ON PRODUCTION 2026-08-07 in rolled-back transactions:
--   PRE   control: member creates conversation, adds teammate, posts . FAILS 42P17
--   POST  control: same four steps ................................... PASSES
--   POST  attack:  member of ANOTHER baseball team self-joins ......... BLOCKED 42501
--   POST  regression sweep over ALL 11 existing participants: conversations
--         visible and messages visible are IDENTICAL before and after for every
--         one of them, including the 129-message thread. Nobody loses access.
--   POST  no user can read messages in a conversation they do not participate in
--         (checked exhaustively, every user x every conversation: zero rows).

CREATE OR REPLACE FUNCTION public.baseball_conversation_on_my_team(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.baseball_conversations c
    WHERE c.id = p_conversation_id
      AND c.team_id IS NOT NULL
      AND public.is_baseball_team_member(c.team_id)
  );
$fn$;

COMMENT ON FUNCTION public.baseball_conversation_on_my_team(uuid) IS
  'Does the CALLER belong to the team that owns this baseball conversation? '
  'Runs with definer rights so it is not subject to baseball_conversations SELECT — '
  'that is what keeps the DM-creation bootstrap working. Mirrors '
  'golf_conversation_on_my_team.';

REVOKE EXECUTE ON FUNCTION public.baseball_conversation_on_my_team(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.baseball_conversation_on_my_team(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.baseball_conversation_on_my_team(uuid) TO authenticated;

-- Breaks the cycle: this policy must not read the participants table directly.
DROP POLICY IF EXISTS baseball_conversations_select ON public.baseball_conversations;
CREATE POLICY baseball_conversations_select ON public.baseball_conversations
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT get_my_baseball_conversation_ids())
    OR (is_team_chat = true AND team_id IS NOT NULL AND is_baseball_team_member(team_id))
  );

-- Tenant-binds the self-add. The creator disjunct is unchanged.
DROP POLICY IF EXISTS baseball_participants_insert_by_creator ON public.baseball_conversation_participants;
CREATE POLICY baseball_participants_insert_by_creator ON public.baseball_conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = (SELECT auth.uid()) AND public.baseball_conversation_on_my_team(conversation_id))
    OR EXISTS (
      SELECT 1 FROM public.baseball_conversations c
      WHERE c.id = conversation_id AND c.created_by = (SELECT auth.uid())
    )
  );
