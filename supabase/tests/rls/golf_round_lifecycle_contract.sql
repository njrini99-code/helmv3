BEGIN;

-- A fresh migration replay must have the same lifecycle primitives the app
-- calls in production. This caught a branch/schema split where production had
-- applied the guard and capability RPCs but the checked-out migration history
-- did not create them at all.
SELECT plan(12);

-- A minimal persisted round lets this contract test the trigger behavior as
-- well as the presence of its database objects. The enclosing transaction is
-- rolled back, so this never changes local fixture data.
INSERT INTO public.golf_players (id, first_name)
VALUES ('00000000-0000-0000-0000-000000005101', 'Lifecycle');

INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type)
VALUES (
  '00000000-0000-0000-0000-000000005102',
  '00000000-0000-0000-0000-000000005101',
  CURRENT_DATE,
  'in_progress',
  'practice'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.golf_rounds'::regclass
      AND t.tgname = 'golf_rounds_guard_lifecycle'
      AND p.oid = 'helm_private.guard_golf_round_lifecycle()'::regprocedure
  ),
  'golf_rounds has the completed-round lifecycle guard trigger'
);

SELECT ok(
  to_regprocedure('public.reclassify_golf_round(uuid, text, uuid, integer)') IS NOT NULL,
  'the completed-round reclassification RPC exists'
);

SELECT ok(
  to_regprocedure('public.record_round_coachhelm_terminal_state(uuid, timestamptz, timestamptz, text)') IS NOT NULL,
  'the CoachHelm terminal-state RPC exists'
);

SELECT ok(
  COALESCE((
    SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    FROM pg_proc p
    WHERE p.oid = to_regprocedure(
      'public.reclassify_golf_round(uuid, text, uuid, integer)'
    )
  ), false),
  'authenticated callers may request a capability-checked reclassification'
);

SELECT isnt(
  COALESCE((
    SELECT has_function_privilege('anon', p.oid, 'EXECUTE')
    FROM pg_proc p
    WHERE p.oid = to_regprocedure(
      'public.reclassify_golf_round(uuid, text, uuid, integer)'
    )
  ), false),
  true,
  'anonymous callers cannot reclassify completed rounds'
);

SELECT ok(
  COALESCE((
    SELECT has_function_privilege('service_role', p.oid, 'EXECUTE')
    FROM pg_proc p
    WHERE p.oid = to_regprocedure(
      'public.record_round_coachhelm_terminal_state(uuid, timestamptz, timestamptz, text)'
    )
  ), false),
  'the service role may record terminal CoachHelm metadata'
);

SELECT isnt(
  COALESCE((
    SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    FROM pg_proc p
    WHERE p.oid = to_regprocedure(
      'public.record_round_coachhelm_terminal_state(uuid, timestamptz, timestamptz, text)'
    )
  ), false),
  true,
  'ordinary players and coaches cannot call the service-only terminal writer'
);

SELECT is(
  (SELECT p.prosecdef
   FROM pg_proc p
   WHERE p.oid = to_regprocedure(
     'public.reclassify_golf_round(uuid, text, uuid, integer)'
   )),
  true,
  'reclassification uses a protected function with its own authorization check'
);

SELECT ok(
  COALESCE((
    SELECT position('auth.uid()' IN pg_get_functiondef(p.oid)) > 0
    FROM pg_proc p
    WHERE p.oid = to_regprocedure(
      'public.reclassify_golf_round(uuid, text, uuid, integer)'
    )
  ), false),
  'reclassification verifies the invoking user rather than relying on definer privileges'
);

SELECT throws_ok(
  $$UPDATE public.golf_rounds
    SET status = 'completed'
    WHERE id = '00000000-0000-0000-0000-000000005102'$$,
  '55000',
  'Completed rounds must be submitted through the protected round-submit flow.',
  'direct writes cannot complete a saved round'
);

SELECT lives_ok(
  $$SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);
    UPDATE public.golf_rounds
    SET status = 'completed'
    WHERE id = '00000000-0000-0000-0000-000000005102'$$,
  'the protected atomic path can complete a saved round'
);

SELECT set_config('helm.golf_lifecycle_write', '', true);

SELECT throws_ok(
  $$UPDATE public.golf_rounds
    SET notes = 'mutation attempt'
    WHERE id = '00000000-0000-0000-0000-000000005102'$$,
  '55000',
  'Completed rounds are permanent history and cannot be changed.',
  'completed score history cannot be edited directly'
);

SELECT * FROM finish();

ROLLBACK;
