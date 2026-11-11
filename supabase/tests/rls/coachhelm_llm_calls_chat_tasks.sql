-- pgTAP contract for 20261111090000_coachhelm_llm_calls_chat_tasks.sql (the CoachHelm chat rebuild: a player's Ask turn
-- and the call for what to ask next get their own keys in the model-call ledger). HELD: the migration is written and not
-- applied.
--
-- Proves: the task CHECK is there and validated; it takes the two new keys and still takes the four earlier ones; it still
-- refuses anything else; RLS is still on and the coach read policy is still there; a coach still reads only their own rows,
-- whatever their task.
-- WRITTEN, NOT RUN where it was authored (the local database stack was stopped): run with npm run test:rls before applying.
--
-- Ids use the 0000...0c9xxx range. Coach A owns one row of each new key; coach B owns nothing here.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

SELECT ok(
  (SELECT convalidated FROM pg_constraint
   WHERE conrelid = 'public.golf_coachhelm_llm_calls'::regclass AND conname = 'golf_coachhelm_llm_calls_task_check'),
  'the task CHECK exists and is validated'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.golf_coachhelm_llm_calls'::regclass),
  'RLS is still enabled on golf_coachhelm_llm_calls'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'golf_coachhelm_llm_calls'
      AND policyname = 'llm_calls_coach_read' AND cmd = 'SELECT'
  ),
  'the coach read policy llm_calls_coach_read is still there'
);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000c9a01', 'c9-coach-a@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000c9b01', 'c9-coach-b@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000c9a01', 'c9-coach-a@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000c9b01', 'c9-coach-b@helm.test', 'coach')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id, full_name) VALUES
    ('00000000-0000-0000-0000-0000000c9a02', '00000000-0000-0000-0000-0000000c9a01', 'C9 Coach A'),
    ('00000000-0000-0000-0000-0000000c9b02', '00000000-0000-0000-0000-0000000c9b01', 'C9 Coach B')
  ON CONFLICT DO NOTHING;
END
$$;

-- The two new keys, as the table owner (the chat writes with the service role).
SELECT lives_ok(
  $$INSERT INTO public.golf_coachhelm_llm_calls
      (id, task, coach_id, prompt_hash, model_id, prompt_tokens, completion_tokens, cost_usd, verified)
    VALUES ('00000000-0000-0000-0000-0000000c9d01', 'chat_suggestions', '00000000-0000-0000-0000-0000000c9a02',
            'c9-suggest', 'anthropic/claude-haiku-5-5', 900, 120, 0.00015, true)$$,
  'a chat_suggestions row is accepted'
);
SELECT lives_ok(
  $$INSERT INTO public.golf_coachhelm_llm_calls
      (id, task, coach_id, prompt_hash, model_id, prompt_tokens, completion_tokens, cost_usd, verified)
    VALUES ('00000000-0000-0000-0000-0000000c9d02', 'player_chat', '00000000-0000-0000-0000-0000000c9a02',
            'c9-player', 'anthropic/claude-haiku-5-5', 1000, 200, 0.0002, true)$$,
  'a player_chat row is accepted'
);

-- The four earlier keys are still accepted.
SELECT lives_ok(
  $$INSERT INTO public.golf_coachhelm_llm_calls
      (task, coach_id, prompt_hash, model_id, prompt_tokens, completion_tokens, cost_usd, verified)
    SELECT t, '00000000-0000-0000-0000-0000000c9a02', 'c9-' || t, 'm', 1, 1, 0, true
    FROM unnest(ARRAY['round_review', 'hero_narrative', 'coach_chat', 'round_review_narrative']) AS t$$,
  'round_review, hero_narrative, coach_chat and round_review_narrative are still accepted'
);

-- Anything else is still refused.
SELECT throws_ok(
  $$INSERT INTO public.golf_coachhelm_llm_calls
      (task, coach_id, prompt_hash, model_id, prompt_tokens, completion_tokens, cost_usd, verified)
    VALUES ('chat_other', '00000000-0000-0000-0000-0000000c9a02', 'c9-other', 'm', 1, 1, 0, true)$$,
  '23514',
  NULL,
  'a task that is not listed is refused'
);
SELECT throws_ok(
  $$UPDATE public.golf_coachhelm_llm_calls SET task = 'suggestions'
    WHERE id = '00000000-0000-0000-0000-0000000c9d01'$$,
  '23514',
  NULL,
  'a row cannot be re-keyed to a task that is not listed'
);

-- The owning coach reads their own rows under the new keys.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c9a01", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_coachhelm_llm_calls
   WHERE id IN ('00000000-0000-0000-0000-0000000c9d01', '00000000-0000-0000-0000-0000000c9d02')),
  2,
  'the owning coach reads their own chat_suggestions and player_chat rows'
);

-- Another coach reads none of them, and cannot write one.
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c9b01", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_coachhelm_llm_calls
   WHERE coach_id = '00000000-0000-0000-0000-0000000c9a02'),
  0,
  'another coach reads none of them'
);
SELECT throws_ok(
  $$INSERT INTO public.golf_coachhelm_llm_calls
      (task, coach_id, prompt_hash, model_id, prompt_tokens, completion_tokens, cost_usd, verified)
    VALUES ('chat_suggestions', '00000000-0000-0000-0000-0000000c9b02', 'c9-forged', 'm', 1, 1, 0, true)$$,
  NULL,
  NULL,
  'a signed-in coach cannot write a ledger row themselves, under any key'
);

-- Anon reads nothing.
RESET ROLE;
SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.golf_coachhelm_llm_calls
   WHERE coach_id = '00000000-0000-0000-0000-0000000c9a02'),
  0,
  'anon reads none of them'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
