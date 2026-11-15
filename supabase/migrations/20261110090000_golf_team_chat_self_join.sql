-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md). PRIORITY: security fix,
-- ships ahead of the Messages redesign.
-- Apply: npm run db:apply -- \
--   supabase/migrations/20261110090000_golf_team_chat_self_join.sql
-- Risk: LOW-MEDIUM. No data changes. It narrows who may INSERT their own
-- participant row. (Who may create a conversation flagged is_team_channel was
-- this file's second half until the migration review of 2026-11-10; it is now
-- 20261110090050, so that each file locks one table. See LOCKS.)
-- Every participant insert the app makes is made by the conversation's creator
-- (sweep below), so no app flow loses a write; a caller outside the app that
-- joined a team chat by itself would now get 42501.
-- App change needed: NONE.
--
-- The hole (security review 2026-11-10, item A2; confirmed on production from
-- pg_policies the same day, reproduced on the local stack in a rolled-back
-- transaction and in the pgTAP file below):
--   Branch 1 of golf_participants_insert_v2 is
--     user_id = auth.uid()
--     AND (golf_conversation_created_by_me(conversation_id)
--          OR EXISTS (a golf_conversations row with is_team_chat = true,
--                     team_id set, and
--                     golf_conversation_on_my_team(conversation_id)))
--   The second half admits ANY active player or coach of a team into ANY team
--   chat of that team. A coach's group for a subset of players ("P2 only", a
--   travel squad, a conversation about one player) is a team chat, and
--   golf_conversations_select_v2 shows every team-chat row to the whole team,
--   so the ids are readable. A player inserts their own participant row, then
--   reads the group's whole history and its golf-attachments objects, and can
--   do it again after the coach removes them. Many members are minors.
--   Production holds 10 is_team_chat conversations, 8 of them with a team (the
--   ones this reaches), one of which is a team channel.
--
-- Who uses the self-join half today: nobody. 20260807080000 kept it "for the
-- TEAM CHAT bootstrap, letting a team member join their squad's group chat",
-- but no flow was built on it. Swept 2026-11-10 at main (743cb23a1) and at the
-- build production serves (d0f467a73), over src/**, scripts/**,
-- supabase/functions/** and every function and trigger in production's catalog:
-- golf_conversation_participants has exactly five client INSERT sites, the same
-- five at both versions, and in each the caller is the conversation's creator:
--   createConversation       self, then the others
--                            messages.ts:524 + :527 (d0f467a73: :486 + :489)
--   createGolfTeamBroadcast  reuse: the missing ids
--                            messages.ts:1029 (d0f467a73: :908; own chats only)
--   createGolfTeamBroadcast  new: everyone, one statement
--                            messages.ts:1081 (d0f467a73: :960)
--   addGolfGroupMember       one teammate
--                            messages.ts:2040 (d0f467a73: :1852, after
--                            loadGolfGroupIOwn)
--   Nothing puts a player in a team channel when they join a team either (join
--   by code teams.ts:430 / :433, coach approval teams.ts:1356, set active again
--   team-management.ts:336; no trigger on golf_team_members), and the Messages
--   screens never insert the viewer. A channel is created and filled once by
--   scripts/seed-demo-team-ops.ts:641 / :657 with the service role. Production,
--   2026-11-10: 12 teams, 1 has a channel; its 8 members all joined in the
--   minute it was created. Across all team chats one row joined later: a coach,
--   on 2026-09-08, with a database-default joined_at, which is what
--   addGolfGroupMember writes.
--
-- The fix:
--   1. golf_participants_insert_v2 is recreated from production's text of
--      2026-11-10 (what 20261017003000 created) with the self-join half
--      removed. Branch 1 becomes: your own row, in a conversation you created.
--      Branch 2 (the creator adds the team's people while the conversation is
--      formed) and branch 3 (the creator adds a teammate to a settled team
--      chat) are unchanged, as are the policy's roles. After this, who is in a
--      conversation is decided by its creator, by each member leaving, and by
--      the server; nobody adds themself to a conversation someone else created.
--      The team channel is not an exception: the owner's rule (2026-11-10) that
--      a player who joins a team is in its channel is met by 20261110090200, a
--      trigger on the roster that runs with definer rights and needs no policy
--      branch.
--   golf_conversation_on_my_team() is left in place (the rollback needs it).
--
-- Not changed: golf_conversations_select_v2 still shows team-chat rows (id,
-- title) to the whole team; with the insert closed that reveals a group's
-- existence and title, not its contents. Narrowing it is a product decision
-- (report). Creating a row flagged is_team_channel is closed by 20261110090050,
-- and changing the flag on an existing row by 20261107090100.
--
-- LOCKS (pg_locks before commit, local stack 2026-11-10): ACCESS EXCLUSIVE on
-- golf_conversation_participants, once (DROP / CREATE POLICY needs it), and
-- nothing stronger than ACCESS SHARE anywhere else (golf_conversations, taken
-- when the new policy's EXISTS subqueries are parsed; it conflicts with no
-- reader or writer). Reads and writes of the participants table wait from the
-- lock to the commit, a few milliseconds; lock_timeout gives up after 3s with
-- nothing changed. Apply off-peak and run it again if it times out.
-- Until the migration review of 2026-11-10 this file went on to take ACCESS
-- EXCLUSIVE on golf_conversations as well. Every inbox read locks
-- conversations first and participants second, the opposite order, so the two
-- could deadlock. That statement is now its own file, 20261110090050.
--
-- ORDER: independent of the four 202611070900xx files, of 20261110090050 and
-- of any app deploy; can be applied first. Needs 20261017003000 (applied to
-- production 2026-10-21), which the precondition below checks.
--
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_conversation_participants' and policyname = 'golf_participants_insert_v2' and cmd = 'INSERT' and position('golf_conversation_on_my_team' in with_check) = 0 and position('golf_conversation_created_by_me' in with_check) > 0; -- noqa: LT05
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_conversation_participants' and policyname = 'golf_participants_insert_v2' and position('golf_conversation_has_other_participant' in with_check) > 0 and position('golf_user_in_conversation_team_audience' in with_check) > 0 and position('golf_user_on_conversation_team' in with_check) > 0; -- noqa: LT05
--
-- ROLLBACK: (one transaction; re-opens the hole, use only to restore a broken
-- writer while a fix is prepared). ORDER: nothing has to be rolled back first;
-- no other file depends on this policy's text:
--   drop policy if exists golf_participants_insert_v2
--     on public.golf_conversation_participants;
--   create policy golf_participants_insert_v2
--     on public.golf_conversation_participants for insert with check (
--     (user_id = (select auth.uid())
--       and (public.golf_conversation_created_by_me(conversation_id)
--         or exists (
--           select 1 from public.golf_conversations c
--           where c.id = golf_conversation_participants.conversation_id
--             and c.is_team_chat = true
--             and c.team_id is not null
--             and public.golf_conversation_on_my_team(
--                   golf_conversation_participants.conversation_id))))
--     or (exists (
--           select 1 from public.golf_conversations gc
--           where gc.id = golf_conversation_participants.conversation_id
--             and gc.created_by = (select auth.uid()))
--       and not public.golf_conversation_has_other_participant(conversation_id)
--       and public.golf_user_in_conversation_team_audience(
--             golf_conversation_participants.conversation_id,
--             golf_conversation_participants.user_id))
--     or (public.golf_conversation_created_by_me(
--             golf_conversation_participants.conversation_id)
--       and exists (
--           select 1 from public.golf_conversations c
--           where c.id = golf_conversation_participants.conversation_id
--             and c.is_team_chat = true
--             and c.team_id is not null)
--       and public.golf_user_on_conversation_team(
--             golf_conversation_participants.conversation_id,
--             golf_conversation_participants.user_id)));
--   -- That is 20261017003000's policy (md5 of its deparsed text equals
--   -- production's, checked 2026-11-10; rewrapped 2026-11-10, deparsed text
--   -- unchanged). Rows inserted while this file was live stay; nothing depends
--   -- on how a member got in.
-- pgTAP: supabase/tests/rls/golf_team_chat_self_join.sql

-- SET LOCAL: the timeout ends with this file's transaction, so it cannot
-- follow a reused connection. db:apply, supabase db reset and psql -1 each
-- run the file as one transaction; under a plain `psql -f` this line only
-- warns and no timeout is set, so never apply it that way.
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  v_fn text;
  v_check text;
BEGIN
  IF to_regclass('public.golf_conversations') IS NULL
     OR to_regclass('public.golf_conversation_participants') IS NULL THEN
    RAISE EXCEPTION
      'golf_conversations / golf_conversation_participants are missing';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[
      'public.golf_conversation_created_by_me(uuid)',
      'public.golf_conversation_has_other_participant(uuid)',
      'public.golf_user_in_conversation_team_audience(uuid, uuid)',
      'public.golf_user_on_conversation_team(uuid, uuid)'] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION '% is missing', v_fn;
    END IF;
  END LOOP;
  -- This file rewrites the policy from its 20261017003000 shape. Anything else means the
  -- starting state is not the one this was written against: stop and read it first.
  SELECT with_check INTO v_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'golf_conversation_participants'
    AND policyname = 'golf_participants_insert_v2';
  IF v_check IS NULL
     OR position('golf_user_in_conversation_team_audience' IN v_check) = 0
     OR position('golf_user_on_conversation_team' IN v_check) = 0
     OR position('golf_conversation_has_other_participant' IN v_check) = 0 THEN
    RAISE EXCEPTION
      'golf_participants_insert_v2 is not in its 20261017003000 shape';
  END IF;
END $$;

-- Nobody adds themself to a conversation someone else created -----------------

DROP POLICY IF EXISTS golf_participants_insert_v2
ON public.golf_conversation_participants;
CREATE POLICY golf_participants_insert_v2
ON public.golf_conversation_participants
FOR INSERT
WITH CHECK (
    -- Branch 1 -- adding YOURSELF, to a conversation you created. The second
    -- half (any member of the team, into any team chat of that team) is what
    -- this file removes.
    (
        user_id = (SELECT auth.uid())
        AND public.golf_conversation_created_by_me(conversation_id)
    )
    -- Branch 2 -- the creator adding OTHERS at creation time, only people on
    -- the conversation's team. Unchanged from 20261017003000.
    OR (
        EXISTS (
            SELECT 1
            FROM public.golf_conversations AS gc
            WHERE
                gc.id = golf_conversation_participants.conversation_id
                AND gc.created_by = (SELECT auth.uid())
        )
        AND NOT public.golf_conversation_has_other_participant(conversation_id)
        AND public.golf_user_in_conversation_team_audience(
            golf_conversation_participants.conversation_id,
            golf_conversation_participants.user_id
        )
    )
    -- Branch 3 -- the creator adding an existing TEAMMATE to a settled TEAM
    -- CHAT. Unchanged from 20260907160000.
    OR (
        public.golf_conversation_created_by_me(
            golf_conversation_participants.conversation_id
        )
        AND EXISTS (
            SELECT 1
            FROM public.golf_conversations AS c
            WHERE
                c.id = golf_conversation_participants.conversation_id
                AND c.is_team_chat = TRUE
                AND c.team_id IS NOT NULL
        )
        AND public.golf_user_on_conversation_team(
            golf_conversation_participants.conversation_id,
            golf_conversation_participants.user_id
        )
    )
);
