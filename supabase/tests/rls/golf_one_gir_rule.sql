-- One GIR rule (SC-05) and no up-and-down on a green hit in regulation (SC-13),
-- 20261115230000_golf_one_gir_rule.sql.
--
-- public.golf_hole_gir() is the rule: from the hole's shots when they record
-- the whole hole (numbered 1 to the score), else from score minus putts, NULL
-- when neither can tell. The hole's flag (golf_holes_set_gir, and the shot
-- trigger when the shots arrive after the hole) and the round totals
-- (recompute_golf_round_totals) both read it, so they cannot disagree. The
-- backfill brings stored flags onto the rule.

BEGIN;
\ir _helpers.sql

SELECT plan(21);

-- The rule ---------------------------------------------------------------------

SELECT is(public.golf_hole_gir(4, 4, 2, NULL), true, 'scorecard: par 4, 4 strokes, 2 putts is a green in regulation');
SELECT is(public.golf_hole_gir(4, 5, 2, NULL), false, 'scorecard: par 4, 5 strokes, 2 putts is not');
SELECT is(public.golf_hole_gir(4, 4, 2, 3), false, 'the shots win: on the green with the third stroke is not a GIR on a par 4, whatever the putts say');
SELECT is(public.golf_hole_gir(5, 4, NULL, 3), true, 'the shots read a hole with no putt count: on in 3 on a par 5');
SELECT is(public.golf_hole_gir(4, 4, NULL, NULL), NULL::boolean, 'no shots and no putt count: unknown, never a made-up miss');
SELECT is(public.golf_hole_gir(4, 0, 0, NULL), NULL::boolean, 'an unscored hole (0) is unknown');
SELECT is(public.golf_hole_gir(4, 2, 0, 2), true, 'a holed second shot on a par 4 is a green in regulation');

-- Fixtures: one player, two rounds in progress, one completed --------------------

INSERT INTO auth.users (id, email, role) VALUES
  ('00000000-0000-0000-5c50-000000000001', 'one-gir@helm.test', 'authenticated')
ON CONFLICT DO NOTHING;
INSERT INTO public.users (id, email, role) VALUES
  ('00000000-0000-0000-5c50-000000000001', 'one-gir@helm.test', 'player')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_players (id, user_id, first_name) VALUES
  ('00000000-0000-0000-5c51-000000000001', '00000000-0000-0000-5c50-000000000001', 'One GIR')
ON CONFLICT DO NOTHING;
INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type, holes_played) VALUES
  ('00000000-0000-0000-5c52-00000000000a', '00000000-0000-0000-5c51-000000000001', CURRENT_DATE, 'in_progress', 'practice', 2),
  ('00000000-0000-0000-5c52-00000000000c', '00000000-0000-0000-5c51-000000000001', CURRENT_DATE, 'in_progress', 'practice', 1);

-- Round A, written the way submit_round_atomic writes it: the holes first, then the shots.
--   Hole 1, par 4: tee to the fairway, approach to the fringe, a putter from the
--   fringe that the card counted as a putt (putts 2), one putt holed. Score minus
--   putts says GIR; the shots say the green was reached with the third stroke.
--   Hole 2, par 4: a water penalty never logged as a shot (4 shot rows, score 5),
--   so the shots do not record the whole hole and the card decides: 5 - 2 = 3, no GIR.
SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-5c50-000000000001', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par, score, putts, up_and_down) VALUES
  ('00000000-0000-0000-5c53-0000000000a1', '00000000-0000-0000-5c52-00000000000a', 1, 4, 4, 2, NULL),
  ('00000000-0000-0000-5c53-0000000000a2', '00000000-0000-0000-5c52-00000000000a', 2, 4, 5, 2, NULL);
SELECT set_config('request.jwt.claims', '', true);

SELECT is((SELECT gir FROM public.golf_holes WHERE id = '00000000-0000-0000-5c53-0000000000a1'), true, 'before its shots arrive, hole 1 reads the card: GIR');
SELECT is((SELECT total_gir FROM public.golf_rounds WHERE id = '00000000-0000-0000-5c52-00000000000a'), 1, 'and the round counts it');

INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, result, is_penalty) VALUES
  ('00000000-0000-0000-5c54-0000000000a1', '00000000-0000-0000-5c52-00000000000a', '00000000-0000-0000-5c53-0000000000a1', 1, 1, 'tee', 'tee', 'fairway', FALSE),
  ('00000000-0000-0000-5c54-0000000000a2', '00000000-0000-0000-5c52-00000000000a', '00000000-0000-0000-5c53-0000000000a1', 1, 2, 'approach', 'fairway', 'other', FALSE),
  ('00000000-0000-0000-5c54-0000000000a3', '00000000-0000-0000-5c52-00000000000a', '00000000-0000-0000-5c53-0000000000a1', 1, 3, 'putting', 'other', 'green', FALSE),
  ('00000000-0000-0000-5c54-0000000000a4', '00000000-0000-0000-5c52-00000000000a', '00000000-0000-0000-5c53-0000000000a1', 1, 4, 'putting', 'green', 'hole', FALSE),
  ('00000000-0000-0000-5c54-0000000000b1', '00000000-0000-0000-5c52-00000000000a', '00000000-0000-0000-5c53-0000000000a2', 2, 1, 'tee', 'tee', 'fairway', FALSE),
  ('00000000-0000-0000-5c54-0000000000b2', '00000000-0000-0000-5c52-00000000000a', '00000000-0000-0000-5c53-0000000000a2', 2, 2, 'approach', 'fairway', 'green', FALSE),
  ('00000000-0000-0000-5c54-0000000000b3', '00000000-0000-0000-5c52-00000000000a', '00000000-0000-0000-5c53-0000000000a2', 2, 3, 'putting', 'green', 'green', FALSE),
  ('00000000-0000-0000-5c54-0000000000b4', '00000000-0000-0000-5c52-00000000000a', '00000000-0000-0000-5c53-0000000000a2', 2, 4, 'putting', 'green', 'hole', FALSE);

SELECT is((SELECT gir FROM public.golf_holes WHERE id = '00000000-0000-0000-5c53-0000000000a1'), false, 'SC-05: once the shots arrive, hole 1 follows them: on in 3, no GIR');
SELECT is((SELECT gir FROM public.golf_holes WHERE id = '00000000-0000-0000-5c53-0000000000a2'), false, 'hole 2: the unlogged penalty leaves the shots short of the score, so the card decides: no GIR');
SELECT is((SELECT total_gir FROM public.golf_rounds WHERE id = '00000000-0000-0000-5c52-00000000000a'), 0, 'the round total follows the holes: 0 greens');
SELECT is((SELECT total_gir_possible FROM public.golf_rounds WHERE id = '00000000-0000-0000-5c52-00000000000a'), 2, 'of 2');
SELECT is(
  (SELECT total_gir FROM public.golf_rounds WHERE id = '00000000-0000-0000-5c52-00000000000a'),
  (SELECT count(*)::int FROM public.golf_holes WHERE round_id = '00000000-0000-0000-5c52-00000000000a' AND gir),
  'one rule: the round total equals the count of the holes'' own flags'
);

-- Deleting a shot takes the hole back to the card.
DELETE FROM public.golf_shots WHERE id = '00000000-0000-0000-5c54-0000000000a2';
SELECT is((SELECT gir FROM public.golf_holes WHERE id = '00000000-0000-0000-5c53-0000000000a1'), true, 'with a shot deleted the shots no longer record the hole, and the card decides again');

-- SC-13: an up-and-down is never stored on a green hit in regulation.
UPDATE public.golf_holes SET up_and_down = TRUE WHERE id = '00000000-0000-0000-5c53-0000000000a1';
SELECT is((SELECT up_and_down FROM public.golf_holes WHERE id = '00000000-0000-0000-5c53-0000000000a1'), NULL::boolean, 'SC-13: an up-and-down written on a GIR hole is cleared');
UPDATE public.golf_holes SET up_and_down = TRUE WHERE id = '00000000-0000-0000-5c53-0000000000a2';
SELECT is((SELECT up_and_down FROM public.golf_holes WHERE id = '00000000-0000-0000-5c53-0000000000a2'), TRUE, 'and kept on a missed green');

-- The backfill: a completed round written before this file ---------------------
-- Hole 1, par 3: on the green with the tee shot, two putts (a GIR), stored as a
-- miss with an up-and-down, the shape SC-13 found on 4 demo holes.

SELECT set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-5c50-000000000001', 'role', 'authenticated')::text, true);
INSERT INTO public.golf_holes (id, round_id, hole_number, par, score, putts) VALUES
  ('00000000-0000-0000-5c53-0000000000c1', '00000000-0000-0000-5c52-00000000000c', 1, 3, 3, 2);
SELECT set_config('request.jwt.claims', '', true);
INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, lie_before, result, is_penalty) VALUES
  ('00000000-0000-0000-5c54-0000000000c1', '00000000-0000-0000-5c52-00000000000c', '00000000-0000-0000-5c53-0000000000c1', 1, 1, 'tee', 'tee', 'green', FALSE),
  ('00000000-0000-0000-5c54-0000000000c2', '00000000-0000-0000-5c52-00000000000c', '00000000-0000-0000-5c53-0000000000c1', 1, 2, 'putting', 'green', 'green', FALSE),
  ('00000000-0000-0000-5c54-0000000000c3', '00000000-0000-0000-5c52-00000000000c', '00000000-0000-0000-5c53-0000000000c1', 1, 3, 'putting', 'green', 'hole', FALSE);

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds SET status = 'completed', total_score = 3, score_to_par = 0 WHERE id = '00000000-0000-0000-5c52-00000000000c';
-- The stored state before this file: the flags as an older writer left them
-- (written with the GIR trigger off, so the rule does not correct them; the
-- deferred round-live trigger fires first, as ALTER TABLE needs).
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.golf_holes DISABLE TRIGGER golf_holes_set_gir;
UPDATE public.golf_holes SET gir = FALSE, up_and_down = TRUE WHERE id = '00000000-0000-0000-5c53-0000000000c1';
ALTER TABLE public.golf_holes ENABLE TRIGGER golf_holes_set_gir;
UPDATE public.golf_rounds SET total_gir = 0 WHERE id = '00000000-0000-0000-5c52-00000000000c';
SELECT set_config('helm.golf_lifecycle_write', '', true);

SELECT is((SELECT greens_hit FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5c52-00000000000c'), 0, 'before the backfill the cache reads the stale miss');

SELECT ok(helm_private.golf_backfill_one_gir_rule() >= 1, 'the backfill changes the stale hole');
SELECT is(
  (SELECT row(gir, up_and_down)::text FROM public.golf_holes WHERE id = '00000000-0000-0000-5c53-0000000000c1'),
  row(TRUE, NULL::boolean)::text,
  'the hole is a GIR with no up-and-down'
);
SELECT is(
  (SELECT row(greens_hit, greens_total, scramble_attempts)::text FROM public.golf_round_stats_cache WHERE round_id = '00000000-0000-0000-5c52-00000000000c'),
  row(1, 1, 0)::text,
  'and the round''s cache follows: 1 green of 1, no scramble attempt'
);

SELECT * FROM finish();
ROLLBACK;
