-- F-03 (launch readiness): the practice-hours tables are the team's. RLS is on, a coach writes and a player reads
-- through the team helpers, an adjustment's event must be the same team's, and anon holds nothing.
begin;

select plan(12);

select has_table('public', 'golf_team_hours_settings', 'the team hours settings table exists');
select has_table('public', 'golf_hours_adjustments', 'the hours adjustments table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.golf_team_hours_settings'::regclass), 'RLS is on for golf_team_hours_settings');
select ok((select relrowsecurity from pg_class where oid = 'public.golf_hours_adjustments'::regclass), 'RLS is on for golf_hours_adjustments');

select policies_are('public', 'golf_team_hours_settings',
  array['golf_team_hours_settings_select', 'golf_team_hours_settings_insert', 'golf_team_hours_settings_update'],
  'settings: read, insert and update only (no delete)');
select policies_are('public', 'golf_hours_adjustments',
  array['golf_hours_adjustments_select', 'golf_hours_adjustments_insert', 'golf_hours_adjustments_update', 'golf_hours_adjustments_delete'],
  'adjustments: read, insert, update and delete');

select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'golf_team_hours_settings' and policyname = 'golf_team_hours_settings_select')
    like '%is_golf_team_coach(team_id)%is_golf_team_player(team_id)%',
  'settings are read by the team''s coaches and active players only');
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'golf_team_hours_settings' and policyname = 'golf_team_hours_settings_insert')
    like '%is_golf_team_coach(team_id)%',
  'only a coach of the team writes settings');
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'golf_hours_adjustments' and policyname = 'golf_hours_adjustments_insert')
    like '%golf_events%team_id%',
  'an adjustment''s event must belong to the same team');

select ok(not has_table_privilege('anon', 'public.golf_team_hours_settings', 'SELECT'), 'anon cannot read settings');
select ok(not has_table_privilege('anon', 'public.golf_hours_adjustments', 'SELECT'), 'anon cannot read adjustments');
select ok(not has_table_privilege('authenticated', 'public.golf_team_hours_settings', 'DELETE'), 'no one deletes a team''s settings');

select * from finish();
rollback;
