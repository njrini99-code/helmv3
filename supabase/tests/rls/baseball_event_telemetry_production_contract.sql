BEGIN;

-- Regression contract for the production tables that predated the rich
-- Baseball event migration. These columns are selected by CoachHelm and the
-- pitcher-workload view; their absence makes PostgREST reject the whole read.
SELECT plan(8);

SELECT has_column('public', 'baseball_pitch_events', 'player_id',
  'legacy player identity remains available to administrative readers');
SELECT has_column('public', 'baseball_pitch_events', 'batter_id',
  'pitch event reads can resolve batter-side identity');
SELECT has_column('public', 'baseball_pitch_events', 'pitch_type_classified',
  'pitch event reads can use normalized pitch type');
SELECT has_column('public', 'baseball_pitch_events', 'is_called_strike',
  'pitch event reads can use normalized called-strike state');
SELECT has_column('public', 'baseball_pitch_events', 'count_state',
  'pitch event reads can expose count state when supplied by an importer');
SELECT has_column('public', 'baseball_workload_events', 'count',
  'workload overlay can read a normalized pitch/throw count');
SELECT has_column('public', 'baseball_workload_events', 'high_intent_count',
  'workload overlay can read high-intent throws when supplied by an importer');

SELECT col_is_null('public', 'baseball_pitch_events', 'batter_id',
  'batter identity stays nullable because legacy player_id has ambiguous role semantics');

SELECT * FROM finish();

ROLLBACK;
