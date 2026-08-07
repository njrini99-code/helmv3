-- CONFIRMED CROSS-TENANT BREACH FIX — golf_conversation_participants
--
-- golf_participants_insert_v2's first disjunct was a bare (user_id = auth.uid())
-- with NO tenancy condition, so any authenticated user could insert themselves
-- into ANY conversation and then read and post in another program's private
-- messages. Reproduced on production in a rolled-back transaction: a Denison
-- player read 13 private Guilford messages and 14 staff/player identities.
--
-- The obvious fix — ANDing a subquery reading golf_conversations onto that
-- disjunct — REBREAKS DM creation, because that read is subject to
-- golf_conversations' own SELECT policy, which denies a brand-new conversation
-- (see the note in src/app/actions/messages.ts). Hence the SECURITY DEFINER
-- helper: it bypasses that SELECT policy while still evaluating the CALLER's
-- membership, because is_golf_team_player/is_golf_team_coach read auth.uid()
-- internally.
--
-- VERIFIED ON PRODUCTION 2026-08-07, in rolled-back transactions, with a control
-- that PASSES on the pre-fix policy (so it is not vacuous):
--   pre-fix  control (coach creates conv, self+teammate participants, posts) PASS
--   pre-fix  attack  (cross-tenant self-join) .... SUCCEEDED, read 13 messages
--   post-fix control A, coach, all 4 steps ....... PASS
--   post-fix control B, player DM bootstrap ...... PASS
--   post-fix attack .............................. BLOCKED 42501
--
-- Idempotent: CREATE OR REPLACE + DROP POLICY IF EXISTS.

CREATE OR REPLACE FUNCTION public.golf_conversation_on_my_team(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_conversations c
    WHERE c.id = p_conversation_id
      AND c.team_id IS NOT NULL
      AND (public.is_golf_team_player(c.team_id) OR public.is_golf_team_coach(c.team_id))
  );
$fn$;

COMMENT ON FUNCTION public.golf_conversation_on_my_team(uuid) IS
  'Does the CALLER belong to the team that owns this conversation? SECURITY '
  'DEFINER on purpose: it must not be subject to golf_conversations SELECT, or '
  'the DM-creation bootstrap in src/app/actions/messages.ts breaks. Reads '
  'auth.uid() through is_golf_team_player/is_golf_team_coach, so it answers for '
  'the caller, not the owner.';

REVOKE EXECUTE ON FUNCTION public.golf_conversation_on_my_team(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.golf_conversation_on_my_team(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.golf_conversation_on_my_team(uuid) TO authenticated;

DROP POLICY IF EXISTS golf_participants_insert_v2 ON public.golf_conversation_participants;

CREATE POLICY golf_participants_insert_v2 ON public.golf_conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Self-add, but ONLY into a conversation owned by a team you belong to.
    (user_id = (SELECT auth.uid()) AND public.golf_conversation_on_my_team(conversation_id))
    -- The conversation's creator may add anyone. Unchanged.
    OR EXISTS (
      SELECT 1 FROM public.golf_conversations gc
      WHERE gc.id = conversation_id AND gc.created_by = (SELECT auth.uid())
    )
  );
