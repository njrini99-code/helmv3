-- F-05 (launch readiness): a B team in a tournament. The squad columns exist with A as the default, a B entry can't be
-- in the lineup, the slot index is per squad, both replaced functions stay security invoker with anon refused.
begin;

select plan(8);

select has_column('public', 'golf_tournament_entries', 'squad', 'entries carry a squad');
select has_column('public', 'golf_tournament_round_lineups', 'squad', 'round lineups carry a squad');
select col_default_is('public', 'golf_tournament_entries', 'squad', 'A'::text, 'every entry is the A squad unless saved as B');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'golf_tournament_entries_squad_slot_role') like '%''B''%lineup%',
  'a B entry is never in the lineup, so no team score reads it');
select ok(to_regclass('public.golf_tournament_entries_squad_slot_uq') is not null and to_regclass('public.golf_tournament_entries_slot_uq') is null,
  'a slot is one player within a squad');
select ok(not (select prosecdef from pg_proc where oid = 'public.golf_tournament_set_entries(uuid, jsonb, integer)'::regprocedure),
  'set_entries stays security invoker (RLS and the coach check decide)');
select ok(not has_function_privilege('anon', 'public.golf_tournament_set_entries(uuid, jsonb, integer)', 'EXECUTE'), 'anon cannot save entries');
select ok(not has_function_privilege('anon', 'public.golf_tournament_lock_lineup(uuid)', 'EXECUTE'), 'anon cannot lock a lineup');

select * from finish();
rollback;
