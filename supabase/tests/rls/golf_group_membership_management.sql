-- pgTAP contracts for golf team-chat membership management
-- (20260907160000_golf_team_chat_membership_management.sql).
--
-- WHAT THIS MIGRATION DOES, AND WHY IT NEEDS A BEHAVIOURAL SUITE MORE THAN
-- MOST. It re-opens a write path that was CLOSED on 2026-08-19 after a
-- verified production attack (`20260819070000_conversation_creator_cannot_-
-- inject_third_party.sql`). The claim it makes is not "this is safe" but "this
-- is safe BECAUSE it is bounded on three axes at once": the conversation must
-- be a team chat, the actor must be its creator, and — for INSERT — the person
-- being added must already be on the owning team.
--
-- A structural suite cannot check that. `pg_policies` will happily show a
-- policy whose three bounds are individually present and jointly wrong, and
-- the 2026-08-19 header records that this exact table has already shipped a
-- predicate that read correctly and evaluated to `p.x = p.x`. So the load-
-- bearing half here is GROUP 2 and GROUP 3, which act as real users through
-- `request.jwt.claims` and assert what the database actually permits.
--
-- THE REFUSALS ARE NOT SUFFICIENT ON THEIR OWN, and that is the trap the
-- 2026-08-19 migration's own verification block calls out: a predicate that
-- blocks everything passes every refusal check. Each refusal here is paired
-- with the permission it must not have taken away — most importantly the
-- two-statement creation order the application actually uses
-- (`createConversation`, src/app/actions/messages.ts), which is what a naive
-- "zero existing participants" predicate breaks.
--
-- WHAT MUST STILL BE REFUSED AFTER THE WIDENING. Tests 6 and 7 are
-- 20260819070000's own refusal checks, kept verbatim in spirit: a DM's
-- membership is still fixed at creation, and a non-creator still cannot add
-- anyone. If a later change to this policy makes either pass, the 2026-08-19
-- defect is back.
--
-- Verified against a local Docker stack before commit, both directions. With
-- the migration applied all fourteen pass. With the two policies rolled back
-- to their pre-migration shape inside the same transaction, exactly three fail
-- -- 4 (the delete policy has no creator branch), 5 (add is refused 42501) and
-- 8 (remove deletes nothing) -- while the rest still pass. That second run is
-- what makes these evidence rather than decoration: it shows the suite
-- discriminates, and it shows the widening did not disturb the refusals
-- 20260819070000 put in place.
--
-- ONE HONEST LIMIT, recorded because a reader would otherwise assume
-- otherwise. Tests 13 and 14 (GROUP 4) do NOT discriminate on the DELETE
-- branch's participation clause: a third control run, with that clause alone
-- removed, still passes all fourteen. The reason is measured, not guessed --
-- as a creator who is not a participant, `golf_participants_select_v2` makes
-- the target rows invisible, and a DELETE over invisible rows removes nothing.
-- GROUP 4 asserts the BEHAVIOUR (a departed creator cannot remove anyone),
-- which currently holds through two independent mechanisms. It is a contract
-- on the outcome, and it would catch the loss of either one, but only after
-- both were gone. Calling it a test of the new clause would be false.
--
-- Plan arithmetic: 4 structural + 5 creator behaviour + 3 non-creator
-- behaviour + 2 departed-creator behaviour = 14. Counted, not eyeballed -- a
-- miscounted plan aborts the runner's `set -euo pipefail` loop and silently
-- skips every alphabetically later suite.

BEGIN;
\ir _helpers.sql

SELECT plan(14);

-- ============================================================================
-- GROUP 1 — the helper exists, and it is not reachable by anon.
-- ============================================================================
--
-- `golf_user_on_conversation_team` must be SECURITY DEFINER: it is called from
-- a policy ON golf_conversation_participants and reads roster tables the
-- caller may not be able to see. The recursion trap the 2026-08-19 migration
-- documents is the reason the helper exists at all rather than an inline
-- subquery.

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'golf_user_on_conversation_team'
      AND p.prosecdef
  ),
  'golf_user_on_conversation_team exists and is SECURITY DEFINER'
);

-- A SECURITY DEFINER function is granted EXECUTE to PUBLIC by default, and
-- anyone holding the publishable key is `anon`. This is the revoke that keeps
-- a definer helper from becoming an unauthenticated read oracle.
SELECT ok(
  NOT has_function_privilege('anon', 'public.golf_user_on_conversation_team(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public.golf_user_on_conversation_team(uuid, uuid)', 'EXECUTE'),
  'golf_user_on_conversation_team is NOT executable by anon or PUBLIC'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.golf_user_on_conversation_team(uuid, uuid)', 'EXECUTE'),
  'golf_user_on_conversation_team IS executable by authenticated'
);

-- The DELETE policy gained a creator branch. Before this migration it was the
-- baseline's `USING (user_id = auth.uid())` and nothing else.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'golf_conversation_participants'
      AND p.polname = 'golf_participants_delete'
      AND position('golf_conversation_created_by_me' IN pg_get_expr(p.polqual, p.polrelid)) > 0
  ),
  'golf_participants_delete carries a creator branch, not only self-delete'
);

-- ============================================================================
-- FIXTURE
-- ============================================================================
--
-- One team, one team chat and one DM, both created by the coach. The team chat
-- is SETTLED — creator plus one other participant — because that is precisely
-- the state 20260819070000 refuses further inserts into. `u_outsider` is a
-- real player in the same organization who is deliberately NOT on the team's
-- roster, which is the only thing separating tests 5 and 6.

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000907101', 'creator@golfmembership.test',  'authenticated'),
    ('00000000-0000-0000-0000-000000907102', 'member@golfmembership.test',   'authenticated'),
    ('00000000-0000-0000-0000-000000907103', 'teammate@golfmembership.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000907104', 'outsider@golfmembership.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-000000907201', 'Membership Verify Org', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_teams (id, name, join_code, organization_id)
    VALUES ('00000000-0000-0000-0000-000000907301', 'Membership Verify Team', 'GMEMB001',
            '00000000-0000-0000-0000-000000907201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_coaches (id, user_id, organization_id)
    VALUES ('00000000-0000-0000-0000-000000907401', '00000000-0000-0000-0000-000000907101',
            '00000000-0000-0000-0000-000000907201')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_team_coach_staff (team_id, coach_id)
    VALUES ('00000000-0000-0000-0000-000000907301', '00000000-0000-0000-0000-000000907401')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000000907501', '00000000-0000-0000-0000-000000907102', 'Mem',  'Ber'),
    ('00000000-0000-0000-0000-000000907502', '00000000-0000-0000-0000-000000907103', 'Team', 'Mate'),
    ('00000000-0000-0000-0000-000000907503', '00000000-0000-0000-0000-000000907104', 'Out',  'Sider')
  ON CONFLICT DO NOTHING;

  -- The outsider is absent from this on purpose.
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    ('00000000-0000-0000-0000-000000907301', '00000000-0000-0000-0000-000000907501', 'active'),
    ('00000000-0000-0000-0000-000000907301', '00000000-0000-0000-0000-000000907502', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, title)
    VALUES ('00000000-0000-0000-0000-000000907601', '00000000-0000-0000-0000-000000907101',
            '00000000-0000-0000-0000-000000907301', true, 'Membership Verify Group')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat)
    VALUES ('00000000-0000-0000-0000-000000907602', '00000000-0000-0000-0000-000000907101',
            '00000000-0000-0000-0000-000000907301', false)
  ON CONFLICT DO NOTHING;

  -- A brand-new conversation with NO participants yet, for the creation-order
  -- check. It must stay empty until test 9 runs.
  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat)
    VALUES ('00000000-0000-0000-0000-000000907603', '00000000-0000-0000-0000-000000907101',
            '00000000-0000-0000-0000-000000907301', false)
  ON CONFLICT DO NOTHING;

  -- A second team chat, used only by GROUP 4. It is kept separate from 907601
  -- so the departed-creator checks cannot be perturbed by, or perturb, the
  -- add/remove sequence above.
  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, title)
    VALUES ('00000000-0000-0000-0000-000000907604', '00000000-0000-0000-0000-000000907101',
            '00000000-0000-0000-0000-000000907301', true, 'Departed Creator Group')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-000000907601', '00000000-0000-0000-0000-000000907101'),
    ('00000000-0000-0000-0000-000000907601', '00000000-0000-0000-0000-000000907102'),
    ('00000000-0000-0000-0000-000000907602', '00000000-0000-0000-0000-000000907101'),
    ('00000000-0000-0000-0000-000000907602', '00000000-0000-0000-0000-000000907102'),
    ('00000000-0000-0000-0000-000000907604', '00000000-0000-0000-0000-000000907101'),
    ('00000000-0000-0000-0000-000000907604', '00000000-0000-0000-0000-000000907102'),
    ('00000000-0000-0000-0000-000000907604', '00000000-0000-0000-0000-000000907103')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- GROUP 2 — behavioural, as the group's CREATOR.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000907101", "role": "authenticated"}';

-- THE NEW CAPABILITY. Fails 42501 without this migration.
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-000000907601',
            '00000000-0000-0000-0000-000000907103')$$,
  'the creator CAN add a teammate to a settled TEAM CHAT'
);

-- The bound that makes the widening defensible: this grants no ability to
-- introduce an outsider to anything, only to include someone the team already
-- has.
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-000000907601',
            '00000000-0000-0000-0000-000000907104')$$,
  '42501',
  NULL,
  'the creator CANNOT add someone who is not on the conversation''s team'
);

-- 20260819070000's own refusal check. A DM's membership is still fixed at
-- creation; if this ever passes, that defect is back.
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-000000907602',
            '00000000-0000-0000-0000-000000907103')$$,
  '42501',
  NULL,
  'the creator CANNOT inject a third party into an existing DM (2026-08-19 stays closed)'
);

-- REMOVE. A DELETE denied by RLS removes zero rows rather than raising, so the
-- assertion is on the row count, not on an exception — a throws_ok here would
-- pass against a policy that silently does nothing.
--
-- THE COUNT IS TAKEN WITH RLS OFF, and that is not a convenience. Counting as
-- the acting user cannot distinguish "the row is gone" from "the row is
-- invisible to me", because the same SELECT policy filters both. This suite's
-- first draft asserted under the caller's own RLS and reported a pass for the
-- wrong reason on exactly this shape.
DELETE FROM public.golf_conversation_participants
 WHERE conversation_id = '00000000-0000-0000-0000-000000907601'
   AND user_id = '00000000-0000-0000-0000-000000907102';

RESET role;
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-000000907601'
      AND user_id = '00000000-0000-0000-0000-000000907102'),
  0,
  'the creator CAN remove another member from a team chat'
);
SET LOCAL role TO authenticated;

-- THE CHECK THE REFUSALS CANNOT REPLACE. This is the exact two-statement order
-- `createConversation` uses: self first, others in a SECOND statement. It is
-- what a "zero existing participants" predicate breaks, and it must keep
-- working across this widening untouched.
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-000000907603',
              '00000000-0000-0000-0000-000000907101');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-000000907603',
              '00000000-0000-0000-0000-000000907102')$$,
  'conversation creation still works — self, then the others batch as a second statement'
);

-- ============================================================================
-- GROUP 3 — behavioural, as a NON-creator participant.
-- ============================================================================

SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000907102", "role": "authenticated"}';

-- Membership management is creator-only. A member of the group is not an
-- admin of it — there is no role column on this table for them to be one.
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-000000907601',
            '00000000-0000-0000-0000-000000907104')$$,
  '42501',
  NULL,
  'a non-creator participant CANNOT add anyone'
);

-- The orphan guard, from the other side: nobody but the creator can delete the
-- creator's row, so a group always retains the member its Admin pill names.
DELETE FROM public.golf_conversation_participants
 WHERE conversation_id = '00000000-0000-0000-0000-000000907601'
   AND user_id = '00000000-0000-0000-0000-000000907101';

-- RLS off for the same reason as test 8: as this user the creator's row is not
-- selectable either way, so a count taken here would read 0 whether the delete
-- was refused or succeeded — it would pass against the very defect it exists
-- to catch.
RESET role;
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-000000907601'
      AND user_id = '00000000-0000-0000-0000-000000907101'),
  1,
  'a non-creator CANNOT delete the creator''s participant row'
);
SET LOCAL role TO authenticated;

-- LEAVE GROUP — the baseline self-delete branch, which is the one membership
-- mutation that worked before this migration and must be untouched by it.
DELETE FROM public.golf_conversation_participants
 WHERE conversation_id = '00000000-0000-0000-0000-000000907602'
   AND user_id = '00000000-0000-0000-0000-000000907102';

RESET role;
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-000000907602'
      AND user_id = '00000000-0000-0000-0000-000000907102'),
  0,
  'any participant CAN still delete their own row — "Leave group" is unchanged'
);


-- ============================================================================
-- GROUP 4 — behavioural, as a creator who has LEFT the group.
-- ============================================================================
--
-- This group exists because this migration invalidated its own evidence. The
-- header of 20260819070000 established that no golf conversation had a creator
-- who was not a participant (11 of 11), and the creator DELETE branch would
-- have been free to lean on that. The same change that adds the branch also
-- ships "Leave group", so that observation no longer bounds anything.
--
-- See the ONE HONEST LIMIT note at the top: these two assert the outcome, not
-- the DELETE policy's participation clause, which they cannot isolate.
--
-- Test 13 is not decoration: without it, test 14 could pass because the leave
-- silently did nothing rather than because the removal was refused.

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000907101","role":"authenticated"}';
SET LOCAL role TO authenticated;

DELETE FROM public.golf_conversation_participants
 WHERE conversation_id = '00000000-0000-0000-0000-000000907604'
   AND user_id = '00000000-0000-0000-0000-000000907101';

RESET role;
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-000000907604'
      AND user_id = '00000000-0000-0000-0000-000000907101'),
  0,
  'a creator CAN leave their own group — the precondition for test 14'
);
SET LOCAL role TO authenticated;

-- THE ONE THIS GROUP IS FOR. Counted with RLS off for the same reason as tests
-- 8 and 11: as a non-participant this row is not selectable either way, so a
-- count taken as the caller would read 0 whether the delete was refused or
-- succeeded.
DELETE FROM public.golf_conversation_participants
 WHERE conversation_id = '00000000-0000-0000-0000-000000907604'
   AND user_id = '00000000-0000-0000-0000-000000907103';

RESET role;
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-000000907604'
      AND user_id = '00000000-0000-0000-0000-000000907103'),
  1,
  'a creator who has LEFT can no longer remove the members who stayed'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
