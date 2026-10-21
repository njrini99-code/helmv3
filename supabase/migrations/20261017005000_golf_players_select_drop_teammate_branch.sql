-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md). ORDER MATTERS:
-- 1. 20261017004000_golf_player_profiles_fn.sql is applied (this file checks).
--   2. The app from the same PR (security review S2-S9) is deployed: it reads
--      teammates through golf_player_profiles instead of the table.
--   3. Then this file.
-- Applied before step 2, every teammate list on live Fairway pages (roster,
-- team, team hub, qualifier leaderboards, RSVP lists, attendance, messages)
-- shows only the viewer, with no error.
-- Apply: npm run db:apply --
-- supabase/migrations/20261017005000_golf_players_select_drop_teammate_branch.sql  -- noqa: LT05
--
-- Security review 2026-10-16, item S4, step 2 of 2. golf_players_select let a
-- player read a teammate's FULL row, email, phone, gpa, high_school_name,
-- hometown and state included, through user_is_teammate_of_golf_player(id).
-- Owner default (2026-10-16): those columns are coach-only. The branch is
-- removed; the player's own row, the team's staff, a coach with the player's
-- pending join request and admins (admin_read_all) are unchanged. Teammates
-- read display columns through golf_player_profiles (20261017004000).
--
-- user_is_teammate_of_golf_player itself is kept: get_player_stats_summary
-- and golf_player_profiles call it.
--
-- Measured before writing (helm-reader sweep, 2026-10-16): 19 app reads
-- returned a teammate's golf_players row under the caller's RLS, none of them
-- selecting a sensitive column; all 19 now read golf_player_profiles. No other
-- table's policy reads golf_players except pinned to auth.uid(), and the only
-- SECURITY INVOKER functions reading it are admin-only.
--
-- pgTAP: supabase/tests/rls/golf_player_profiles_teammate_scope.sql (covers
-- both files; CI builds the database from every migration).
--
-- ROLLBACK: recreate the previous policy (pg_policies, 2026-10-16):
--   create policy golf_players_select on public.golf_players for select
--   to authenticated using ((user_id = (select auth.uid()))
--   or user_is_coach_of_golf_player(id)
--   or user_has_pending_join_request_to_coach_team(id)
--   or user_is_teammate_of_golf_player(id));
--
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'golf_players' and policyname = 'golf_players_select' and position('user_is_teammate_of_golf_player' in qual) = 0 and position('user_is_coach_of_golf_player' in qual) > 0 and position('user_has_pending_join_request_to_coach_team' in qual) > 0;  -- noqa: LT05

-- The migration tool runs this file in one transaction.
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('public.golf_player_profiles(uuid[], uuid[], uuid[])') is null then
    raise exception
      'apply 20261017004000_golf_player_profiles_fn.sql first: teammates read golf_player_profiles once this branch is gone';
  end if;
end
$$;

drop policy if exists golf_players_select on public.golf_players;
create policy golf_players_select
on public.golf_players
for select to authenticated
using (
    user_id = (select auth.uid())
    or public.user_is_coach_of_golf_player(id)
    or public.user_has_pending_join_request_to_coach_team(id)
);
