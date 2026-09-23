-- pgTAP contracts for 20260906140000_helm_jobs_pgmq_queues.sql (Database
-- Plan D6 — pgmq job queues with dead letters).
--
-- Covers: the enqueue/dedupe/read/ack/fail/dead-letter contract on the
-- `coachhelm_analysis` queue (chosen arbitrarily; the facades are queue-
-- agnostic), and that anon/authenticated cannot execute any facade while
-- service_role can.

BEGIN;
\ir _helpers.sql

SELECT plan(18);

-- ============================================================================
-- Part 1 — anon/authenticated cannot execute any facade; service_role can.
-- ============================================================================
SELECT isnt(
  has_function_privilege('anon', 'public.helm_jobs_enqueue(text, jsonb, text)', 'EXECUTE'),
  true,
  'anon cannot execute helm_jobs_enqueue'
);
SELECT isnt(
  has_function_privilege('authenticated', 'public.helm_jobs_enqueue(text, jsonb, text)', 'EXECUTE'),
  true,
  'authenticated cannot execute helm_jobs_enqueue'
);
SELECT ok(
  has_function_privilege('service_role', 'public.helm_jobs_enqueue(text, jsonb, text)', 'EXECUTE'),
  'service_role can execute helm_jobs_enqueue'
);
SELECT isnt(
  has_function_privilege('authenticated', 'public.helm_jobs_read_batch(text, integer, integer)', 'EXECUTE'),
  true,
  'authenticated cannot execute helm_jobs_read_batch'
);
SELECT isnt(
  has_function_privilege('authenticated', 'public.helm_jobs_ack(text, bigint)', 'EXECUTE'),
  true,
  'authenticated cannot execute helm_jobs_ack'
);
SELECT isnt(
  has_function_privilege('authenticated', 'public.helm_jobs_fail(text, bigint, text)', 'EXECUTE'),
  true,
  'authenticated cannot execute helm_jobs_fail'
);
SELECT isnt(
  has_function_privilege('authenticated', 'public.helm_jobs_depth()', 'EXECUTE'),
  true,
  'authenticated cannot execute helm_jobs_depth'
);
SELECT isnt(
  has_function_privilege('anon', 'public.helm_jobs_list_dead_letters(text, integer)', 'EXECUTE'),
  true,
  'anon cannot execute helm_jobs_list_dead_letters'
);

-- ============================================================================
-- Part 2 — enqueue / dedupe / read / ack contract.
-- ============================================================================
SELECT ok(
  public.helm_jobs_enqueue('coachhelm_analysis', '{"roundId":"r1"}'::jsonb, 'dedupe-r1') IS NOT NULL,
  'enqueue returns a msg_id'
);

-- Same dedupe_key within 24h returns the SAME msg_id and does not add a
-- second message to the queue.
SELECT is(
  (SELECT public.helm_jobs_enqueue('coachhelm_analysis', '{"roundId":"r1"}'::jsonb, 'dedupe-r1')),
  (SELECT msg_id FROM helm_jobs.dedupe_keys WHERE queue = 'coachhelm_analysis' AND dedupe_key = 'dedupe-r1'),
  'a repeated dedupe_key within 24h returns the already-queued msg_id'
);

SELECT is(
  (SELECT count(*)::int FROM pgmq.q_coachhelm_analysis),
  1,
  'dedupe prevented a second message from being enqueued'
);

-- A distinct dedupe_key enqueues a second, independent message.
SELECT ok(
  public.helm_jobs_enqueue('coachhelm_analysis', '{"roundId":"r2"}'::jsonb, 'dedupe-r2') IS NOT NULL,
  'a distinct dedupe_key enqueues independently'
);

SELECT is(
  (SELECT count(*)::int FROM pgmq.q_coachhelm_analysis),
  2,
  'queue now holds two independent messages'
);

-- read_batch surfaces both, then ack removes exactly one.
SELECT is(
  (SELECT count(*)::int FROM public.helm_jobs_read_batch('coachhelm_analysis', 10, 30)),
  2,
  'read_batch returns both pending messages'
);

SELECT ok(
  (SELECT public.helm_jobs_ack(
    'coachhelm_analysis',
    (SELECT msg_id FROM helm_jobs.dedupe_keys WHERE dedupe_key = 'dedupe-r1')
  )),
  'ack removes the acknowledged message'
);

SELECT is(
  (SELECT count(*)::int FROM pgmq.q_coachhelm_analysis),
  1,
  'exactly one message remains after ack'
);

-- ============================================================================
-- Part 3 — fail-and-dead-letter contract. Drive the remaining message
-- (dedupe-r2) through 5 read/fail cycles and confirm it lands in
-- helm_jobs.dead_letters, not the live queue.
-- ============================================================================
DO $$
DECLARE
  v_msg_id bigint;
  v_i int;
BEGIN
  SELECT msg_id INTO v_msg_id FROM helm_jobs.dedupe_keys WHERE dedupe_key = 'dedupe-r2';
  FOR v_i IN 1..5 LOOP
    -- helm_jobs_fail backs the message off (set_vt 20s, 40s, ...), which hides
    -- it from the next read and would freeze read_ct at 1. Collapse the
    -- backoff so each cycle is a real read, as the consumer sees it later.
    PERFORM pgmq.set_vt('coachhelm_analysis', v_msg_id, 0);
    PERFORM msg_id FROM public.helm_jobs_read_batch('coachhelm_analysis', 1, 0);
    PERFORM public.helm_jobs_fail('coachhelm_analysis', v_msg_id, 'synthetic pgTAP failure');
  END LOOP;
END $$;

SELECT is(
  (SELECT count(*)::int FROM pgmq.q_coachhelm_analysis),
  0,
  'the message is gone from the live queue after 5 failures'
);

SELECT is(
  (SELECT count(*)::int FROM helm_jobs.dead_letters WHERE queue = 'coachhelm_analysis'),
  1,
  'the message landed in dead_letters after exhausting attempts'
);

SELECT * FROM finish();
ROLLBACK;
