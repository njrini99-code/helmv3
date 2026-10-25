-- STATUS: WRITTEN — HOLD — NOT APPLIED
-- P016 Clubhouse Tournaments, held migration 2 of 6: row level security.
-- Written 2026-10-23 from handoff 4.33 section 11.3. Registered in
-- supabase/migrations/HELD.md; the owner applies it. Plan:
-- docs/clubhouse/held/data/tournaments.md.
--
-- APPLY ALL SIX TOGETHER, IN THIS ORDER, IN ONE SESSION: 20261024100000
-- (tables), 100100 (this), 100200 (RPCs), 100300 (player moments), 100400
-- (push_tournaments preference), 100500 (live round); each through
-- npm run db:apply, no BEGIN/COMMIT in any of them. Never leave this file
-- applied without 100300 once players use the flag. 20261024100300 replaces
-- four of the player read rules below (entries, round lineups and field
-- scores become reveal-gated and window-gated, player rounds window-gated;
-- finding 3 in 0-R.3, D-85, D-87) and the player notes read rule (unshared
-- lines).
--
-- WHO MAY TOUCH WHAT (is_golf_team_coach / is_golf_team_player are the
-- existing SECURITY DEFINER helpers):
--   * structure (tournaments, rounds, entries, round lineups, field teams,
--     advice givers, team seasons): coaches and active players of the team
--     read, admins read, coaches write;
--   * field scores: team reads, coaches write;
--   * player rounds: a coach reads all, a player reads their own always and
--     a teammate's once that round is final; a player may only insert a link
--     to their own GolfHelm round (D-85, D-88);
--   * entry notes and reviews: coaches only (never a player, D-85);
--   * result marks: team reads, coaches insert, nobody updates or deletes;
--   * player notes: coaches all, the player reads their own once shared;
--   * reflections: the player owns theirs, coaches read;
--   * coach presence: team coaches read, each coach writes only their own;
--   * link dismissals: coaches; saved comparisons: the owner (a coach), and
--     the team's coaches read the shared ones.
-- TEAM SCOPING (Round 6): every player branch, including a player's own
-- rows, also requires is_golf_team_player(team_id) (an active
-- golf_team_members row on that team), so no policy admits anyone by
-- identity alone. Cross-row consistency (the player is on the team, the
-- event is the team's) is the trigger in 100000.
-- Teammates can already read each other's golf_rounds and golf_holes (D-36,
-- policies/golf.sql golf_rounds_select). These policies are the second line
-- for tournament rows; loaders are the first (11.3, D-85).
--
-- Risk: LOW. Policies on the new tables only; one new SECURITY DEFINER read
-- helper, executable by authenticated and never by anon or PUBLIC.
--
-- ROLLBACK: drop every policy this file creates (names below) and
--   drop function if exists public.golf_tournament_round_is_final(uuid);
-- RLS stays enabled (20261024100000), so the tables close again.
--
-- VERIFY: select 1 where (select count(*) from pg_policies where schemaname
-- VERIFY: = 'public' and tablename like 'golf_tournament%') >= 20;
-- VERIFY: select 1 where not has_function_privilege('anon',
-- VERIFY: 'public.golf_tournament_round_is_final(uuid)', 'EXECUTE');

set local lock_timeout = '3s';

-- RLS was enabled when the tables were created; repeated here so this file
-- states the contract on its own.
alter table public.golf_tournaments enable row level security;
alter table public.golf_tournament_rounds enable row level security;
alter table public.golf_tournament_entries enable row level security;
alter table public.golf_tournament_round_lineups enable row level security;
alter table public.golf_tournament_player_rounds enable row level security;
alter table public.golf_tournament_field_teams enable row level security;
alter table public.golf_tournament_field_scores enable row level security;
alter table public.golf_tournament_result_marks enable row level security;
alter table public.golf_tournament_entry_notes enable row level security;
alter table public.golf_tournament_reviews enable row level security;
alter table public.golf_tournament_player_notes enable row level security;
alter table public.golf_tournament_reflections enable row level security;
alter table public.golf_tournament_advice_givers enable row level security;
alter table public.golf_tournament_coach_presence enable row level security;
alter table public.golf_saved_comparisons enable row level security;
alter table public.golf_team_seasons enable row level security;
alter table public.golf_tournament_link_dismissals enable row level security;

-- 1. Team-visible structure: coaches and active players of the team read
-- (admins too); coaches write. Policy names <table>_select and
-- <table>_coach_write.
do $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'golf_tournaments', 'golf_tournament_rounds',
    'golf_tournament_field_teams',
    'golf_tournament_advice_givers', 'golf_team_seasons'
  ]
  LOOP
    EXECUTE format('drop policy if exists %I on public.%I', t || '_select', t);
    EXECUTE format(
      'create policy %I on public.%I for select to authenticated using ('
      || 'public.is_golf_team_coach(team_id) '
      || 'or public.is_golf_team_player(team_id) or public.is_admin())',
      t || '_select', t);
    EXECUTE format(
      'drop policy if exists %I on public.%I', t || '_coach_write', t);
    EXECUTE format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.is_golf_team_coach(team_id)) '
      || 'with check (public.is_golf_team_coach(team_id))',
      t || '_coach_write', t);
  END LOOP;
END $$;

-- 1b. Entries and round lineups are the coach's draft until the reveal rules
-- (20261024100300, not yet written) say when a player may see them. Until that
-- file exists a player reads neither, so a lineup the coach is still drafting
-- never leaks to the team through the API; coaches and admins read and coaches
-- write, as for the tables above.
do $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'golf_tournament_entries', 'golf_tournament_round_lineups'
  ]
  LOOP
    EXECUTE format('drop policy if exists %I on public.%I', t || '_select', t);
    EXECUTE format(
      'create policy %I on public.%I for select to authenticated using ('
      || 'public.is_golf_team_coach(team_id) or public.is_admin())',
      t || '_select', t);
    EXECUTE format(
      'drop policy if exists %I on public.%I', t || '_coach_write', t);
    EXECUTE format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.is_golf_team_coach(team_id)) '
      || 'with check (public.is_golf_team_coach(team_id))',
      t || '_coach_write', t);
  END LOOP;
END $$;

-- 2. Field scores carry their team id; read through it. Coach-only for the same
-- reason as 1b: a player sees scores once the reveal rules exist.
drop policy if exists golf_tfs_select on public.golf_tournament_field_scores;
create policy golf_tfs_select on public.golf_tournament_field_scores
for select to authenticated
using (
    public.is_golf_team_coach(team_id) or public.is_admin()
);
drop policy if exists golf_tfs_coach_write
on public.golf_tournament_field_scores;
create policy golf_tfs_coach_write on public.golf_tournament_field_scores
for all to authenticated
using (public.is_golf_team_coach(team_id))
with check (public.is_golf_team_coach(team_id));

-- 3. Player rounds. A round is final once the coach marks it (D-84). This
-- helper reads golf_tournament_rounds without the caller's RLS so a policy
-- can ask it per row.
create or replace function public.golf_tournament_round_is_final(
    p_round_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  SELECT EXISTS (
    SELECT 1 FROM public.golf_tournament_rounds r
    WHERE r.round_event_id = p_round_event_id AND r.status = 'final'
  );
$$;
revoke all on function public.golf_tournament_round_is_final(uuid)
from public, anon;
grant execute on function public.golf_tournament_round_is_final(uuid)
to authenticated, service_role;

drop policy if exists golf_tpr_select on public.golf_tournament_player_rounds;
create policy golf_tpr_select on public.golf_tournament_player_rounds
for select to authenticated
using (
    public.is_golf_team_coach(team_id)
    or (
        public.is_golf_team_player(team_id)
        and (
            exists (
                select 1 from public.golf_players as gp
                where
                    gp.id = golf_tournament_player_rounds.player_id
                    and gp.user_id = (select auth.uid())
            )
            or public.golf_tournament_round_is_final(round_event_id)
        )
    )
);
drop policy if exists golf_tpr_coach_write
on public.golf_tournament_player_rounds;
create policy golf_tpr_coach_write on public.golf_tournament_player_rounds
for all to authenticated
using (public.is_golf_team_coach(team_id))
with check (public.is_golf_team_coach(team_id));
-- A player links their own GolfHelm round, only their own round, and only
-- for a round they are in (the lineup snapshot taken at lock).
drop policy if exists golf_tpr_player_link
on public.golf_tournament_player_rounds;
create policy golf_tpr_player_link on public.golf_tournament_player_rounds
for insert to authenticated
with check (
    exists (
        select 1 from public.golf_players as gp
        where
            gp.id = golf_tournament_player_rounds.player_id
            and gp.user_id = (select auth.uid())
    )
    and public.is_golf_team_player(team_id)
    and exists (
        select 1 from public.golf_tournament_round_lineups as rl
        where
            rl.round_event_id = golf_tournament_player_rounds.round_event_id
            and rl.player_id = golf_tournament_player_rounds.player_id
            and rl.role in ('lineup', 'individual')
    )
    and entered_total is null
    and status = 'ok'
    and link_source = 'player'
    and exists (
        select 1 from public.golf_rounds as r
        where
            r.id = golf_tournament_player_rounds.round_id
            and r.player_id = golf_tournament_player_rounds.player_id
    )
);

-- 4. Coach only: lineup reasoning and the review (D-85)
drop policy if exists golf_ten_coach on public.golf_tournament_entry_notes;
create policy golf_ten_coach on public.golf_tournament_entry_notes
for all to authenticated
using (public.is_golf_team_coach(team_id))
with check (public.is_golf_team_coach(team_id));
drop policy if exists golf_trev_coach on public.golf_tournament_reviews;
create policy golf_trev_coach on public.golf_tournament_reviews
for all to authenticated
using (public.is_golf_team_coach(team_id))
with check (public.is_golf_team_coach(team_id));

-- 5. Result marks: the team reads, coaches insert. No UPDATE or DELETE
-- policy, and no UPDATE or DELETE grant: append-only.
drop policy if exists golf_trm_select on public.golf_tournament_result_marks;
create policy golf_trm_select on public.golf_tournament_result_marks
for select to authenticated
using (
    public.is_golf_team_coach(team_id) or public.is_golf_team_player(team_id)
);
drop policy if exists golf_trm_coach_insert
on public.golf_tournament_result_marks;
create policy golf_trm_coach_insert on public.golf_tournament_result_marks
for insert to authenticated
with check (
    public.is_golf_team_coach(team_id) and created_by = (select auth.uid())
);
revoke update, delete on public.golf_tournament_result_marks
from authenticated;

-- 6. Coach presence: the team's coaches read; each coach writes only their
-- own row.
drop policy if exists golf_tcp_coach on public.golf_tournament_coach_presence;
drop policy if exists golf_tcp_select
on public.golf_tournament_coach_presence;
create policy golf_tcp_select on public.golf_tournament_coach_presence
for select to authenticated
using (public.is_golf_team_coach(team_id));
drop policy if exists golf_tcp_own on public.golf_tournament_coach_presence;
create policy golf_tcp_own on public.golf_tournament_coach_presence
for all to authenticated
using (
    public.is_golf_team_coach(team_id) and coach_user_id = (select auth.uid())
)
with check (
    public.is_golf_team_coach(team_id) and coach_user_id = (select auth.uid())
);

-- 7. Player notes: coaches all; the player reads their own once shared.
-- 20261024100300 replaces the player read with a shared-lines-only reader.
drop policy if exists golf_tpn_coach on public.golf_tournament_player_notes;
create policy golf_tpn_coach on public.golf_tournament_player_notes
for all to authenticated
using (public.is_golf_team_coach(team_id))
with check (public.is_golf_team_coach(team_id));
drop policy if exists golf_tpn_player_read
on public.golf_tournament_player_notes;
create policy golf_tpn_player_read on public.golf_tournament_player_notes
for select to authenticated
using (
    shared_at is not null
    and public.is_golf_team_player(team_id)
    and exists (
        select 1 from public.golf_players as gp
        where
            gp.id = golf_tournament_player_notes.player_id
            and gp.user_id = (select auth.uid())
    )
);

-- 8. Reflections: the player owns theirs; coaches read (the screen says so).
drop policy if exists golf_tref_own on public.golf_tournament_reflections;
create policy golf_tref_own on public.golf_tournament_reflections
for all to authenticated
using (
    public.is_golf_team_player(team_id)
    and exists (
        select 1 from public.golf_players as gp
        where
            gp.id = golf_tournament_reflections.player_id
            and gp.user_id = (select auth.uid())
    )
)
with check (
    exists (
        select 1 from public.golf_players as gp
        where
            gp.id = golf_tournament_reflections.player_id
            and gp.user_id = (select auth.uid())
    )
    and public.is_golf_team_player(team_id)
);
drop policy if exists golf_tref_coach_read
on public.golf_tournament_reflections;
create policy golf_tref_coach_read on public.golf_tournament_reflections
for select to authenticated
using (public.is_golf_team_coach(team_id));

-- 9. Rounds a coach said are not tournament rounds
drop policy if exists golf_tld_coach on public.golf_tournament_link_dismissals;
create policy golf_tld_coach on public.golf_tournament_link_dismissals
for all to authenticated
using (public.is_golf_team_coach(team_id))
with check (public.is_golf_team_coach(team_id));

-- 10. Saved comparisons: the owner (a coach of the team); the team's coaches
-- read the shared ones. Players never.
drop policy if exists golf_sc_owner on public.golf_saved_comparisons;
create policy golf_sc_owner on public.golf_saved_comparisons
for all to authenticated
using (
    owner_id = (select auth.uid()) and public.is_golf_team_coach(team_id)
)
with check (
    owner_id = (select auth.uid()) and public.is_golf_team_coach(team_id)
);
drop policy if exists golf_sc_shared_read on public.golf_saved_comparisons;
create policy golf_sc_shared_read on public.golf_saved_comparisons
for select to authenticated
using (shared and public.is_golf_team_coach(team_id));
