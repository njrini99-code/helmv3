-- The demo generator's database functions (20261115211000, DD-01).
-- They run as the owner, so the contract is: callable by the service role
-- only, the demo team only, the generator's tables only, never a row the
-- generator did not write, and a finished round can be removed again.

BEGIN;
\ir _helpers.sql

SELECT plan(21);

-- ------------------------------------------------------------ who may call

SELECT is(
  (SELECT count(*)::int
     FROM unnest(ARRAY[
       'public.golf_demo_begin(uuid,boolean)',
       'public.golf_demo_apply(uuid,text,jsonb,integer)',
       'public.golf_demo_remove(uuid,text,jsonb)',
       'public.golf_demo_finish_rounds(uuid,jsonb,integer)'
     ]) AS f
    WHERE has_function_privilege('anon', f, 'execute')
       OR has_function_privilege('authenticated', f, 'execute')),
  0,
  'no client role can call a generator function'
);

SELECT is(
  (SELECT count(*)::int
     FROM unnest(ARRAY[
       'public.golf_demo_begin(uuid,boolean)',
       'public.golf_demo_apply(uuid,text,jsonb,integer)',
       'public.golf_demo_remove(uuid,text,jsonb)',
       'public.golf_demo_finish_rounds(uuid,jsonb,integer)'
     ]) AS f
    WHERE has_function_privilege('service_role', f, 'execute')),
  4,
  'the service role can call all four'
);

SELECT is(
  (SELECT count(*)::int
     FROM pg_proc AS p
     JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('golf_demo_begin', 'golf_demo_apply', 'golf_demo_remove', 'golf_demo_finish_rounds')
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=""']),
  4,
  'all four are security definer with an empty search_path'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'helm_private.golf_demo_ledger'::regclass)
  AND NOT has_table_privilege('authenticated', 'helm_private.golf_demo_ledger', 'select')
  AND NOT has_table_privilege('anon', 'helm_private.golf_demo_ledger', 'select'),
  'the ledger has row security on and no client grant'
);

-- ------------------------------------------------------------ fixtures

INSERT INTO public.golf_teams (id, name, join_code)
VALUES ('6ecdd1a6-63fe-4beb-b094-00118f334163', 'Demo team', 'DEMOTAP1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.golf_teams (id, name, join_code)
VALUES ('00000000-0000-4000-8000-00000000d0e1', 'Another team', 'DEMOTAP2');
INSERT INTO public.golf_players (id, first_name, last_name)
VALUES ('00000000-0000-4000-8000-00000000d0a1', 'Generated', 'Player');
INSERT INTO public.golf_rounds (id, player_id, team_id, round_date, status, round_type)
VALUES ('00000000-0000-4000-8000-00000000d0b9', '00000000-0000-4000-8000-00000000d0a1',
        '00000000-0000-4000-8000-00000000d0e1', DATE '2026-11-01', 'in_progress', 'practice');
-- An event a coach wrote on the demo team: the generator must not touch it.
INSERT INTO public.golf_events (id, team_id, title, event_type, start_time)
VALUES ('00000000-0000-4000-8000-00000000d0c9', '6ecdd1a6-63fe-4beb-b094-00118f334163',
        'Written by a coach', 'practice', TIMESTAMPTZ '2026-11-20 14:00Z');

-- ------------------------------------------------------------ refusals

SELECT throws_ok(
  $$SELECT public.golf_demo_begin('00000000-0000-4000-8000-00000000d0e1'::uuid, false)$$,
  '42501', NULL,
  'begin refuses any team but the demo team'
);

SELECT throws_ok(
  $$SELECT public.golf_demo_apply('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, 'golf_coaches',
      '[{"hash": "h", "row": {"id": "00000000-0000-4000-8000-00000000d0f1"}}]'::jsonb, 1)$$,
  '42501', NULL,
  'apply refuses a table the generator does not write'
);

SELECT throws_ok(
  $$SELECT public.golf_demo_apply('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, 'golf_events',
      '[{"hash": "h", "row": {"id": "00000000-0000-4000-8000-00000000d0c1",
         "team_id": "00000000-0000-4000-8000-00000000d0e1", "title": "x",
         "event_type": "practice", "start_time": "2026-11-20T14:00:00Z"}}]'::jsonb, 1)$$,
  '42501', NULL,
  'apply refuses a row of another team'
);

SELECT throws_ok(
  $$SELECT public.golf_demo_apply('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, 'golf_holes',
      '[{"hash": "h", "row": {"id": "00000000-0000-4000-8000-00000000d0d9",
         "round_id": "00000000-0000-4000-8000-00000000d0b9", "hole_number": 1, "par": 4, "score": 4}}]'::jsonb, 1)$$,
  '42501', NULL,
  'apply refuses a hole of another team''s round'
);

SELECT throws_ok(
  $$SELECT public.golf_demo_apply('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, 'golf_events',
      '[{"hash": "h", "row": {"id": "00000000-0000-4000-8000-00000000d0c1",
         "team_id": "6ecdd1a6-63fe-4beb-b094-00118f334163", "no_such_column": 1}}]'::jsonb, 1)$$,
  'P0001', NULL,
  'apply refuses a column the table does not have'
);

-- ------------------------------------------------------------ a round, written and finished

SELECT is(
  public.golf_demo_apply('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, 'golf_players',
    '[{"hash": "p1", "row": {"id": "00000000-0000-4000-8000-00000000d0a1", "first_name": "Generated", "last_name": "Player"}}]'::jsonb, 1)
    -> 'skipped',
  '["00000000-0000-4000-8000-00000000d0a1"]'::jsonb,
  'a player row that exists and is not in the ledger is skipped'
);

SELECT is(
  (public.golf_demo_apply('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, 'golf_rounds',
    '[{"hash": "r1", "row": {"id": "00000000-0000-4000-8000-00000000d0b1",
       "player_id": "00000000-0000-4000-8000-00000000d0a1", "team_id": "6ecdd1a6-63fe-4beb-b094-00118f334163",
       "round_date": "2026-11-02", "status": "completed", "round_type": "practice", "holes_played": 2}}]'::jsonb, 1)
    ->> 'written')::int,
  1,
  'apply writes a completed generator round'
);

SELECT is(
  (public.golf_demo_apply('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, 'golf_holes',
    '[{"hash": "h1", "row": {"id": "00000000-0000-4000-8000-00000000d0d1", "round_id": "00000000-0000-4000-8000-00000000d0b1",
       "hole_number": 1, "par": 4, "score": 5, "putts": 2}},
      {"hash": "h2", "row": {"id": "00000000-0000-4000-8000-00000000d0d2", "round_id": "00000000-0000-4000-8000-00000000d0b1",
       "hole_number": 2, "par": 3, "score": 3, "putts": 1}}]'::jsonb, 1)
    ->> 'written')::int,
  2,
  'apply writes the round''s holes'
);

SELECT is(
  public.golf_demo_finish_rounds('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid,
    '[{"id": "00000000-0000-4000-8000-00000000d0b1", "hash": "f1"}]'::jsonb, 1),
  1,
  'finish recomputes the round'
);

SELECT is(
  (SELECT total_score FROM public.golf_rounds WHERE id = '00000000-0000-4000-8000-00000000d0b1'),
  8,
  'the finished round''s total is the sum of its holes'
);

SELECT is(
  (SELECT row_hash FROM helm_private.golf_demo_ledger
    WHERE table_name = 'golf_rounds#finished' AND row_key = '00000000-0000-4000-8000-00000000d0b1'),
  'f1',
  'the ledger records the round as finished'
);

SELECT is(
  (public.golf_demo_begin('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, false)
    -> 'tables' -> 'golf_holes' ->> '00000000-0000-4000-8000-00000000d0d2'),
  'h2',
  'begin returns the ledger'
);

-- ------------------------------------------------------------ rows it did not write

SELECT is(
  public.golf_demo_apply('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, 'golf_events',
    '[{"hash": "e9", "row": {"id": "00000000-0000-4000-8000-00000000d0c9",
       "team_id": "6ecdd1a6-63fe-4beb-b094-00118f334163", "title": "Overwritten",
       "event_type": "practice", "start_time": "2026-11-20T14:00:00Z"}}]'::jsonb, 1)
    -> 'skipped',
  '["00000000-0000-4000-8000-00000000d0c9"]'::jsonb,
  'an event a coach wrote is skipped, not overwritten'
);

SELECT is(
  public.golf_demo_remove('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, 'golf_events',
    '[{"id": "00000000-0000-4000-8000-00000000d0c9"}]'::jsonb),
  0,
  'remove leaves a row the generator did not write'
);

SELECT is(
  (SELECT title FROM public.golf_events WHERE id = '00000000-0000-4000-8000-00000000d0c9'),
  'Written by a coach',
  'that event is unchanged'
);

-- ------------------------------------------------------------ removing a finished round

SELECT is(
  public.golf_demo_remove('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, 'golf_holes',
    '[{"id": "00000000-0000-4000-8000-00000000d0d1"}, {"id": "00000000-0000-4000-8000-00000000d0d2"}]'::jsonb)
  + public.golf_demo_remove('6ecdd1a6-63fe-4beb-b094-00118f334163'::uuid, 'golf_rounds',
    '[{"id": "00000000-0000-4000-8000-00000000d0b1"}]'::jsonb),
  3,
  'remove deletes a completed generator round and its holes (the history guard does not silently keep it)'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_rounds WHERE id = '00000000-0000-4000-8000-00000000d0b1')
  + (SELECT count(*)::int FROM helm_private.golf_demo_ledger
      WHERE row_key = '00000000-0000-4000-8000-00000000d0b1'),
  0,
  'the round and its ledger rows, finished marker included, are gone'
);

SELECT * FROM finish();
ROLLBACK;
