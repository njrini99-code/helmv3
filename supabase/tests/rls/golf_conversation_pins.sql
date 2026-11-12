-- pgTAP contract for 20261031150000_golf_conversation_pins.sql (Clubhouse Messages pins on every device; HELD.md says
-- "run npm run test:rls before applying", and no suite existed). Messages v2 package M, step M5: this file is the missing
-- test; the migration itself is promoted unchanged.
--
-- Proves: pins are private (own-row read only, no direct write for authenticated, none for anon); the limit is 3 per person
-- per team and is counted per team; only a visible, joined conversation can be pinned; pin and unpin are idempotent and
-- renumber; reorder refuses a stale set; hiding or leaving a conversation unpins it; one person's pins never reach another.
-- WRITTEN, NOT RUN where it was authored (no Docker): run with npm run test:rls before applying.
--
-- Ids use the 0000...0f5xxx range. Team T1 has conversations c1..c4 (A in all, B only in c1); team T2 has c5 (A);
-- z is a conversation A is not in.

BEGIN;
\ir _helpers.sql

SELECT plan(31);

CREATE FUNCTION public.f5_pins(p_user text, p_team text) RETURNS uuid[]
LANGUAGE sql AS $$
  SELECT coalesce(array_agg(conversation_id ORDER BY position), '{}')
  FROM public.golf_conversation_pins WHERE user_id = p_user::uuid AND team_id IS NOT DISTINCT FROM p_team::uuid;
$$;
CREATE FUNCTION public.f5_positions(p_user text, p_team text) RETURNS int[]
LANGUAGE sql AS $$
  SELECT coalesce(array_agg(position::int ORDER BY position), '{}')
  FROM public.golf_conversation_pins WHERE user_id = p_user::uuid AND team_id IS NOT DISTINCT FROM p_team::uuid;
$$;

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f51a1', 'f5-a@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f51b1', 'f5-b@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f51a1', 'f5-a@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f51b1', 'f5-b@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_teams (id, name, join_code) VALUES
    ('00000000-0000-0000-0000-0000000f5e01', 'Pins Team 1', 'PGPIN001'),
    ('00000000-0000-0000-0000-0000000f5e02', 'Pins Team 2', 'PGPIN002')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, title) VALUES
    ('00000000-0000-0000-0000-0000000f5c01', '00000000-0000-0000-0000-0000000f51a1', '00000000-0000-0000-0000-0000000f5e01', true, 'c1'),
    ('00000000-0000-0000-0000-0000000f5c02', '00000000-0000-0000-0000-0000000f51a1', '00000000-0000-0000-0000-0000000f5e01', true, 'c2'),
    ('00000000-0000-0000-0000-0000000f5c03', '00000000-0000-0000-0000-0000000f51a1', '00000000-0000-0000-0000-0000000f5e01', true, 'c3'),
    ('00000000-0000-0000-0000-0000000f5c04', '00000000-0000-0000-0000-0000000f51a1', '00000000-0000-0000-0000-0000000f5e01', true, 'c4'),
    ('00000000-0000-0000-0000-0000000f5c05', '00000000-0000-0000-0000-0000000f51a1', '00000000-0000-0000-0000-0000000f5e02', true, 'c5'),
    ('00000000-0000-0000-0000-0000000f5c0f', '00000000-0000-0000-0000-0000000f51b1', NULL, false, 'z: A is not in it')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-0000000f5c01', '00000000-0000-0000-0000-0000000f51a1'),
    ('00000000-0000-0000-0000-0000000f5c02', '00000000-0000-0000-0000-0000000f51a1'),
    ('00000000-0000-0000-0000-0000000f5c03', '00000000-0000-0000-0000-0000000f51a1'),
    ('00000000-0000-0000-0000-0000000f5c04', '00000000-0000-0000-0000-0000000f51a1'),
    ('00000000-0000-0000-0000-0000000f5c05', '00000000-0000-0000-0000-0000000f51a1'),
    ('00000000-0000-0000-0000-0000000f5c01', '00000000-0000-0000-0000-0000000f51b1'),
    ('00000000-0000-0000-0000-0000000f5c0f', '00000000-0000-0000-0000-0000000f51b1')
  ON CONFLICT DO NOTHING;
END $$;

-- Structure ------------------------------------------------------------------
SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.golf_conversation_pins'::regclass)
  AND has_table_privilege('authenticated', 'public.golf_conversation_pins', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.golf_conversation_pins', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.golf_conversation_pins', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.golf_conversation_pins', 'DELETE'),
  'the pins table has RLS on, and authenticated may only SELECT');
SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_conversation_pins', 'SELECT')
  AND NOT has_function_privilege('anon', 'public.golf_pin_conversation(uuid, boolean)', 'execute')
  AND NOT has_function_privilege('anon', 'public.golf_reorder_conversation_pins(uuid, uuid[])', 'execute')
  AND has_function_privilege('authenticated', 'public.golf_pin_conversation(uuid, boolean)', 'execute')
  AND has_function_privilege('authenticated', 'public.golf_reorder_conversation_pins(uuid, uuid[])', 'execute'),
  'anon has nothing on pins; authenticated may call the two functions');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_conversation_pins' AND cmd = 'SELECT' AND roles = '{authenticated}'),
  1, 'exactly one policy on the pins table: own-row SELECT');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname = 'golf_pins_receive'
      AND cmd = 'SELECT' AND roles = '{authenticated}' AND qual LIKE '%golf-pins:%'),
  'the private golf-pins:<user> receive policy exists');
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages' AND qual LIKE '%golf-pins:%' AND cmd <> 'SELECT'),
  'clients get no send policy on golf-pins topics');

-- Pin, limit, idempotence -------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f51a1", "role": "authenticated"}';

SELECT is(
  (public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c01', true) -> 'pins' ->> 0),
  '00000000-0000-0000-0000-0000000f5c01', 'A pins c1: it is first in the answered list');
SELECT lives_ok($$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c02', true)$$, 'A pins c2');
SELECT lives_ok($$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c03', true)$$, 'A pins c3');
SELECT throws_ok(
  $$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c04', true)$$,
  'P0001', 'pin_limit', 'a fourth pin in the same team raises pin_limit');
SELECT lives_ok($$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c01', true)$$,
  'pinning a pinned conversation again is fine');
SELECT lives_ok($$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c05', true)$$,
  'the limit is per team: A can still pin in team 2');
SELECT throws_ok(
  $$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c0f', true)$$,
  'P0001', 'not_a_member', 'a conversation A is not in cannot be pinned');
SELECT throws_ok(
  $$SELECT public.golf_pin_conversation(NULL, true)$$,
  '22023', 'invalid_arguments', 'a null conversation is refused');

-- Privacy: direct writes and other people's pins ----------------------------------------
SELECT throws_ok(
  $$INSERT INTO public.golf_conversation_pins (user_id, conversation_id, team_id, position)
    VALUES ('00000000-0000-0000-0000-0000000f51a1', '00000000-0000-0000-0000-0000000f5c04', '00000000-0000-0000-0000-0000000f5e01', 3)$$,
  '42501', NULL, 'A cannot insert a pin directly (it would bypass the limit)');
SELECT throws_ok(
  $$UPDATE public.golf_conversation_pins SET position = 0 WHERE user_id = '00000000-0000-0000-0000-0000000f51a1'$$,
  '42501', NULL, 'A cannot update a pin directly');
SELECT throws_ok(
  $$DELETE FROM public.golf_conversation_pins WHERE user_id = '00000000-0000-0000-0000-0000000f51a1'$$,
  '42501', NULL, 'A cannot delete a pin directly');
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_pins), 4, 'A reads exactly their own four pins');
RESET ROLE;

SELECT is(public.f5_pins('00000000-0000-0000-0000-0000000f51a1', '00000000-0000-0000-0000-0000000f5e01'),
  ARRAY['00000000-0000-0000-0000-0000000f5c01', '00000000-0000-0000-0000-0000000f5c02', '00000000-0000-0000-0000-0000000f5c03']::uuid[],
  'team 1 holds c1, c2, c3 in that order (as the owner reads it)');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f51b1", "role": "authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_conversation_pins), 0, 'B reads none of A''s pins');
SELECT lives_ok($$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c01', true)$$,
  'B can pin c1, which B is in');
SELECT is(
  (public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c01', false) -> 'pins'),
  '[]'::jsonb, 'B unpins c1 and gets an empty list');
RESET ROLE;
SELECT is(cardinality(public.f5_pins('00000000-0000-0000-0000-0000000f51a1', '00000000-0000-0000-0000-0000000f5e01')), 3,
  'B''s pin and unpin of c1 did not touch A''s pins');

-- Unpin, renumber, reorder ----------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f51a1", "role": "authenticated"}';
SELECT lives_ok($$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c02', false)$$, 'A unpins c2, the middle one');
RESET ROLE;
SELECT is(public.f5_positions('00000000-0000-0000-0000-0000000f51a1', '00000000-0000-0000-0000-0000000f5e01'), ARRAY[0, 1],
  'the remaining pins are renumbered 0, 1');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f51a1", "role": "authenticated"}';
SELECT throws_ok(
  $$SELECT public.golf_reorder_conversation_pins('00000000-0000-0000-0000-0000000f5e01',
      ARRAY['00000000-0000-0000-0000-0000000f5c01', '00000000-0000-0000-0000-0000000f5c02']::uuid[])$$,
  'P0001', 'pins_changed', 'a reorder with a stale set raises pins_changed');
SELECT lives_ok(
  $$SELECT public.golf_reorder_conversation_pins('00000000-0000-0000-0000-0000000f5e01',
      ARRAY['00000000-0000-0000-0000-0000000f5c03', '00000000-0000-0000-0000-0000000f5c01']::uuid[])$$,
  'a reorder with the right set works');
RESET ROLE;
SELECT is(public.f5_pins('00000000-0000-0000-0000-0000000f51a1', '00000000-0000-0000-0000-0000000f5e01'),
  ARRAY['00000000-0000-0000-0000-0000000f5c03', '00000000-0000-0000-0000-0000000f5c01']::uuid[], 'c3 is now first');

-- Hiding and leaving unpin -----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f51a1", "role": "authenticated"}';
UPDATE public.golf_conversation_participants SET hidden_at = now()
  WHERE conversation_id = '00000000-0000-0000-0000-0000000f5c01' AND user_id = '00000000-0000-0000-0000-0000000f51a1';
SELECT throws_ok(
  $$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c01', true)$$,
  'P0001', 'not_a_member', 'a conversation A has hidden cannot be pinned');
DELETE FROM public.golf_conversation_participants
  WHERE conversation_id = '00000000-0000-0000-0000-0000000f5c03' AND user_id = '00000000-0000-0000-0000-0000000f51a1';
RESET ROLE;
SELECT is(public.f5_pins('00000000-0000-0000-0000-0000000f51a1', '00000000-0000-0000-0000-0000000f5e01'),
  '{}'::uuid[], 'hiding c1 and leaving c3 each removed their pin (team 1 is empty)');

-- Not signed in, and anon -------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"role": "authenticated"}';
SELECT throws_ok(
  $$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c05', true)$$,
  'P0001', 'not_signed_in', 'a session with no user id is refused');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000f5c05', true)$$,
  '42501', NULL, 'anon cannot call the pin function');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
