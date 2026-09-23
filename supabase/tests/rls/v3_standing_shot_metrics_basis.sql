-- pgTAP contracts for the Package 7B / addendum A2 migration
-- (20260922120000_v3_standing_shot_metrics_all_shot_proximity.sql).
--
-- Asserts the additive golf_player_standing columns exist with the right
-- shape and the basis CHECK constraint rejects a value outside
-- ('on_green', 'all_shot'). Function-output correctness (all-shot averages,
-- the lay-up exclusion count, floors) needs fixture rounds/shots and is not
-- covered here — see the migration's read-only production sizing notes for
-- the values this was checked against instead.

BEGIN;
\ir _helpers.sql

SELECT plan(5);

-- ============================================================================
-- Additive columns exist, correct type.
-- ============================================================================

SELECT has_column(
  'public', 'golf_player_standing', 'basis',
  'golf_player_standing.basis exists'
);

SELECT col_type_is(
  'public', 'golf_player_standing', 'basis', 'text',
  'golf_player_standing.basis is text'
);

SELECT has_column(
  'public', 'golf_player_standing', 'on_green_proximity_feet',
  'golf_player_standing.on_green_proximity_feet exists'
);

SELECT has_column(
  'public', 'golf_player_standing', 'layup_excluded_n',
  'golf_player_standing.layup_excluded_n exists'
);

-- ============================================================================
-- basis CHECK constraint: only NULL / 'on_green' / 'all_shot' are valid.
-- Asserted against the catalog definition rather than a live INSERT, since a
-- real row also needs valid player_id/metric_id FKs this file has no
-- business fabricating.
-- ============================================================================

SELECT ok(
  (
    SELECT pg_get_constraintdef(oid) ILIKE '%basis%on_green%all_shot%'
    FROM pg_constraint
    WHERE conname = 'golf_player_standing_basis_check'
      AND conrelid = 'public.golf_player_standing'::regclass
  ),
  'golf_player_standing_basis_check restricts basis to on_green/all_shot'
);

SELECT * FROM finish();
ROLLBACK;
