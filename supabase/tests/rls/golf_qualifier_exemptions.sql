-- F-06 (launch readiness): a qualifier exemption is coach-only (its reason is like a pick's reasoning, D-33). RLS is
-- on, only a coach of the team reads or writes, the qualifier must be the team's and the player one of its entrants,
-- a reason is required, and anon holds nothing.
begin;

select plan(9);

select has_table('public', 'golf_qualifier_exemptions', 'the qualifier exemptions table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.golf_qualifier_exemptions'::regclass), 'RLS is on for golf_qualifier_exemptions');
select policies_are('public', 'golf_qualifier_exemptions',
  array['golf_qualifier_exemptions_select', 'golf_qualifier_exemptions_insert', 'golf_qualifier_exemptions_update', 'golf_qualifier_exemptions_delete'],
  'exemptions: read, insert, update and delete');
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'golf_qualifier_exemptions' and policyname = 'golf_qualifier_exemptions_select')
    like '%is_golf_team_coach(team_id)%'
  and (select qual from pg_policies where schemaname = 'public' and tablename = 'golf_qualifier_exemptions' and policyname = 'golf_qualifier_exemptions_select')
    not like '%is_golf_team_player%',
  'exemptions are read by the team''s coaches only, never players');
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'golf_qualifier_exemptions' and policyname = 'golf_qualifier_exemptions_insert')
    like '%is_golf_team_coach(team_id)%golf_qualifiers%golf_qualifier_entries%',
  'only a coach writes one, for the team''s qualifier and one of its entrants');
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'golf_qualifier_exemptions' and policyname = 'golf_qualifier_exemptions_update')
    like '%golf_qualifiers%golf_qualifier_entries%',
  'an update cannot move an exemption to another team''s qualifier or a non-entrant');
select col_not_null('public', 'golf_qualifier_exemptions', 'reason', 'an exemption carries its reason');
select col_is_pk('public', 'golf_qualifier_exemptions', array['qualifier_id', 'player_id'], 'one exemption a player a qualifier');
select ok(not has_table_privilege('anon', 'public.golf_qualifier_exemptions', 'SELECT'), 'anon cannot read exemptions');

select * from finish();
rollback;
