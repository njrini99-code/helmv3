-- F-05 (launch readiness): a team's roster limit and who doesn't count toward it. RLS is on for both tables, a coach of
-- the team writes, a player reads the limit but never an exemption (it names a reason about a teammate), an exemption's
-- player must be on the team, the limit defaults to 9 (NCAA DI Bylaw 17.2) within 1 to 40, and anon holds nothing.
begin;

select plan(11);

select has_table('public', 'golf_team_roster_limits', 'the roster limits table exists');
select has_table('public', 'golf_roster_exemptions', 'the roster exemptions table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.golf_team_roster_limits'::regclass), 'RLS is on for golf_team_roster_limits');
select ok((select relrowsecurity from pg_class where oid = 'public.golf_roster_exemptions'::regclass), 'RLS is on for golf_roster_exemptions');
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'golf_team_roster_limits' and policyname = 'golf_team_roster_limits_select')
    like '%is_golf_team_coach(team_id)%is_golf_team_player(team_id)%',
  'the limit is read by the team''s coaches and active players only');
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'golf_roster_exemptions' and policyname = 'golf_roster_exemptions_select')
    not like '%is_golf_team_player%',
  'players never read an exemption');
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'golf_roster_exemptions' and policyname = 'golf_roster_exemptions_insert')
    like '%is_golf_team_coach(team_id)%golf_team_members%player_id%',
  'only a coach of the team marks a player, and the player must be on the team');
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'golf_team_roster_limits' and policyname = 'golf_team_roster_limits_update')
    like '%is_golf_team_coach(team_id)%',
  'only a coach of the team changes the limit');
select col_default_is('public', 'golf_team_roster_limits', 'max_players', '9', 'a saved limit starts at 9, the Division I golf limit');
select ok(not has_table_privilege('anon', 'public.golf_team_roster_limits', 'SELECT'), 'anon cannot read roster limits');
select ok(not has_table_privilege('anon', 'public.golf_roster_exemptions', 'SELECT'), 'anon cannot read roster exemptions');

select * from finish();
rollback;
