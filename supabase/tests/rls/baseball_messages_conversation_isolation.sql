-- pgTAP contracts for baseball_messages — a one-character-class typo that
-- opened every private conversation in the database, for read AND write.
--
-- THE BUG. Three baseline policies share it:
--
--     -- 20260527000000_prod_public_baseline.sql:17377
--     USING (EXISTS (
--       SELECT 1 FROM public.baseball_conversation_participants cp
--       WHERE cp.conversation_id = cp.conversation_id
--         AND cp.user_id = auth.uid()))
--
-- `cp.conversation_id = cp.conversation_id` is a column compared to itself —
-- true for every row. The intended correlation,
-- `cp.conversation_id = baseball_messages.conversation_id`, is missing, so the
-- predicate means "does the caller participate in ANY conversation". One
-- conversation anywhere buys every private message everywhere.
--
-- WHY IT SURVIVED INSPECTION. `baseball_messages_select` (line 18055) is the
-- same rule written CORRECTLY and is live at the same time. Permissive
-- policies for one command are OR'd, so the broken one wins outright — a
-- correct policy next to a broken one is not a mitigation. Anyone reading this
-- file sees the right answer twenty lines below the wrong one and moves on.
--
-- The write cases are worse than the read. "Users can send baseball messages"
-- (INSERT) keeps `sender_id = auth.uid()`, so the sender cannot be forged, but
-- the CONVERSATION is unconstrained: a rival program's coach can post into
-- another program's private coach/player thread under their own name.
--
-- THE FIX (migration B SECTION 5) is three DROPs and no CREATE. Each broken
-- policy has a correctly-correlated counterpart already live
-- (baseball_messages_select / _insert / _update / _update_read), so removing
-- the broken ones cannot take away anything a real participant could do.
--
-- ASSERTS THE POST-B STATE. Against an A-only database the policy group fails,
-- correctly — the broken policies are still there.
--
-- The behavioural half matters more than usual here. The structural
-- assertions would pass against a database where the typo had been "fixed" by
-- deleting the wrong three policies; only the behavioural ones prove a real
-- participant kept their access while an outsider lost theirs.
--
-- Plan arithmetic, per group: 4 (broken gone) + 3 (correct survive)
-- + 5 (behaviour) = 12. Counted rather than eyeballed — a miscounted plan
-- aborts the runner's `set -euo pipefail` loop and silently skips every
-- alphabetically later suite.

BEGIN;
\ir _helpers.sql

SELECT plan(12);

-- ============================================================================
-- GROUP 1 — the three broken policies are gone, and the typo cannot return.
-- ============================================================================

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_messages'
      AND p.polname = 'Users can view baseball messages'
  ),
  'the broken SELECT policy "Users can view baseball messages" is GONE'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_messages'
      AND p.polname = 'Users can send baseball messages'
  ),
  'the broken INSERT policy "Users can send baseball messages" is GONE — no posting into another program''s thread'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_messages'
      AND p.polname = 'Users can update baseball message read status'
  ),
  'the broken UPDATE policy "Users can update baseball message read status" is GONE'
);

-- The generic guard: no policy on this table may compare a column to itself.
-- Catches the typo returning under any name, on any command.
SELECT is(
  (SELECT count(*)::int
     FROM pg_policy p
     JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_messages'
      AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
           || ' ' || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
          LIKE '%cp.conversation_id = cp.conversation_id%'),
  0,
  'no baseball_messages policy compares conversation_id to itself — the typo cannot come back'
);

-- ============================================================================
-- GROUP 2 — the correctly-correlated policies survived. The fix was to drop
-- the broken three, not to drop three at random.
-- ============================================================================

SELECT ok(
  position('baseball_messages.conversation_id' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_messages'
       AND p.polname = 'baseball_messages_select'
  ), '')) > 0,
  'baseball_messages_select survives AND correlates to baseball_messages.conversation_id'
);

SELECT ok(
  position('baseball_messages.conversation_id' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_messages'
       AND p.polname = 'baseball_messages_insert'
  ), '')) > 0,
  'baseball_messages_insert survives AND its WITH CHECK correlates properly'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_messages'
      AND p.polname IN ('baseball_messages_update', 'baseball_messages_update_read')
  ),
  'a correctly-scoped UPDATE policy survives, so marking a message read still works'
);

-- ============================================================================
-- SEED — two conversations belonging to two different programs. User A is a
-- participant in conversation A ONLY. Under the broken policy that single
-- membership let them read and write conversation B.
--
-- Ids in the 00000010* range; checked against every sibling suite.
-- ============================================================================
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000100101', 'msguser_a@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000100201', 'msguser_b@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000100101', 'msguser_a@helm.test', 'coach'),
    ('00000000-0000-0000-0000-000000100201', 'msguser_b@helm.test', 'coach')
  ON CONFLICT DO NOTHING;

  -- Conversation A — user A is in it.
  INSERT INTO public.baseball_conversations (id, title, created_by)
    VALUES ('00000000-0000-0000-0000-000000100301', 'Program A thread',
            '00000000-0000-0000-0000-000000100101')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-000000100301',
            '00000000-0000-0000-0000-000000100101')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_messages (id, conversation_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-000000100401',
            '00000000-0000-0000-0000-000000100301',
            '00000000-0000-0000-0000-000000100101', 'Message in A')
  ON CONFLICT DO NOTHING;

  -- Conversation B — a different program. User A is NOT in it.
  INSERT INTO public.baseball_conversations (id, title, created_by)
    VALUES ('00000000-0000-0000-0000-000000100302', 'Program B private thread',
            '00000000-0000-0000-0000-000000100201')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_conversation_participants (conversation_id, user_id)
    VALUES ('00000000-0000-0000-0000-000000100302',
            '00000000-0000-0000-0000-000000100201')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.baseball_messages (id, conversation_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-000000100402',
            '00000000-0000-0000-0000-000000100302',
            '00000000-0000-0000-0000-000000100201', 'Private to B')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- GROUP 3 — behavioural, as user A: one conversation, and only one.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000100101", "role": "authenticated"}';

SELECT is(
  (SELECT content FROM public.baseball_messages
    WHERE id = '00000000-0000-0000-0000-000000100401'),
  'Message in A',
  'user A CAN read their own conversation (the legitimate capability is preserved)'
);

-- THE FIX, read half. Under the broken policy this returned 'Private to B'.
SELECT is(
  (SELECT count(*)::int FROM public.baseball_messages
    WHERE id = '00000000-0000-0000-0000-000000100402'),
  0,
  'user A CANNOT read another program''s private message — the whole-database message leak is closed'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_messages),
  1,
  'user A''s unfiltered SELECT returns exactly their one conversation''s messages — no bulk read of every DM in the database'
);

-- THE FIX, write half. This is the one the read-only framing understates:
-- posting into a private thread you were never part of.
SELECT throws_ok(
  $$INSERT INTO public.baseball_messages (conversation_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-000000100302',
            '00000000-0000-0000-0000-000000100101', 'injected')$$,
  '42501',
  NULL,
  'user A CANNOT post into a conversation they are not part of — sender_id was never the hole, the conversation was'
);

SELECT lives_ok(
  $$INSERT INTO public.baseball_messages (conversation_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-000000100301',
            '00000000-0000-0000-0000-000000100101', 'legitimate reply')$$,
  'user A CAN still post into their own conversation — the drop removed only the unintended access'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
