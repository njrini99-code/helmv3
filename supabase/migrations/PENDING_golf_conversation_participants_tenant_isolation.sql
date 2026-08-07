-- ⚠️ NOT APPLIED. DO NOT APPLY WITHOUT READING THE BLOCKER AT THE BOTTOM. ⚠️
--
-- Filename deliberately starts with PENDING_ rather than a timestamp so the
-- migration runner will not pick it up. Rename to a real timestamp only once
-- the control described at the bottom actually passes.
--
-- ============================================================================
-- CONFIRMED CROSS-TENANT DATA BREACH — golf_conversation_participants
-- ============================================================================
--
-- Any authenticated user can add themselves to ANY golf conversation and then
-- read and post in another program's private messages.
--
-- The live policy is:
--
--   golf_participants_insert_v2  INSERT  WITH CHECK (
--     (user_id = (SELECT auth.uid()))
--     OR EXISTS (SELECT 1 FROM golf_conversations gc
--                 WHERE gc.id = conversation_id AND gc.created_by = (SELECT auth.uid())))
--
-- The FIRST disjunct has no tenancy condition at all. `user_id = auth.uid()`
-- is satisfied by anyone POSTing their own id, for any conversation_id.
--
-- REPRODUCED ON PRODUCTION 2026-08-07, in a rolled-back transaction:
--   attacker : e78c5692-65e5-46a7-bb8c-1aa78b58c5d2  (a Denison University player)
--   target   : ab10422a-dc65-4abc-944c-ec4fbdf3a7bb  (Guilford College team chat,
--                                                     13 messages, paying customer)
--   BEFORE   : guilford_msgs_readable = 0, conv_readable = 0
--   ACTION   : INSERT INTO golf_conversation_participants (conversation_id, user_id)
--              VALUES (target, attacker);   -- accepted, no error
--   AFTER    : guilford_msgs_readable = 13, conv_readable = 1,
--              participants_readable = 14 (names of Guilford staff + players)
--   Sample content read: "Group Chat for 26-27", "I have received"
--   Transaction rolled back; 0 leftover rows verified.
--
-- Once the row exists, golf_conversations_select_v2, golf_messages_select_v2 and
-- golf_messages_insert_v2 all key off user_conversation_ids(auth.uid()), so the
-- intruder can also POST as themselves. Coach<->player 1:1 DMs (recruiting,
-- discipline, injury) live in the same table.
--
-- CIRCUMSTANTIAL SUPPORT that this may already have happened, or that something
-- else writes cross-team participant rows: 3 of 51 participant rows are for a
-- user who is neither the conversation creator nor a member of the
-- conversation's team —
--   aperry3@guilford.edu  x2  (Guilford conversations, no active Guilford membership)
--   pvm05@su.edu          x1  (in "Shenandoah University Golf", member of
--                              "Shenandoah University Women's Golf")
-- Not proof of exploitation. Worth explaining before closing this out.
--
-- ============================================================================
-- WHY THE OBVIOUS FIX IS WRONG
-- ============================================================================
--
-- The instinct is to AND a subquery onto the first disjunct:
--
--   user_id = auth.uid()
--   AND EXISTS (SELECT 1 FROM golf_conversations c WHERE c.id = conversation_id AND ...)
--
-- That REBREAKS DIRECT MESSAGES, and src/app/actions/messages.ts:355-373
-- documents exactly why in its own source. Creating a DM depends on the first
-- disjunct having NO subquery:
--
--   1. insert SELF via disjunct (a) — no subquery, so nothing to be denied
--   2. that row puts the conversation into user_conversation_ids(auth.uid())
--   3. golf_conversations' SELECT policy now passes, so the EXISTS in disjunct
--      (b) can finally see the row, and everyone else inserts normally
--
-- A subquery in (a) reads golf_conversations, which is subject to that table's
-- SELECT policy, which denies a brand-new conversation — so step 1 fails and
-- the whole DM creation fails. That is the bug that killed golf messaging
-- earlier this week. Do not reintroduce it.
--
-- Hence the SECURITY DEFINER helper below: it bypasses the SELECT policy on
-- golf_conversations while still evaluating the CALLER's team membership
-- (is_golf_team_player / is_golf_team_coach both read auth.uid() internally),
-- so the bootstrap survives and tenancy is enforced.

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

REVOKE EXECUTE ON FUNCTION public.golf_conversation_on_my_team(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.golf_conversation_on_my_team(uuid) TO authenticated;

DROP POLICY IF EXISTS golf_participants_insert_v2 ON public.golf_conversation_participants;

CREATE POLICY golf_participants_insert_v2 ON public.golf_conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Self-add, but ONLY into a conversation owned by a team you belong to.
    -- The added conjunct is the entire fix.
    (user_id = (SELECT auth.uid()) AND public.golf_conversation_on_my_team(conversation_id))
    -- The conversation's creator may add anyone. Unchanged.
    OR EXISTS (
      SELECT 1 FROM public.golf_conversations gc
      WHERE gc.id = conversation_id AND gc.created_by = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- BLOCKER — WHY THIS IS NOT APPLIED
-- ============================================================================
--
-- VERIFIED: the attack is blocked. Under impersonation as the Denison player,
-- golf_conversation_on_my_team(<Guilford conv>) returns false, and the INSERT
-- raises. Confirmed twice, in rolled-back transactions.
--
-- NOT VERIFIED: that legitimate messaging still works. Every control I built
-- failed for reasons unrelated to this policy, so I could not prove the
-- non-breaking half — and a probe whose control does not pass proves nothing:
--
--   * control #1 — add an existing Guilford member: VACUOUS. All Guilford
--     members are already participants, so the query selected nobody.
--   * control #2 — a PLAYER creates a new conversation then self-inserts:
--     failed at "new row violates row-level security policy for table
--     golf_conversations", before reaching this policy at all.
--   * control #3 — a COACH does the same, on a team confirmed to have both
--     coach staff and active players (team 343731cb-5109-4970-89e4-2e4bd49df8cb):
--     SAME failure. golf_conversations_insert_v2 is
--     `(team_id IS NULL) OR is_golf_team_coach(team_id) OR is_golf_team_player(team_id)`,
--     which should have passed for that coach and did not.
--
-- So one of these is true, and WHICH ONE MUST BE ESTABLISHED BEFORE APPLYING:
--   (a) is_golf_team_coach / is_golf_team_player return false under JWT
--       impersonation for a reason specific to my test harness — in which case
--       the control needs fixing, not the code; or
--   (b) conversation creation does NOT go through the caller's RLS client at
--       all (an admin client or an RPC), in which case this policy cannot break
--       creation and is safe to apply; or
--   (c) coaches genuinely cannot create conversations under RLS today, which is
--       its own separate live bug.
--
-- TO FINISH THIS:
--   1. Determine which of (a)/(b)/(c) holds. Read the conversation-creation
--      path in src/app/actions/messages.ts and check which client it uses.
--   2. Build a control that PASSES on the current policy, then re-run it with
--      this policy applied. Both must pass. Attack must fail in both.
--   3. Exercise real DM creation and team-chat posting in the running app —
--      not just SQL. Golf messaging has broken twice from changes that looked
--      correct in isolation.
--   4. Then rename this file to a real timestamp and apply.
--
-- Do not apply on the strength of the attack being blocked alone. Blocking the
-- attack was never the hard part.
