-- F-04 (launch readiness): a qualifier's tie rule is its team's. RLS is on, a coach writes and a player reads through
-- the team helpers, the qualifier must be the same team's, only the two rules are stored, and anon holds nothing.
begin;

select plan(8);

select has_table('public', 'golf_qualifier_rules', 'the qualifier rules table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.golf_qualifier_rules'::regclass), 'RLS is on for golf_qualifier_rules');
select policies_are('public', 'golf_qualifier_rules',
  array['golf_qualifier_rules_select', 'golf_qualifier_rules_insert', 'golf_qualifier_rules_update', 'golf_qualifier_rules_delete'],
  'rules: read, insert, update and delete');
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'golf_qualifier_rules' and policyname = 'golf_qualifier_rules_select')
    like '%is_golf_team_coach(team_id)%is_golf_team_player(team_id)%',
  'rules are read by the team''s coaches and active players only');
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'golf_qualifier_rules' and policyname = 'golf_qualifier_rules_insert')
    like '%is_golf_team_coach(team_id)%golf_qualifiers%team_id%',
  'only a coach of the team writes a rule, and the qualifier must be the same team''s');
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'golf_qualifier_rules' and policyname = 'golf_qualifier_rules_update')
    like '%golf_qualifiers%team_id%',
  'an update cannot move a rule to another team''s qualifier');
select col_default_is('public', 'golf_qualifier_rules', 'tie_rule', 'coach'::text, 'a row with no rule given ranks by coach, the rule before F-04');
select ok(not has_table_privilege('anon', 'public.golf_qualifier_rules', 'SELECT'), 'anon cannot read qualifier rules');

select * from finish();
rollback;
