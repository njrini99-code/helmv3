-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md). Apply: npm run db:apply --
-- supabase/migrations/20261017003000_golf_participant_insert_tenancy.sql
--
-- Security review 2026-10-16, item S8. golf_participants_insert_v2's second
-- branch -- the creator adding the OTHER people while the conversation is
-- being formed (no non-creator participant yet) -- has no bound on WHO is
-- added. The creator of a fresh conversation could add any user id in the
-- product, from any program, and that user then reads the thread. Only the app
-- checked tenancy (assertGolfConversationAudience,
-- src/lib/golf/conversation-audience.ts); a direct PostgREST insert did not.
--
-- Now the added user must belong to the conversation's team: on its roster
-- (an ACTIVE row), or a coach staffed on it. That is the app's own audience
-- (resolveGolfTeamAudience) minus one thing: the app also admits
-- coaches of the team's organization who have no staff row. The database does
-- not, because organization membership is the S1 attack surface (a coach row's
-- organization_id is being pinned separately) and a staff row is what every
-- other golf policy trusts. Measured in production on 2026-10-16 (read-only):
-- no existing conversation has an organization-only coach as a non-creator
-- participant, so no flow the product has used is cut off.
--
-- Why a new helper rather than golf_user_on_conversation_team (branch 3's):
-- that one answers only for a player on a settled team chat, and branch 2 must
-- also admit a coach staffed on the team while the conversation is formed.
-- Players count only while their roster row is active, as the broadcast and
-- the new-group picker list them (createGolfTeamBroadcast reads active members
-- only): a pending, inactive or removed player must not be added to a chat.
-- Branch 1 (self) and branch 3 (team-chat teammate) are unchanged.
--
-- Production, 2026-10-16 (read-only): of 46 existing non-creator participant
-- rows, 5 fail the stricter active-only helper -- 3 team-chat members whose
-- roster row is now inactive, and 2 DM participants not on the DM's team at
-- all, joined 2026-02-11 and 2026-08-06 (before the app's audience check). No
-- existing row is changed: a policy decides new inserts only.
--
-- The creation order the app uses still works (self first, then the others in
-- a second statement, or everyone in one statement for a broadcast), because
-- the new helper is SECURITY DEFINER and reads the roster without re-entering
-- RLS on this table (the recursion note in 20260819070000).
--
-- pgTAP: supabase/tests/rls/golf_participant_insert_tenancy.sql, plus the
-- existing golf_group_membership_management.sql.
--
-- ROLLBACK: recreate golf_participants_insert_v2 exactly as
-- 20260907160000_golf_team_chat_membership_management.sql defines it (branch 2
-- without the golf_user_in_conversation_team_audience term), then
-- DROP FUNCTION public.golf_user_in_conversation_team_audience(uuid, uuid).
--
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_conversation_participants' and policyname = 'golf_participants_insert_v2' and position('golf_user_in_conversation_team_audience' in with_check) > 0 and position('golf_conversation_has_other_participant' in with_check) > 0 and position('golf_user_on_conversation_team' in with_check) > 0;  -- noqa: LT05
-- VERIFY: select 1 from pg_proc where oid = 'public.golf_user_in_conversation_team_audience(uuid, uuid)'::regprocedure and prosecdef and not has_function_privilege('anon', oid, 'EXECUTE') and has_function_privilege('authenticated', oid, 'EXECUTE');  -- noqa: LT05

-- The migration tool runs this file in one transaction.
set local lock_timeout = '3s';

create or replace function public.golf_user_in_conversation_team_audience(
    p_conversation_id uuid, p_user_id uuid
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
              and gtm.status = 'active'
              and gp.user_id = p_user_id
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

comment on function public.golf_user_in_conversation_team_audience(uuid, uuid) is  -- noqa: LT05
'True when p_user_id is on the conversation''s team roster (active rows) or a coach staffed on that team. Bounds who a conversation''s creator may add while it is formed (golf_participants_insert_v2, branch 2). Definer rights avoid re-entering RLS on golf_conversation_participants.';  -- noqa: LT05

revoke execute on function public.golf_user_in_conversation_team_audience(
    uuid, uuid
) from public, anon;
grant execute on function public.golf_user_in_conversation_team_audience(
    uuid, uuid
) to authenticated, service_role;

drop policy if exists golf_participants_insert_v2
on public.golf_conversation_participants;
create policy golf_participants_insert_v2
on public.golf_conversation_participants
for insert
with check (
    -- Branch 1 -- adding YOURSELF. Unchanged.
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
    -- Branch 2 -- the creator adding OTHERS at creation time, now only people
    -- on the conversation's team (S8, 2026-10-16).
    or (
        exists (
            select 1
            from public.golf_conversations gc
            where
                gc.id = golf_conversation_participants.conversation_id
                and gc.created_by = (select auth.uid())
        )
        and not public.golf_conversation_has_other_participant(conversation_id)
        and public.golf_user_in_conversation_team_audience(
            golf_conversation_participants.conversation_id,
            golf_conversation_participants.user_id
        )
    )
    -- Branch 3 -- the creator adding an existing TEAMMATE to a settled TEAM
    -- CHAT. Unchanged.
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
