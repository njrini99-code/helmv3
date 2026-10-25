-- pgTAP for the held, conditional 20261025060000_golf_rounds_player_course_completed_idx.sql (P-7 plan 8.7, 8.8).
-- Runs only where that migration was applied (the local stack applies every file); it pins the partial predicate so a
-- rewrite cannot drop the completed or the is_test filter.

BEGIN;

SELECT plan(3);

SELECT has_index('public', 'golf_rounds', 'idx_golf_rounds_player_course_completed', 'the P-7 course index exists');

SELECT ok(
  (SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_golf_rounds_player_course_completed')
    LIKE '%WHERE%status%completed%is_test%',
  'the index is partial on completed, non-test rounds'
);

SELECT ok(
  (SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_golf_rounds_player_course_completed')
    LIKE '%(player_id, course_id, round_date DESC)%',
  'the index leads with the player, then the course, newest first'
);

SELECT * FROM finish();
ROLLBACK;
