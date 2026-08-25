BEGIN;

SELECT plan(9);

SELECT is(
  (SELECT p.proname
   FROM pg_trigger t
   JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.golf_qualifier_entries'::regclass
     AND t.tgname = 'golf_qualifier_entries_prevent_active_round_stranding'),
  'prevent_qualifier_entry_active_round_stranding',
  'qualifier-entry deletes use a row-shape-safe active-round guard'
);

SELECT is(
  (SELECT p.proname
   FROM pg_trigger t
   JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.golf_qualifiers'::regclass
     AND t.tgname = 'golf_qualifiers_prevent_active_round_stranding'),
  'prevent_qualifier_active_round_stranding',
  'qualifier deletes use a row-shape-safe active-round guard'
);

SELECT is(
  (SELECT p.proname
   FROM pg_trigger t
   JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.golf_team_members'::regclass
     AND t.tgname = 'golf_team_members_prevent_active_round_stranding'),
  'prevent_team_member_active_round_stranding',
  'team-member deletes use a row-shape-safe active-round guard'
);

SELECT is(
  (SELECT p.proname
   FROM pg_trigger t
   JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.golf_teams'::regclass
     AND t.tgname = 'golf_teams_prevent_active_round_stranding'),
  'prevent_team_active_round_stranding',
  'team deletes use a row-shape-safe active-round guard'
);

SELECT ok(
  position('old.qualifier_id' IN pg_get_functiondef('helm_private.prevent_team_member_active_round_stranding()'::regprocedure)) = 0,
  'team-member guard cannot reference qualifier-only OLD fields'
);

SELECT ok(
  position('old.player_id' IN pg_get_functiondef('helm_private.prevent_qualifier_active_round_stranding()'::regprocedure)) = 0,
  'qualifier guard cannot reference entry-only OLD fields'
);

SELECT ok(
  position('old.team_id' IN pg_get_functiondef('helm_private.prevent_team_active_round_stranding()'::regprocedure)) = 0,
  'team guard cannot reference member-only OLD fields'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgname LIKE '%prevent_active_round_stranding%'
      AND p.proname = 'prevent_active_round_stranding'
  ),
  'no live trigger uses the unsafe polymorphic guard'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'helm_private'
      AND p.proname = 'prevent_active_round_stranding'
  ),
  'unsafe polymorphic guard is removed after triggers are repointed'
);

SELECT * FROM finish();

ROLLBACK;
