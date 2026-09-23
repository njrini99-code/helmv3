-- A team chat's creator may add and remove members after the thread exists.
--
-- --- WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT -------------------
--
-- Today `golf_conversation_participants` permits exactly two membership
-- mutations: you may add yourself under the bounds set on 2026-08-07, and you
-- may delete your own row (`golf_participants_delete`, still the baseline's
-- `USING (user_id = auth.uid())`). There is no way for anyone to add a second
-- person to a settled thread, and no way for anyone to remove a person other
-- than themselves. This migration adds one narrowly-bounded branch to each.
--
-- THIS IS NOT A REVERSAL OF `20260819070000_conversation_creator_cannot_-
-- inject_third_party.sql`. That migration removed a branch that authorized an
-- insert on the sole basis that the acting user created the conversation --
-- no bound on WHICH conversation, no bound on WHO was being added, and
-- therefore reachable against a private DM. Its own header states the shape of
-- the argument: "That bounds who is likely to have exercised it. It does not
-- bound the policy, which is the only control." The same standard applies
-- here, so what is added back is bounded on all three axes:
--
--   * the conversation must be a genuine team chat
--     (`is_team_chat = true AND team_id IS NOT NULL`) -- a DM can never be
--     reached by either new branch, which is the case 20260819070000 was
--     written about;
--   * the actor must be the conversation's creator;
--   * for INSERT, the person being added must ALREADY be on the team that
--     owns the conversation -- so this grants no ability to introduce an
--     outsider to anything, only to include a teammate in a channel their
--     team already owns.
--
-- Baseball is untouched. Its policies carry the identical creator branch and
-- the same argument would hold, but baseball has no group-details surface to
-- drive it and is seed data nobody uses (owner, 2026-08-19); adding an unused
-- write path is not a safety improvement.
--
-- --- THE HISTORY EXPOSURE, WHICH IS THE OWNER'S CALL -------------------------
--
-- `golf_participants_select_v2` grants a participant the conversation's FULL
-- PRIOR HISTORY. That is the mechanism the 2026-08-19 defect exploited, and it
-- is unchanged here: adding a member to a team chat hands them everything said
-- in it before they arrived. In a team channel that is very likely the
-- intended behaviour -- it is how the 13-participant channel already works for
-- everyone in it -- but it is a consequence to accept knowingly rather than a
-- detail of the implementation. There is no per-message watermark in the
-- schema, so scoping visibility to "messages after you joined" is not a
-- variant of this migration; it would be a different feature.
--
-- --- CREATOR-ONLY, NOT ANY COACH --------------------------------------------
--
-- The actor bound is `created_by`, matching the Admin pill the group-details
-- sheet already renders (there is no role column on
-- `golf_conversation_participants` of any kind, so `created_by` is the only
-- thing "admin" can mean here). A coach who did not create a channel cannot
-- change its membership. That is the conservative reading; widening it to any
-- coach on the owning team is a deliberate later decision, not an oversight.
--
-- --- THE PREDICATE THE DELETE BRANCH RESTS ON -------------------------------
--
-- The creator's DELETE branch grants rights to a user identified as the
-- conversation's creator, and it excludes the creator's own row so that
-- "remove member" can never orphan a group by deleting its only Admin.
-- (The exclusion is `user_id <> auth.uid()`; since the branch already requires
-- the actor to BE the creator, that is exactly "not the creator's row".)
--
-- It depends on the creator being among the participants -- otherwise the
-- branch would give delete rights to someone not in the conversation.
-- 20260819070000's header records this checked against every golf
-- conversation that exists: in 11 of 11, `creator NOT a participant` = 0.
--
-- That evidence is now STALE, and this migration is what staled it: the same
-- change ships "Leave group", and the creator can use it. Data gathered before
-- a capability existed cannot bound a capability that capability introduces.
-- So the question was re-asked directly, against a real Postgres, rather than
-- re-cited.
--
-- MEASURED, not assumed. Acting as a creator who is NOT a participant: the
-- conversation IS visible (`golf_conversations_select_v2` has a branch for any
-- coach on the owning team) but ZERO participant rows are --
-- `golf_participants_select_v2` is `user_id = auth.uid() OR conversation_id IN
-- user_conversation_ids(...)` and has no coach branch. A DELETE whose target
-- rows are invisible removes nothing. The departed creator was therefore
-- already powerless, by way of the SELECT policy.
--
-- The branch nonetheless states the bound itself, via `user_conversation_ids`
-- -- the SECURITY DEFINER helper `golf_participants_select_v2` already uses,
-- already granted to `authenticated` and revoked from PUBLIC. It is
-- deliberately redundant today. This table has already shipped one predicate
-- that read correctly and evaluated to `p.x = p.x`, and a DELETE branch whose
-- only real bound lives in a DIFFERENT policy is one edit to that other policy
-- away from being unbounded, with nothing in this file to notice. No new
-- helper, and the self-reference crosses a definer boundary rather than
-- recursing.
--
-- The group can still end up with no creator among its members: the creator
-- may leave through branch 1. That is a deliberate product call (leaving is
-- always allowed), and its consequence is that nobody can remove anyone
-- afterwards -- not that a departed creator retains the power.
--
-- --- THE TWO TRAPS ALREADY DOCUMENTED, AND HEEDED HERE ----------------------
--
-- 1. No inline subquery over `golf_conversation_participants` inside a policy
--    ON that table -- it recurses and takes messaging down entirely for every
--    query, not just the branch that needed it. The new helper is
--    SECURITY DEFINER for exactly this reason, the same escape
--    `golf_conversation_has_other_participant` uses. Guarded by
--    `src/test/schema/no-self-referencing-rls-policy.test.ts`.
-- 2. Every outer reference is TABLE-QUALIFIED. Written bare, an inner scope
--    wins and the clause degenerates to `x = x`, true for every row.
--
-- --- SAFETY -----------------------------------------------------------------
--
-- Strictly widening on both policies, and only along the three bounds above.
-- Every existing branch is reproduced byte-for-byte: the INSERT policy keeps
-- both 2026-08-07 and 2026-08-19 branches unchanged and appends a third, and
-- the DELETE policy keeps the baseline's self-delete as its first disjunct --
-- which is what "Leave group" uses and is the one membership capability that
-- works today.
--
-- --- INDEXES ----------------------------------------------------------------
--
-- No new index is needed, checked rather than assumed. Every column the two
-- new branches read is already indexed in production:
-- golf_conversation_participants(conversation_id), (user_id) and the
-- (conversation_id, user_id) unique key; golf_conversations(id), (created_by),
-- (team_id); golf_team_members(team_id), the partial (team_id, player_id)
-- WHERE status='active', and (player_id); golf_team_coach_staff(team_id),
-- (coach_id); golf_players(user_id); golf_coaches(user_id).
--
-- VERIFY: select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- VERIFY:  where n.nspname = 'public' and p.prosecdef
-- VERIFY:    and p.proname = 'golf_user_on_conversation_team';
-- VERIFY: select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
-- VERIFY:  where c.relname = 'golf_conversation_participants'
-- VERIFY:    and p.polname = 'golf_participants_delete'
-- VERIFY:    and pg_get_expr(p.polqual, p.polrelid)
-- VERIFY:        like '%golf_conversation_created_by_me%';
-- VERIFY: select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
-- VERIFY:  where c.relname = 'golf_conversation_participants'
-- VERIFY:    and p.polname = 'golf_participants_insert_v2'
-- VERIFY:    and pg_get_expr(p.polwithcheck, p.polrelid)
-- VERIFY:        like '%golf_user_on_conversation_team%';
--
-- ROLLBACK: re-create golf_participants_insert_v2 from its 20260819070000 shape
-- ROLLBACK: (branches 1 and 2 only) and golf_participants_delete from the
-- ROLLBACK: baseline
-- ROLLBACK: (`USING (user_id = auth.uid())`), THEN, and only then:
-- ROLLBACK:   drop function if exists
-- ROLLBACK:     public.golf_user_on_conversation_team(uuid, uuid);
-- ROLLBACK: Order matters: while either new branch is still live, dropping the
-- ROLLBACK: function first makes the INSERT policy ERROR rather than deny. Any
-- ROLLBACK: membership row added while this was live simply remains —
-- ROLLBACK: nothing in
-- ROLLBACK: the schema depends on how a participant got there.
--
-- --- VERIFIED (the pre-flight read to run before applying) ------------------
--
--   select polname, pg_get_expr(polqual, polrelid) as using_expr,
--          pg_get_expr(polwithcheck, polrelid) as check_expr
--     from pg_policy p join pg_class c on c.oid = p.polrelid
--    where c.relname = 'golf_conversation_participants'
--      and polname in ('golf_participants_delete',
--                      'golf_participants_insert_v2');
--
-- Expected BEFORE: golf_participants_delete is `user_id = auth.uid()` alone,
-- and golf_participants_insert_v2 has exactly two branches. If either already
-- differs, stop -- something was hand-applied and this migration is written
-- against the wrong starting state.
--
-- --- ROLLBACK ---------------------------------------------------------------
--
-- Strictly reducing, and safe to run at any time: re-create both policies from
-- their 20260819070000 / baseline shapes, then
-- `drop function if exists public.golf_user_on_conversation_team(uuid, uuid);`
-- (drop the function LAST -- while either new branch is live, dropping it
-- first makes the INSERT policy error rather than deny). Any membership row
-- added while this was live simply remains; nothing in the schema depends on
-- how a participant got there.
--
-- --- TESTED AGAINST A REAL POSTGRES, BOTH DIRECTIONS ------------------------
--
-- `supabase/tests/rls/golf_group_membership_management.sql` (12 pgTAP
-- assertions) was run against a local Docker stack with this migration
-- applied: all twelve pass. Re-run with both policies reverted to their
-- pre-migration shape inside the same transaction, exactly three fail -- the
-- delete policy's creator branch, the add, and the remove -- while the
-- 2026-08-19 refusals (DM injection, non-creator add) and the two-statement
-- creation order still pass. So the suite discriminates, and the widening
-- demonstrably did not disturb what the earlier hardening closed.
--
-- NOT APPLIED TO PRODUCTION BY THE AUTHORING SESSION. This re-opens a surface
-- that was closed after a verified production attack; it ships in the PR for
-- the owner's deliberate review and application, and the group-details UI it
-- backs fails visibly (42501, surfaced and recorded) until it is applied.

-- NO EXPLICIT `begin;`/`commit;`. The Supabase migration runner already wraps
-- each file in its own transaction, so an explicit pair here NESTS inside it —
-- squawk's `transaction-nesting` rule fails the Supabase job on exactly this
-- (CI run 34162432011). The file is still all-or-nothing; the transaction is
-- the runner's to manage, not this file's.

-- --- IS THIS OTHER USER ON THE CONVERSATION'S TEAM? -------------------------
--
-- `golf_conversation_on_my_team` answers for the CALLER (it reads auth.uid()
-- through is_golf_team_player/is_golf_team_coach). The INSERT branch added
-- below has to ask about the person being ADDED, who is by definition not the
-- caller, so the existing helper cannot answer it. This is the target-user
-- variant: `p_user_id` is explicit and auth.uid() is never consulted.
--
-- The membership test mirrors `is_golf_team_player` and `is_golf_team_coach`
-- exactly, including the players' `status = 'active'` bound -- an inactive
-- roster row is not membership.

create or replace function public.golf_user_on_conversation_team(
    p_conversation_id uuid,
    p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.golf_conversations c
     where c.id = p_conversation_id
       and c.team_id is not null
       and (
         exists (
           select 1
             from public.golf_team_members gtm
             join public.golf_players gp on gp.id = gtm.player_id
            where gtm.team_id = c.team_id
              and gp.user_id = p_user_id
              and gtm.status = 'active'
         )
         or exists (
           select 1
             from public.golf_team_coach_staff gtcs
             join public.golf_coaches gc on gc.id = gtcs.coach_id
            where gtcs.team_id = c.team_id
              and gc.user_id = p_user_id
         )
       )
  );
$$;

comment on function public.golf_user_on_conversation_team(uuid, uuid) is
'Is the NAMED user (p_user_id, not the caller) an active player or a coach on '
'the team that owns this conversation? It runs with definer rights (see the '
'search_path pinned above) so the participant '
'INSERT policy can ask about a user whose roster rows the caller may not be '
'able to read. Reads only; grants no access.';

revoke all on function public.golf_user_on_conversation_team(
    uuid, uuid
) from public;
revoke all on function public.golf_user_on_conversation_team(
    uuid, uuid
) from anon;
grant execute on function public.golf_user_on_conversation_team(
    uuid, uuid
) to authenticated;

-- --- INSERT -----------------------------------------------------------------
--
-- Branches 1 and 2 are reproduced unchanged from 20260819070000. Branch 3 is
-- the addition.

drop policy if exists golf_participants_insert_v2
on public.golf_conversation_participants;

create policy golf_participants_insert_v2
on public.golf_conversation_participants
for insert
with check (
    -- Branch 1 -- adding YOURSELF. Unchanged from the 2026-08-07 hardening.
    (
        user_id = (select auth.uid())
        and (
            golf_conversation_created_by_me(conversation_id)
            or exists (
                select 1
                from public.golf_conversations c
                where
                    c.id = golf_conversation_participants.conversation_id
                    and c.is_team_chat = true
                    and c.team_id is not null
                    and golf_conversation_on_my_team(
                        golf_conversation_participants.conversation_id
                    )
            )
        )
    )
    -- Branch 2 -- the creator adding OTHERS at creation time. Unchanged from
    -- the 2026-08-19 hardening; this is what makes the two-statement creation
    -- batch in src/app/actions/messages.ts work.
    or (
        exists (
            select 1
            from public.golf_conversations gc
            where
                gc.id = golf_conversation_participants.conversation_id
                and gc.created_by = (select auth.uid())
        )
        and not public.golf_conversation_has_other_participant(conversation_id)
    )
    -- Branch 3 -- NEW. The creator adding an existing TEAMMATE to a settled
    -- TEAM CHAT. Unreachable for a DM (is_team_chat), and unreachable for
    -- anyone not already on the owning team (golf_user_on_conversation_team),
    -- which is what distinguishes it from the branch removed on 2026-08-19.
    or (
        golf_conversation_created_by_me(
            golf_conversation_participants.conversation_id
        )
        and exists (
            select 1
            from public.golf_conversations c
            where
                c.id = golf_conversation_participants.conversation_id
                and c.is_team_chat = true
                and c.team_id is not null
        )
        and public.golf_user_on_conversation_team(
            golf_conversation_participants.conversation_id,
            golf_conversation_participants.user_id
        )
    )
);

-- --- DELETE -----------------------------------------------------------------
--
-- The first disjunct is the baseline policy verbatim. It is what "Leave group"
-- uses and it must keep working exactly as it does today.

drop policy if exists golf_participants_delete
on public.golf_conversation_participants;

create policy golf_participants_delete
on public.golf_conversation_participants
for delete
to authenticated
using (
    -- Branch 1 -- leaving. Unchanged from the baseline.
    golf_conversation_participants.user_id = (select auth.uid())
    -- Branch 2 -- NEW. The creator removing SOMEONE ELSE from a team chat.
    -- `user_id <> auth.uid()` keeps "remove" from being a second, unlabelled
    -- way to leave: since branch 2 requires the actor to be the creator,
    -- excluding the actor's own row is exactly excluding the creator's row.
    -- Removing yourself is still possible -- through branch 1, which is
    -- "leave", not "remove".
    --
    -- The last clause requires the ACTOR to still be in the conversation --
    -- redundant with `golf_participants_select_v2` today and kept anyway, for
    -- the reason argued in the header. `user_conversation_ids` ignores its
    -- argument and reads `auth.uid()` itself; it is passed for call-site
    -- consistency with the other policies on this table.
    or (
        golf_conversation_created_by_me(
            golf_conversation_participants.conversation_id
        )
        and golf_conversation_participants.user_id <> (select auth.uid())
        and exists (
            select 1
            from public.golf_conversations c
            where
                c.id = golf_conversation_participants.conversation_id
                and c.is_team_chat = true
                and c.team_id is not null
        )
        and golf_conversation_participants.conversation_id in (
            select public.user_conversation_ids((select auth.uid()))
        )
    )
);

-- --- VERIFICATION (run after applying) --------------------------------------
--
-- All six, and the refusals alone are not sufficient: a predicate that blocks
-- everything passes every refusal check. Run each in a rolled-back
-- transaction.
--
--   1. ADD PERMITTED. As a team chat's creator, insert a participant row for a
--      user who is an active player on the owning team. Expect success.
--   2. ADD REFUSED -- NOT ON THE TEAM. Same, for a user who is on no roster
--      for that team. Expect 42501.
--   3. ADD REFUSED -- NOT A TEAM CHAT. As a DM's creator, attempt to add a
--      third user to that DM. Expect 42501. This is 20260819070000's own
--      refusal check and it must still pass unchanged.
--   4. REMOVE PERMITTED. As a team chat's creator, delete another
--      participant's row. Expect success.
--   5. REMOVE REFUSED -- THE CREATOR'S OWN ROW IS NOT REMOVABLE BY BRANCH 2.
--      Verify by checking that a non-creator participant cannot delete the
--      creator's row (expect 0 rows affected), since the creator deleting
--      their own row is branch 1 and legitimately succeeds.
--   6. CREATION STILL WORKS. Create a conversation, insert self, then insert
--      two other participants in a SECOND statement. Both must succeed --
--      this is the exact order the application uses and the check that
--      20260819070000 called load-bearing.
