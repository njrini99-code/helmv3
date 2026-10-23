-- A round save or submit writes the round's totals once, not once per hole row.
--
-- Both atomic round RPCs replace the whole hole snapshot. Before
-- 20261023152000_round_save_one_totals_write.sql the per-row trigger
-- golf_holes_recompute_round_totals rewrote golf_rounds after every hole
-- DELETE and INSERT, so a 3-hole re-save took 1 + 3 + 3 = 7 golf_rounds
-- updates. The RPCs now defer the trigger and recompute once. These are real
-- RPC calls as an authenticated player; the totals must still match the holes,
-- and a hole write outside the RPCs must still recompute on its own.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

DO $$
DECLARE
  v_user_id uuid := '00000000-0000-0000-0000-00000000b901';
  v_player_id uuid := '00000000-0000-0000-0000-00000000b902';
BEGIN
  INSERT INTO auth.users (id, email, role)
  VALUES (v_user_id, 'one-totals-write-player@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_user_id, 'one-totals-write-player@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name)
  VALUES (v_player_id, v_user_id, 'Totals')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
  VALUES ('00000000-0000-0000-0000-00000000b903', v_player_id, CURRENT_DATE, 'in_progress', 'practice')
  ON CONFLICT DO NOTHING;
END $$;

-- golf_rounds row updates made so far in this transaction.
CREATE TEMP TABLE round_update_marks (label text PRIMARY KEY, n bigint NOT NULL);
GRANT ALL ON round_update_marks TO authenticated;

CREATE FUNCTION pg_temp.mark_round_updates(p_label text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO round_update_marks
  SELECT p_label, COALESCE(n_tup_upd, 0)
  FROM pg_stat_xact_user_tables
  WHERE schemaname = 'public' AND relname = 'golf_rounds'
  UNION ALL
  SELECT p_label, 0
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_stat_xact_user_tables
    WHERE schemaname = 'public' AND relname = 'golf_rounds'
  )
  LIMIT 1;
$$;

CREATE FUNCTION pg_temp.round_updates_between(p_from text, p_to text) RETURNS bigint
LANGUAGE sql AS $$
  SELECT (SELECT n FROM round_update_marks WHERE label = p_to)
       - (SELECT n FROM round_update_marks WHERE label = p_from);
$$;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000b901", "role": "authenticated"}';

-- First save: three holes, one shot each.
SELECT pg_temp.mark_round_updates('save1_before');

SELECT is(
  public.save_partial_round_atomic(
    '00000000-0000-0000-0000-00000000b903',
    '{"course_name":"One Totals Write","holes_played":3,"current_hole":3}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2,"fairway_hit":true},
      {"hole_number":2,"par":3,"score":3,"putts":2},
      {"hole_number":3,"par":5,"score":6,"putts":3,"fairway_hit":false}]'::jsonb,
    '[{"hole_number":1,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]},
      {"hole_number":2,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":160,"distance_unit_before":"yards","result":"green"}]},
      {"hole_number":3,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":520,"distance_unit_before":"yards","result":"rough"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    NULL
  )->>'success',
  'true',
  'first partial save succeeds'
);

SELECT pg_temp.mark_round_updates('save1_after');

SELECT cmp_ok(
  pg_temp.round_updates_between('save1_before', 'save1_after'),
  '<=',
  2::bigint,
  'first save writes golf_rounds at most twice (was 1 + one per inserted hole)'
);

SELECT is(
  (SELECT total_putts::int FROM public.golf_rounds
   WHERE id = '00000000-0000-0000-0000-00000000b903'),
  7,
  'first save totals putts across the saved holes'
);

-- Second save: same holes, hole 3 changed. The snapshot DELETE and re-INSERT
-- used to cost 1 + 3 + 3 = 7 golf_rounds writes.
SELECT pg_temp.mark_round_updates('save2_before');

SELECT is(
  public.save_partial_round_atomic(
    '00000000-0000-0000-0000-00000000b903',
    '{"course_name":"One Totals Write","holes_played":3,"current_hole":3}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2,"fairway_hit":true},
      {"hole_number":2,"par":3,"score":3,"putts":2},
      {"hole_number":3,"par":5,"score":5,"putts":1,"fairway_hit":true}]'::jsonb,
    '[{"hole_number":1,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]},
      {"hole_number":2,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":160,"distance_unit_before":"yards","result":"green"}]},
      {"hole_number":3,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":520,"distance_unit_before":"yards","result":"fairway"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    NULL
  )->>'success',
  'true',
  'second partial save succeeds'
);

SELECT pg_temp.mark_round_updates('save2_after');

SELECT cmp_ok(
  pg_temp.round_updates_between('save2_before', 'save2_after'),
  '<=',
  2::bigint,
  're-save writes golf_rounds at most twice (was 7 for three holes)'
);

SELECT is(
  (SELECT ARRAY[total_putts, total_fairways_hit, total_fairways, total_gir_possible]::int[]
   FROM public.golf_rounds
   WHERE id = '00000000-0000-0000-0000-00000000b903'),
  ARRAY[5, 2, 2, 3],
  're-save totals match the new holes'
);

SELECT is(
  current_setting('helm.defer_round_totals', true),
  'off',
  'the RPC leaves hole triggers undeferred for the rest of the transaction'
);

-- Any other hole writer (a coach edit, a repair script) still recomputes per
-- row. This runs while the round is in progress, because a completed round's
-- holes can only change through the RPCs.
RESET role;
RESET request.jwt.claims;

UPDATE public.golf_holes
SET putts = 4
WHERE round_id = '00000000-0000-0000-0000-00000000b903'
  AND hole_number = 3;

SELECT is(
  (SELECT total_putts::int FROM public.golf_rounds
   WHERE id = '00000000-0000-0000-0000-00000000b903'),
  8,
  'a direct hole edit outside the RPCs still updates the round totals'
);

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-00000000b901", "role": "authenticated"}';

-- Submit: the round is completed before the holes are rewritten, so each
-- per-row write also used to rerun the stats cache. The submit also writes
-- the round's strokes-gained totals once at the end, as it always has.
SELECT pg_temp.mark_round_updates('submit_before');

SELECT is(
  public.submit_round_atomic(
    '00000000-0000-0000-0000-00000000b903',
    '{"course_name":"One Totals Write","holes_played":3,"total_score":12,"total_putts":5}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2,"fairway_hit":true},
      {"hole_number":2,"par":3,"score":3,"putts":2},
      {"hole_number":3,"par":5,"score":5,"putts":1,"fairway_hit":true}]'::jsonb,
    '[{"hole_number":1,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]},
      {"hole_number":2,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":160,"distance_unit_before":"yards","result":"green"}]},
      {"hole_number":3,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":520,"distance_unit_before":"yards","result":"fairway"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )->>'success',
  'true',
  'submit succeeds'
);

SELECT pg_temp.mark_round_updates('submit_after');

SELECT cmp_ok(
  pg_temp.round_updates_between('submit_before', 'submit_after'),
  '<=',
  3::bigint,
  'submit writes golf_rounds at most three times (was 8 for three holes)'
);

SELECT is(
  (SELECT ARRAY[total_putts, total_gir_possible]::int[]
   FROM public.golf_rounds
   WHERE id = '00000000-0000-0000-0000-00000000b903'),
  ARRAY[5, 3],
  'submitted round totals match its holes, undoing the direct edit'
);

RESET role;
RESET request.jwt.claims;

SELECT ok(
  position('helm.defer_round_totals' IN
    pg_get_functiondef('public.golf_holes_recompute_round_totals_fn()'::regprocedure)) > 0,
  'the hole totals trigger honours the deferral'
);

SELECT * FROM finish();
ROLLBACK;
