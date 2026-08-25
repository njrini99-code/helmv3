BEGIN;

SELECT plan(2);

SELECT ok(
  to_regclass('public.golf_rounds_qualifier_player_round_number_uq') IS NOT NULL,
  'each non-abandoned qualifier round has a durable unique slot index'
);

SELECT ok(
  COALESCE((
    SELECT indexdef LIKE '%(qualifier_id, player_id, qualifier_round_number)%'
       AND indexdef LIKE '%status IS DISTINCT FROM ''abandoned''%'
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'golf_rounds'
      AND indexname = 'golf_rounds_qualifier_player_round_number_uq'
  ), false),
  'the unique slot index protects one active or completed slot per player, qualifier, and round number'
);

SELECT * FROM finish();

ROLLBACK;
