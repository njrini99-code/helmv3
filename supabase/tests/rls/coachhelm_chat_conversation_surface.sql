-- pgTAP contract for 20261110130000_coachhelm_chat_conversation_surface.sql (the CoachHelm chat rebuild: quick chat lists
-- its own earlier threads). HELD: the migration is written and not applied.
--
-- Proves: the column exists, is text and nullable; only the three coach surfaces (or NULL) are accepted; RLS is still on;
-- the owning coach writes and reads the label on their own conversation and another coach reads none and changes none.
-- WRITTEN, NOT RUN where it was authored (the local database stack was in use by another worker): run with
-- npm run test:rls before applying.
--
-- Ids use the 0000...0c8xxx range. Coach A owns conversation c1; coach B owns nothing here.

BEGIN;
\ir _helpers.sql

SELECT plan(9);

SELECT has_column('public', 'golf_coachhelm_chat_conversations', 'surface', 'surface exists');
SELECT col_type_is('public', 'golf_coachhelm_chat_conversations', 'surface', 'text', 'surface is text');
SELECT col_is_null('public', 'golf_coachhelm_chat_conversations', 'surface', 'surface is nullable');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_coachhelm_chat_conversations'::regclass),
  'RLS is still enabled on golf_coachhelm_chat_conversations'
);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000c8a01', 'c8-coach-a@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000c8b01', 'c8-coach-b@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000c8a01', 'c8-coach-a@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000c8b01', 'c8-coach-b@helm.test', 'coach')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id, full_name) VALUES
    ('00000000-0000-0000-0000-0000000c8a02', '00000000-0000-0000-0000-0000000c8a01', 'C8 Coach A'),
    ('00000000-0000-0000-0000-0000000c8b02', '00000000-0000-0000-0000-0000000c8b01', 'C8 Coach B')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coachhelm_chat_conversations (id, coach_id, title) VALUES
    ('00000000-0000-0000-0000-0000000c8c01', '00000000-0000-0000-0000-0000000c8a02', 'c8 conversation');
END
$$;

-- The shape check, as the table owner.
SELECT throws_ok(
  $$UPDATE public.golf_coachhelm_chat_conversations SET surface = 'player'
    WHERE id = '00000000-0000-0000-0000-0000000c8c01'$$,
  '23514',
  NULL,
  'a surface that is not one of the coach surfaces is refused'
);
SELECT is(
  (SELECT surface FROM public.golf_coachhelm_chat_conversations WHERE id = '00000000-0000-0000-0000-0000000c8c01'),
  NULL,
  'a conversation created without a surface has none'
);

-- The owning coach labels and reads their own conversation.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c8a01", "role": "authenticated"}';
SELECT lives_ok(
  $$UPDATE public.golf_coachhelm_chat_conversations SET surface = 'quick_chat'
    WHERE id = '00000000-0000-0000-0000-0000000c8c01'$$,
  'the owning coach labels their own conversation'
);

-- Another coach sees nothing of it and changes nothing.
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c8b01", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_coachhelm_chat_conversations WHERE id = '00000000-0000-0000-0000-0000000c8c01'),
  0,
  'another coach cannot read the conversation, so not its surface either'
);
UPDATE public.golf_coachhelm_chat_conversations SET surface = 'ask' WHERE id = '00000000-0000-0000-0000-0000000c8c01';
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c8a01", "role": "authenticated"}';
SELECT is(
  (SELECT surface FROM public.golf_coachhelm_chat_conversations WHERE id = '00000000-0000-0000-0000-0000000c8c01'),
  'quick_chat',
  'another coach''s update changed nothing'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
