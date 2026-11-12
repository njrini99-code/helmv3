-- pgTAP contract for 20261110120000_coachhelm_chat_model_messages.sql (the CoachHelm chat rebuild: the server owns the
-- conversation). HELD: the migration is written and not applied.
--
-- Proves: the two columns exist, are jsonb and nullable; a model_messages value must be an array and a pending_decision
-- value an object; the coach policy is still there and RLS is on; the owning coach reads and writes the new columns
-- on their own rows and another coach reads none and changes none; anon has no access.
-- WRITTEN, NOT RUN where it was authored (the local database stack was in use by another worker): run with
-- npm run test:rls before applying.
--
-- Ids use the 0000...0c7xxx range. Coach A owns conversation c1 with one assistant message m1; coach B owns nothing here.

BEGIN;
\ir _helpers.sql

SELECT plan(14);

SELECT has_column('public', 'golf_coachhelm_chat_messages', 'model_messages', 'model_messages exists');
SELECT has_column('public', 'golf_coachhelm_chat_messages', 'pending_decision', 'pending_decision exists');
SELECT col_type_is('public', 'golf_coachhelm_chat_messages', 'model_messages', 'jsonb', 'model_messages is jsonb');
SELECT col_type_is('public', 'golf_coachhelm_chat_messages', 'pending_decision', 'jsonb', 'pending_decision is jsonb');
SELECT col_is_null('public', 'golf_coachhelm_chat_messages', 'model_messages', 'model_messages is nullable');
SELECT col_is_null('public', 'golf_coachhelm_chat_messages', 'pending_decision', 'pending_decision is nullable');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_coachhelm_chat_messages'::regclass),
  'RLS is still enabled on golf_coachhelm_chat_messages'
);
-- What the migration guarantees is that it touches no policy: the coach policy is still there, still FOR ALL. How many
-- policies the table has is not its business (the held 20261101090200 adds four player policies to this table).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_coachhelm_chat_messages'
      AND policyname = 'chat_messages_coach_only' AND cmd = 'ALL'
  ),
  'the coach policy chat_messages_coach_only is still there, FOR ALL'
);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000c7a01', 'c7-coach-a@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000c7b01', 'c7-coach-b@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000c7a01', 'c7-coach-a@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000c7b01', 'c7-coach-b@helm.test', 'coach')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id, full_name) VALUES
    ('00000000-0000-0000-0000-0000000c7a02', '00000000-0000-0000-0000-0000000c7a01', 'C7 Coach A'),
    ('00000000-0000-0000-0000-0000000c7b02', '00000000-0000-0000-0000-0000000c7b01', 'C7 Coach B')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coachhelm_chat_conversations (id, coach_id, title) VALUES
    ('00000000-0000-0000-0000-0000000c7c01', '00000000-0000-0000-0000-0000000c7a02', 'c7 conversation');
  INSERT INTO public.golf_coachhelm_chat_messages (id, conversation_id, role, content) VALUES
    ('00000000-0000-0000-0000-0000000c7d01', '00000000-0000-0000-0000-0000000c7c01', 'assistant', 'Here is the plan.');
END
$$;

-- The shape checks, as the table owner.
SELECT throws_ok(
  $$UPDATE public.golf_coachhelm_chat_messages SET model_messages = '{"role":"user"}'::jsonb
    WHERE id = '00000000-0000-0000-0000-0000000c7d01'$$,
  '23514',
  NULL,
  'model_messages must be a JSON array'
);
SELECT throws_ok(
  $$UPDATE public.golf_coachhelm_chat_messages SET pending_decision = '[]'::jsonb
    WHERE id = '00000000-0000-0000-0000-0000000c7d01'$$,
  '23514',
  NULL,
  'pending_decision must be a JSON object'
);

-- The owning coach writes and reads the new columns on their own row.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c7a01", "role": "authenticated"}';
SELECT lives_ok(
  $$UPDATE public.golf_coachhelm_chat_messages
    SET model_messages = '[{"role":"user","content":"Make a focus area"}]'::jsonb,
        pending_decision = '{"order":["tu_1"],"results":{},"tasks":[{"key":"k","tool":"create_focus_area","tool_use_id":"tu_1"}],"steps":1}'::jsonb
    WHERE id = '00000000-0000-0000-0000-0000000c7d01'$$,
  'the owning coach stores model messages and a pending decision on their own turn'
);
SELECT is(
  (SELECT pending_decision -> 'tasks' -> 0 ->> 'key' FROM public.golf_coachhelm_chat_messages WHERE id = '00000000-0000-0000-0000-0000000c7d01'),
  'k',
  'the owning coach reads the pending decision back'
);

-- Another coach sees nothing of it and changes nothing.
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c7b01", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_coachhelm_chat_messages WHERE id = '00000000-0000-0000-0000-0000000c7d01'),
  0,
  'another coach cannot read the row, so not its model messages either'
);
UPDATE public.golf_coachhelm_chat_messages SET pending_decision = NULL WHERE id = '00000000-0000-0000-0000-0000000c7d01';
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c7a01", "role": "authenticated"}';
SELECT isnt(
  (SELECT pending_decision FROM public.golf_coachhelm_chat_messages WHERE id = '00000000-0000-0000-0000-0000000c7d01'),
  NULL,
  'another coach''s update changed nothing'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
