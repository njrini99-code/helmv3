-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md). Additive and safe to apply at any time; it is
-- the prerequisite of 20261017005000, which must not be applied before it.
-- Apply: npm run db:apply --
-- supabase/migrations/20261017004000_golf_player_profiles_fn.sql
--
-- Security review 2026-10-16, item S4, step 1 of 2. A teammate can read
-- another player's FULL golf_players row (email, phone, gpa, high_school_name,
-- hometown, state) by a direct database read, because golf_players_select
-- admits user_is_teammate_of_golf_player(id). Clubhouse and Fairway show a
-- teammate only a name, an avatar, a graduation year and a handicap.
--
-- This adds the safe surface teammates will read instead:
--
--   golf_player_profiles(p_player_ids uuid[], p_user_ids uuid[],
--                        p_team_ids uuid[])
--     -> id, user_id, first_name, last_name, avatar_url, graduation_year,
--        handicap, handicap_index
--
-- for exactly the rows golf_players_select admits today (self, a coach staffed
-- on the player's team, a coach with the player's pending join request, an
-- active teammate, an admin). It returns no sensitive column, so the teammate
-- branch can then be removed from the table's policy (20261017005000) without
-- taking names and avatars away from rosters, leaderboards, RSVP lists and
-- messages. At least one list is required (players, accounts, or teams whose
-- roster rows to read): it answers "these players", never "everyone I can see".
-- The team form lets a page read a roster's names in the same round trip as
-- the roster itself.
--
-- A function, not a view: a view over golf_players exposing `id` would give
-- PostgREST a second relationship for every foreign key to golf_players, and
-- an embed hinted by column (`player:player_id(...)`) would then fail as
-- ambiguous (PGRST201). The app reads it through one helper,
-- src/lib/golf/player-profiles.ts, which falls back to the table read while
-- this function is not applied, so the app can ship first.
--
-- pgTAP: NOT WRITTEN YET. Required before this is applied (HELD.md):
-- supabase/tests/rls/golf_player_profiles_teammate_scope.sql.
--
-- ROLLBACK: DROP FUNCTION public.golf_player_profiles(uuid[], uuid[], uuid[]);
-- only
-- after 20261017005000 is rolled back (the app falls back to the table read).
--
-- VERIFY: select 1 from pg_proc where oid = 'public.golf_player_profiles(uuid[], uuid[], uuid[])'::regprocedure and prosecdef and not has_function_privilege('anon', oid, 'EXECUTE') and has_function_privilege('authenticated', oid, 'EXECUTE');  -- noqa: LT05

-- The migration tool runs this file in one transaction.

create or replace function public.golf_player_profiles(
    p_player_ids uuid[] default null,
    p_user_ids uuid[] default null,
    p_team_ids uuid[] default null
)
returns table (
    id uuid,
    user_id uuid,
    first_name text,
    last_name text,
    avatar_url text,
    graduation_year integer,
    handicap numeric,
    handicap_index numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select gp.id, gp.user_id, gp.first_name, gp.last_name, gp.avatar_url,
         gp.graduation_year, gp.handicap, gp.handicap_index
    from public.golf_players gp
   where (p_player_ids is not null or p_user_ids is not null or p_team_ids is not null)
     and (p_player_ids is null or gp.id = any (p_player_ids))
     and (p_user_ids is null or gp.user_id = any (p_user_ids))
     and (
       p_team_ids is null
       or exists (
         select 1 from public.golf_team_members m
          where m.player_id = gp.id and m.team_id = any (p_team_ids)
       )
     )
     and (
       gp.user_id = (select auth.uid())
       or public.user_is_coach_of_golf_player(gp.id)
       or public.user_has_pending_join_request_to_coach_team(gp.id)
       or public.user_is_teammate_of_golf_player(gp.id)
       or public.is_admin()
     );
$$;

comment on function public.golf_player_profiles(uuid[], uuid[], uuid[]) is
'Display-safe golf player columns (no email, phone, gpa, school, hometown, state) for the given player ids, user ids or teams'' roster rows, limited to the players golf_players_select admitted before 2026-10-17: self, staffed coach, pending-join coach, active teammate, admin. How a player reads a teammate (security review S4).';  -- noqa: LT05

revoke execute on function public.golf_player_profiles(uuid[], uuid[], uuid[])
from public, anon;
grant execute on function public.golf_player_profiles(uuid[], uuid[], uuid[])
to authenticated, service_role;
