-- Strokes-gained recalculation is an explicit protected post-submit write.
-- It must be able to persist derived SG fields for a completed round without
-- weakening the general completed-history guard.

BEGIN;
\ir _helpers.sql

SELECT plan(1);

INSERT INTO public.golf_players (id, first_name)
VALUES ('00000000-0000-0000-0000-00000000aa01', 'Strokes')
ON CONFLICT DO NOTHING;

INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
VALUES (
  '00000000-0000-0000-0000-00000000aa02',
  '00000000-0000-0000-0000-00000000aa01',
  CURRENT_DATE,
  'in_progress',
  'practice'
)
ON CONFLICT DO NOTHING;

SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
UPDATE public.golf_rounds
SET status = 'completed'
WHERE id = '00000000-0000-0000-0000-00000000aa02';
SELECT set_config('helm.golf_lifecycle_write', '', true);

SELECT lives_ok(
  $$SELECT public.recalculate_round_strokes_gained('00000000-0000-0000-0000-00000000aa02')$$,
  'the protected SG recalculation can update derived fields after round completion'
);

SELECT * FROM finish();
ROLLBACK;
