-- pgTAP contract for 20261021110000_golf_import_player_classes.sql
-- (Clubhouse P012, audit doc-61: two class imports in flight at once).
--
-- The function is SECURITY INVOKER, so the suite acts as real users through
-- request.jwt.claims. It pins: the grant (authenticated only), the import's
-- skip rules (same class and term; a blank or missing term reads as p_term; a
-- schedule listing a class twice saves it once; the same class in another term
-- is another class), that a second call for the same player inserts nothing
-- (what the advisory lock makes true for two calls that overlap in time), that
-- RLS still refuses another player's schedule, and that two same-named classes
-- added one at a time are still allowed (no unique constraint was added).
--
-- Concurrency itself cannot be driven from one pgTAP session; the lock is a
-- single pg_advisory_xact_lock call at the top of the function body, pinned
-- here by reading the function definition.
--
-- Plan arithmetic: 3 structural + 5 import + 1 repeat + 1 refused + 1 manual = 11.

BEGIN;
\ir _helpers.sql

SELECT plan(11);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000021102001', 'p1@clsimp.test', 'authenticated'),
    ('00000000-0000-0000-0000-000021102002', 'p2@clsimp.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-000021102401', '00000000-0000-0000-0000-000021102001', 'Pat', 'One'),
    ('00000000-0000-0000-0000-000021102402', '00000000-0000-0000-0000-000021102002', 'Pat', 'Two')
  ON CONFLICT DO NOTHING;

  -- Already on the schedule: one with the term, one saved before the term column was filled.
  INSERT INTO public.golf_player_classes (id, player_id, class_name, semester) VALUES
    ('00000000-0000-0000-0000-000021102501', '00000000-0000-0000-0000-000021102401', 'STAT 201 - Probability', 'Fall 2026'),
    ('00000000-0000-0000-0000-000021102502', '00000000-0000-0000-0000-000021102401', 'ART 101 - Drawing', NULL)
  ON CONFLICT DO NOTHING;
END $$;

-- Structure ------------------------------------------------------------------

SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'golf_import_player_classes'
      AND NOT p.prosecdef),
  1,
  'golf_import_player_classes exists and is SECURITY INVOKER (the caller''s RLS applies)'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.golf_import_player_classes(uuid, uuid, text, jsonb)', 'execute')
  AND NOT has_function_privilege('anon', 'public.golf_import_player_classes(uuid, uuid, text, jsonb)', 'execute'),
  'EXECUTE is granted to authenticated and not to anon'
);

SELECT ok(
  position('pg_advisory_xact_lock' IN pg_get_functiondef('public.golf_import_player_classes(uuid, uuid, text, jsonb)'::regprocedure)) > 0,
  'the function takes the per-player advisory lock before it reads'
);

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000021102001", "role": "authenticated"}';

-- First import: STAT (stored, same term) and ART (stored, no term = p_term) are
-- skipped; GEOG is new and listed twice; MATH is new; STAT in Spring 2027 is a
-- different class.
CREATE TEMP TABLE first_import ON COMMIT DROP AS
SELECT public.golf_import_player_classes(
  '00000000-0000-0000-0000-000021102401',
  NULL,
  'Fall 2026',
  '[
    {"class_name": "STAT 201 - Probability", "semester": "Fall 2026"},
    {"class_name": "ART 101 - Drawing", "semester": "Fall 2026"},
    {"class_name": "GEOG 110 - Global", "semester": "Fall 2026", "color": "#3B82F6"},
    {"class_name": "GEOG 110 - Global", "semester": "Fall 2026"},
    {"class_name": "MATH 232 - Linear Algebra", "semester": "  "},
    {"class_name": "STAT 201 - Probability", "semester": "Spring 2027"}
  ]'::jsonb
) AS r;

SELECT is(
  (SELECT jsonb_array_length(r->'inserted') FROM first_import),
  3,
  'three new classes are saved: GEOG once, MATH (blank term = p_term), STAT in another term'
);

SELECT is(
  (SELECT array_agg(x->>'semester' ORDER BY x->>'class_name', x->>'semester')
     FROM first_import, jsonb_array_elements(r->'inserted') AS x),
  ARRAY['Fall 2026', 'Fall 2026', 'Spring 2027'],
  'a blank term is saved as p_term, and the others keep theirs'
);

SELECT is(
  (SELECT r->'skipped' FROM first_import),
  '["STAT 201 - Probability", "ART 101 - Drawing", "GEOG 110 - Global"]'::jsonb,
  'the stored classes and the second GEOG listing are named as skipped, in the order given'
);

SELECT is(
  (SELECT array_agg(x->>'class_name' ORDER BY x->>'class_name') FROM first_import, jsonb_array_elements(r->'known') AS x),
  ARRAY['ART 101 - Drawing', 'STAT 201 - Probability'],
  'the stored rows the skipped ones matched come back as known'
);

SELECT is(
  (SELECT count(*)::int FROM public.golf_player_classes
    WHERE player_id = '00000000-0000-0000-0000-000021102401'),
  5,
  'the schedule holds the two it had plus three new'
);

-- Second import of the same schedule: nothing is added.
SELECT is(
  (SELECT jsonb_array_length(
     public.golf_import_player_classes(
       '00000000-0000-0000-0000-000021102401',
       NULL,
       'Fall 2026',
       '[{"class_name": "GEOG 110 - Global", "semester": "Fall 2026"},
         {"class_name": "MATH 232 - Linear Algebra", "semester": "Fall 2026"}]'::jsonb
     )->'inserted')),
  0,
  'importing the same classes again saves nothing'
);

-- Another player's schedule is not writable.
SELECT throws_ok(
  $$SELECT public.golf_import_player_classes(
      '00000000-0000-0000-0000-000021102402', NULL, 'Fall 2026',
      '[{"class_name": "PHIL 150 - Ethics", "semester": "Fall 2026"}]'::jsonb)$$,
  '42501', NULL,
  'a player cannot import into another player''s schedule'
);

-- No unique constraint: a lecture and its lab with one name can still be added by hand.
SELECT lives_ok(
  $$INSERT INTO public.golf_player_classes (player_id, class_name, semester) VALUES
      ('00000000-0000-0000-0000-000021102401', 'BIOL 120 - Biology', 'Fall 2026'),
      ('00000000-0000-0000-0000-000021102401', 'BIOL 120 - Biology', 'Fall 2026')$$,
  'two same-named classes added one by one are still allowed'
);

RESET role;
SELECT * FROM finish();
ROLLBACK;
