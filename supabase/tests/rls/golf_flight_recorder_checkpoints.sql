-- helm_private.trace_checkpoint / trace_exception_checkpoint now persist
-- into helm_debug.trace_steps, not only RAISE LOG. These are real RPC calls
-- as an authenticated player, not source-text assertions -- see
-- golf_flight_recorder.sql for the schema/privilege contract this extends.
--
-- NOTE on transaction-local GUCs: helm_private.configure_trace_context only
-- ever SETS helm.trace_id/trace_enabled when the CURRENT call asks for
-- tracing; when it does not, it returns without clearing them, so a prior
-- traced call's GUCs would otherwise leak into a later untraced call within
-- this same test transaction (never happens in production, where each
-- request is its own transaction). The "tracing off" test below resets
-- helm.trace_enabled explicitly for exactly that reason.

BEGIN;
\ir _helpers.sql

SELECT plan(20);

DO $$
DECLARE
  v_user_id uuid := '00000000-0000-0000-0000-0000000fc001';
  v_player_id uuid := '00000000-0000-0000-0000-0000000fc002';
BEGIN
  INSERT INTO auth.users (id, email, role)
  VALUES (v_user_id, 'flight-recorder-checkpoint-player@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role)
  VALUES (v_user_id, 'flight-recorder-checkpoint-player@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name)
  VALUES (v_player_id, v_user_id, 'Checkpoint')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
  VALUES
    ('00000000-0000-0000-0000-0000000fc101', v_player_id, CURRENT_DATE, 'in_progress', 'practice'),
    ('00000000-0000-0000-0000-0000000fc102', v_player_id, CURRENT_DATE, 'in_progress', 'practice'),
    ('00000000-0000-0000-0000-0000000fc103', v_player_id, CURRENT_DATE, 'in_progress', 'practice'),
    ('00000000-0000-0000-0000-0000000fc104', v_player_id, CURRENT_DATE, 'in_progress', 'practice')
  ON CONFLICT DO NOTHING;

  INSERT INTO helm_debug.trace_runs (trace_id, workflow, environment)
  VALUES
    ('00000000-0000-0000-0000-0000000fc201', 'golf.round.submit', 'test'),
    ('00000000-0000-0000-0000-0000000fc202', 'golf.round.autosave', 'test'),
    ('00000000-0000-0000-0000-0000000fc203', 'golf.round.autosave', 'test'),
    ('00000000-0000-0000-0000-0000000fc204', 'golf.round.submit', 'test')
  ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- A: submit_round_atomic with a valid _helm_trace
--
-- The RPC call runs as `authenticated` (auth.uid() must resolve to the
-- fixture player). Every assertion against helm_debug -- a schema revoked
-- from public/anon/authenticated entirely -- runs back on the default
-- (superuser) role, which is why role is set and reset around each call.
-- ---------------------------------------------------------------------------

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000fc001", "role": "authenticated"}';

SELECT is(
  public.submit_round_atomic(
    '00000000-0000-0000-0000-0000000fc101',
    '{"course_name":"Flight Recorder Checkpoint","holes_played":1,"total_score":4,"total_putts":2,"_helm_trace":{"trace_id":"00000000-0000-0000-0000-0000000fc201","enabled":true}}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2}]'::jsonb,
    '[{"hole_number":1,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )->>'success',
  'true',
  'submit_round_atomic succeeds with tracing enabled'
);

RESET role;
RESET request.jwt.claims;

SELECT ok(
  EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc201'
      AND step_key = 'db.submit_round_atomic'
      AND parent_step_key IS NULL
      AND layer = 'postgres'
      AND status = 'started'
      AND requiredness = 'best_effort'
      AND function_name = 'submit_round_atomic'
  ),
  'submit_round_atomic entry checkpoint recorded (started, no parent, own name)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc201'
      AND step_key = 'db.submit_round_atomic.update_round'
      AND parent_step_key = 'db.submit_round_atomic'
      AND layer = 'postgres'
      AND status = 'success'
      AND requiredness = 'best_effort'
      AND function_name = 'submit_round_atomic'
      AND table_name = 'golf_rounds'
  ),
  'submit_round_atomic.update_round checkpoint carries golf_rounds + parent'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc201'
      AND step_key = 'db.submit_round_atomic.insert_holes'
      AND parent_step_key = 'db.submit_round_atomic'
      AND function_name = 'submit_round_atomic'
      AND table_name = 'golf_holes'
  ),
  'submit_round_atomic.insert_holes checkpoint carries golf_holes'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc201'
      AND step_key = 'db.submit_round_atomic.insert_shots'
      AND parent_step_key = 'db.submit_round_atomic'
      AND function_name = 'submit_round_atomic'
      AND table_name = 'golf_shots'
  ),
  'submit_round_atomic.insert_shots checkpoint carries golf_shots'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc201'
      AND step_key = 'db.submit_round_atomic.recalculate_strokes_gained'
      AND parent_step_key = 'db.submit_round_atomic'
      AND function_name = 'submit_round_atomic'
      AND table_name = 'golf_rounds'
  ),
  'submit_round_atomic.recalculate_strokes_gained checkpoint carries golf_rounds'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc201'
      AND step_key = 'db.submit_round_atomic.commit'
      AND parent_step_key = 'db.submit_round_atomic'
      AND status = 'success'
      AND requiredness = 'best_effort'
  ),
  'submit_round_atomic.commit checkpoint recorded as success'
);

SELECT ok(
  (
    SELECT started_at IS NOT NULL AND started_at <= finished_at
    FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc201'
      AND step_key = 'db.submit_round_atomic.commit'
  ),
  'commit checkpoint has a non-null started_at at or before finished_at'
);

-- ---------------------------------------------------------------------------
-- B: save_partial_round_atomic with a valid _helm_trace
-- ---------------------------------------------------------------------------

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000fc001", "role": "authenticated"}';

SELECT is(
  public.save_partial_round_atomic(
    '00000000-0000-0000-0000-0000000fc102',
    '{"course_name":"Flight Recorder Checkpoint","holes_played":1,"current_hole":1,"_helm_trace":{"trace_id":"00000000-0000-0000-0000-0000000fc202","enabled":true}}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2}]'::jsonb,
    '[{"hole_number":1,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    NULL
  )->>'success',
  'true',
  'save_partial_round_atomic succeeds with tracing enabled'
);

RESET role;
RESET request.jwt.claims;

SELECT ok(
  EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc202'
      AND step_key = 'db.save_partial_round_atomic'
      AND parent_step_key IS NULL
      AND layer = 'postgres'
      AND status = 'started'
      AND function_name = 'save_partial_round_atomic'
  ),
  'save_partial_round_atomic entry checkpoint recorded (started, no parent)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc202'
      AND step_key = 'db.save_partial_round_atomic.update_round'
      AND parent_step_key = 'db.save_partial_round_atomic'
      AND function_name = 'save_partial_round_atomic'
      AND table_name = 'golf_rounds'
  ),
  'save_partial_round_atomic.update_round checkpoint carries golf_rounds'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc202'
      AND step_key = 'db.save_partial_round_atomic.insert_holes'
      AND parent_step_key = 'db.save_partial_round_atomic'
      AND table_name = 'golf_holes'
  ),
  'save_partial_round_atomic.insert_holes checkpoint carries golf_holes'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc202'
      AND step_key = 'db.save_partial_round_atomic.insert_shots'
      AND parent_step_key = 'db.save_partial_round_atomic'
      AND table_name = 'golf_shots'
  ),
  'save_partial_round_atomic.insert_shots checkpoint carries golf_shots'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc202'
      AND step_key = 'db.save_partial_round_atomic.recalculate_strokes_gained'
  ),
  'save_partial_round_atomic never claims a recalculate_strokes_gained step'
);

-- ---------------------------------------------------------------------------
-- E: tracing disabled -- nothing is written
-- ---------------------------------------------------------------------------

-- Role is already reset (default/superuser) from the end of Test B, so this
-- read is allowed.
CREATE TEMP TABLE _fc_steps_before AS
SELECT count(*)::int AS n FROM helm_debug.trace_steps;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000fc001", "role": "authenticated"}';

-- Explicit reset: without this, Test B's GUCs (still 'on' for this same
-- transaction) would leak into this call. See header note. set_config is a
-- plain function, not schema-gated, so this is allowed under any role.
SELECT set_config('helm.trace_enabled', 'off', true);

SELECT is(
  public.save_partial_round_atomic(
    '00000000-0000-0000-0000-0000000fc104',
    '{"course_name":"No Trace","holes_played":1,"current_hole":1}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2}]'::jsonb,
    '[{"hole_number":1,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    NULL
  )->>'success',
  'true',
  'save_partial_round_atomic still succeeds with tracing disabled'
);

RESET role;
RESET request.jwt.claims;

SELECT is(
  (SELECT count(*)::int FROM helm_debug.trace_steps),
  (SELECT n FROM _fc_steps_before),
  'no trace_steps rows written when tracing is disabled'
);

DROP TABLE _fc_steps_before;

-- ---------------------------------------------------------------------------
-- C: the exception variant's own contract, called directly
--
-- Calling submit_round_atomic/save_partial_round_atomic into an actual
-- uncaught exception is deliberately NOT how this is tested: both RPCs' own
-- top-level handler ends in a bare RAISE, so whatever catches that re-raise
-- to keep this test transaction alive would roll back to a savepoint
-- established BEFORE the call -- discarding the exception checkpoint's own
-- insert along with everything else, per this migration's header. Calling
-- trace_exception_checkpoint directly tests its actual, observable
-- contract: what it writes, given inputs, when nothing rolls it back.
-- ---------------------------------------------------------------------------

RESET role;
RESET request.jwt.claims;

SELECT helm_private.trace_exception_checkpoint(
  '{"_helm_trace":{"trace_id":"00000000-0000-0000-0000-0000000fc204","enabled":true}}'::jsonb,
  'db.submit_round_atomic.exception',
  'db.submit_round_atomic',
  '22P02',
  'simulated invalid input syntax for integer'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM helm_debug.trace_steps
    WHERE trace_id = '00000000-0000-0000-0000-0000000fc204'
      AND step_key = 'db.submit_round_atomic.exception'
      AND parent_step_key = 'db.submit_round_atomic'
      AND layer = 'postgres'
      AND status = 'failure'
      AND requiredness = 'best_effort'
      AND function_name = 'submit_round_atomic'
      AND error_code = '22P02'
      AND error_summary = 'simulated invalid input syntax for integer'
      AND metadata ->> 'sqlstate' = '22P02'
      AND metadata ->> 'message' = 'simulated invalid input syntax for integer'
  ),
  'trace_exception_checkpoint records failure with sqlstate and message'
);

-- ---------------------------------------------------------------------------
-- D: a broken checkpoint write must never fail the round write
-- ---------------------------------------------------------------------------

SAVEPOINT sp_broken_checkpoint;

ALTER TABLE helm_debug.trace_steps RENAME TO trace_steps_deliberately_missing;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000fc001", "role": "authenticated"}';

SELECT is(
  public.save_partial_round_atomic(
    '00000000-0000-0000-0000-0000000fc103',
    '{"course_name":"Broken Checkpoint","holes_played":1,"current_hole":1,"_helm_trace":{"trace_id":"00000000-0000-0000-0000-0000000fc203","enabled":true}}'::jsonb,
    '[{"hole_number":1,"par":4,"score":4,"putts":2}]'::jsonb,
    '[{"hole_number":1,"shots":[{"shot_number":1,"shot_type":"tee","distance_to_hole_before":400,"distance_unit_before":"yards","result":"fairway"}]}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    NULL
  )->>'success',
  'true',
  'round write survives a checkpoint insert that cannot find its table'
);

RESET role;
RESET request.jwt.claims;

SELECT is(
  (SELECT count(*)::int FROM public.golf_holes
   WHERE round_id = '00000000-0000-0000-0000-0000000fc103'),
  1,
  'the hole this call wrote is actually persisted, not just success=true'
);

ROLLBACK TO SAVEPOINT sp_broken_checkpoint;

SELECT ok(
  to_regclass('helm_debug.trace_steps') IS NOT NULL,
  'trace_steps table name is restored after the savepoint rollback'
);

SELECT * FROM finish();
ROLLBACK;
