-- pgTAP contracts for 20260929200000_golf_qualifier_db_hardening.sql (D-35).
--
-- The Clubhouse security review's cases, as catalog contracts (this suite has
-- no seeded coach or player fixtures; see _helpers.sql):
--   1. a team player cannot read coach_reasoning once the squad is confirmed;
--      coaches read it through a coach-gated function;
--   3. a coach cannot enter (or re-point an entry to) a player who isn't an
--      active member of the qualifier's team;
--   4. a coach of another team cannot insert, update or delete the entries;
--   5. removing an entry whose player has an unfinished round (in progress,
--      draft, anything but completed) is refused even when the caller's RLS
--      can't see that round.
-- Plus the L4 hardening: no anon grants on the qualifier tables, and pg_temp
-- on the is_team_* helpers' search_path.

BEGIN;
\ir _helpers.sql

SELECT plan(22);

-- Case 1 -------------------------------------------------------------------

SELECT ok(
  NOT has_column_privilege('authenticated', 'public.golf_qualifier_selections', 'coach_reasoning', 'SELECT'),
  'authenticated cannot select golf_qualifier_selections.coach_reasoning'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.golf_qualifier_selections', 'player_id', 'SELECT')
    AND has_column_privilege('authenticated', 'public.golf_qualifier_selections', 'selection_type', 'SELECT')
    AND has_column_privilege('authenticated', 'public.golf_qualifier_selections', 'qualifier_id', 'SELECT'),
  'authenticated still selects the squad columns (player_id, selection_type, qualifier_id)'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.golf_qualifier_selections', 'INSERT')
    AND has_table_privilege('authenticated', 'public.golf_qualifier_selections', 'UPDATE')
    AND has_table_privilege('authenticated', 'public.golf_qualifier_selections', 'DELETE'),
  'coaches keep their writes on golf_qualifier_selections (RLS still gates them)'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.golf_qualifier_selection_reasons(uuid)'::regprocedure),
  'golf_qualifier_selection_reasons is SECURITY DEFINER'
);
SELECT ok(
  position('is_team_coach' IN pg_get_functiondef('public.golf_qualifier_selection_reasons(uuid)'::regprocedure)) > 0,
  'golf_qualifier_selection_reasons answers only a coach of the qualifier''s team'
);
SELECT ok(
  (SELECT proconfig::text FROM pg_proc WHERE oid = 'public.golf_qualifier_selection_reasons(uuid)'::regprocedure) LIKE '%pg_temp%',
  'golf_qualifier_selection_reasons has a fixed search_path'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.golf_qualifier_selection_reasons(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.golf_qualifier_selection_reasons(uuid)', 'EXECUTE'),
  'signed-in users can call golf_qualifier_selection_reasons; anon cannot'
);

-- Case 3 -------------------------------------------------------------------

SELECT ok(
  tests.policy_with_check_contains('public', 'golf_qualifier_entries', 'golf_qualifier_entries_insert_coach', 'golf_team_members'),
  'entry insert requires the player to be on the qualifier''s team'
);
SELECT ok(
  tests.policy_with_check_contains('public', 'golf_qualifier_entries', 'golf_qualifier_entries_insert_coach', 'active'),
  'entry insert requires an active member'
);
SELECT ok(
  tests.policy_with_check_contains('public', 'golf_qualifier_entries', 'golf_qualifier_entries_update_coach', 'golf_team_members'),
  'entry update cannot re-point player_id to someone off the team'
);

-- Case 4 -------------------------------------------------------------------

SELECT ok(
  tests.policy_with_check_contains('public', 'golf_qualifier_entries', 'golf_qualifier_entries_insert_coach', 'is_golf_team_coach'),
  'entry insert still requires a coach of the qualifier''s team'
);
SELECT ok(
  (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_qualifier_entries'
     AND policyname = 'golf_qualifier_entries_update_coach') LIKE '%is_golf_team_coach%',
  'entry update applies only to a coach of the qualifier''s team'
);
SELECT ok(
  (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'golf_qualifier_entries'
     AND policyname = 'golf_qualifier_entries_delete_coach') LIKE '%is_golf_team_coach%',
  'entry delete applies only to a coach of the qualifier''s team'
);

-- Case 5 -------------------------------------------------------------------

SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'helm_private.prevent_qualifier_entry_active_round_stranding()'::regprocedure),
  'the remove-with-round guard runs as its owner, so rounds hidden from the caller count'
);
SELECT ok(
  (SELECT proconfig::text FROM pg_proc WHERE oid = 'helm_private.prevent_qualifier_entry_active_round_stranding()'::regprocedure) LIKE '%pg_temp%',
  'the remove-with-round guard has a fixed search_path'
);
SELECT ok(
  position('IS DISTINCT FROM ''completed''' IN pg_get_functiondef('helm_private.prevent_qualifier_entry_active_round_stranding()'::regprocedure)) > 0,
  'the remove-with-round guard refuses any unfinished round, draft included'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'helm_private.prevent_qualifier_entry_active_round_stranding()', 'EXECUTE'),
  'the guard cannot be called directly'
);
SELECT is(
  (SELECT p.proname::text
   FROM pg_trigger t
   JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.golf_qualifier_entries'::regclass
     AND t.tgname = 'golf_qualifier_entries_prevent_active_round_stranding'),
  'prevent_qualifier_entry_active_round_stranding',
  'entry deletes still run the guard'
);

-- L4 -----------------------------------------------------------------------

SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_qualifiers', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.golf_qualifiers', 'INSERT'),
  'anon has no grants on golf_qualifiers'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_qualifier_entries', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.golf_qualifier_entries', 'DELETE'),
  'anon has no grants on golf_qualifier_entries'
);
SELECT ok(
  NOT has_any_column_privilege('anon', 'public.golf_qualifier_selections', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.golf_qualifier_selections', 'INSERT'),
  'anon has no grants on golf_qualifier_selections'
);
SELECT ok(
  (SELECT proconfig::text FROM pg_proc WHERE oid = 'public.is_team_coach(uuid)'::regprocedure) LIKE '%pg_temp%'
    AND (SELECT proconfig::text FROM pg_proc WHERE oid = 'public.is_team_player(uuid)'::regprocedure) LIKE '%pg_temp%',
  'is_team_coach and is_team_player pin pg_temp on their search_path'
);

SELECT * FROM finish();
ROLLBACK;
