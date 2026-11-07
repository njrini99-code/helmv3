-- pgTAP contract for 20261107090000_golf_participants_column_grants.sql (Messages v2 package M, priority security fix).
--
-- The exploit: golf_participants_update is `user_id = auth.uid()` only and `authenticated` could write every column, so a
-- member could re-point their own participant row at any conversation and read its messages. This suite acts as user B
-- (a plain member of conversation X) and proves every re-pointing write now fails, while the four columns the app writes
-- (last_read_at, notification_level, muted_until, hidden_at) still work, and that user C (not in X) sees nothing of X.
-- WRITTEN, NOT RUN where it was authored (no Docker): run with npm run test:rls before applying.
--
-- Ids use the 0000...0f1xxx range. A creates X and is in X with B; C creates Y and is alone in it.

BEGIN;
\ir _helpers.sql

SELECT plan(25);

CREATE FUNCTION public.f1_rows_affected(p_sql text) RETURNS integer
LANGUAGE plpgsql AS $f$
DECLARE n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $f$;

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f11a1', 'f1-a@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f11b1', 'f1-b@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f11c1', 'f1-c@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f11a1', 'f1-a@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f11b1', 'f1-b@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f11c1', 'f1-c@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title) VALUES
    ('00000000-0000-0000-0000-0000000f12a1', '00000000-0000-0000-0000-0000000f11a1', false, 'X: A and B'),
    ('00000000-0000-0000-0000-0000000f12b1', '00000000-0000-0000-0000-0000000f11c1', false, 'Y: C alone')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id, last_read_at) VALUES
    ('00000000-0000-0000-0000-0000000f12a1', '00000000-0000-0000-0000-0000000f11a1', '2026-11-01 10:00:00+00'),
    ('00000000-0000-0000-0000-0000000f12a1', '00000000-0000-0000-0000-0000000f11b1', '2026-11-01 10:00:00+00'),
    ('00000000-0000-0000-0000-0000000f12b1', '00000000-0000-0000-0000-0000000f11c1', '2026-11-01 10:00:00+00')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content) VALUES
    ('00000000-0000-0000-0000-0000000f13a1', '00000000-0000-0000-0000-0000000f12a1', '00000000-0000-0000-0000-0000000f11a1', 'hello B'),
    ('00000000-0000-0000-0000-0000000f13b1', '00000000-0000-0000-0000-0000000f12b1', '00000000-0000-0000-0000-0000000f11c1', 'private to Y')
  ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- Structure: the grants themselves
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.golf_conversation_participants', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.golf_conversation_participants', 'last_read_at', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.golf_conversation_participants', 'notification_level', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.golf_conversation_participants', 'muted_until', 'UPDATE')
  AND has_column_privilege('authenticated', 'public.golf_conversation_participants', 'hidden_at', 'UPDATE'),
  'authenticated has no table-level UPDATE and exactly the four state columns'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.golf_conversation_participants', 'conversation_id', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_conversation_participants', 'user_id', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_conversation_participants', 'id', 'UPDATE')
  AND NOT has_column_privilege('authenticated', 'public.golf_conversation_participants', 'joined_at', 'UPDATE'),
  'authenticated cannot update conversation_id, user_id, id or joined_at'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.golf_conversation_participants', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.golf_conversation_participants', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.golf_conversation_participants', 'TRUNCATE'),
  'anon holds no privilege on the participants table'
);

-- ---------------------------------------------------------------------------
-- The exploit, as user B (a member of X, not of Y)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f11b1", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.golf_messages WHERE conversation_id = '00000000-0000-0000-0000-0000000f12b1'),
  0, 'B cannot read Y''s messages before the attack');

SELECT throws_ok(
  $$UPDATE public.golf_conversation_participants SET conversation_id = '00000000-0000-0000-0000-0000000f12b1'
    WHERE user_id = '00000000-0000-0000-0000-0000000f11b1' AND conversation_id = '00000000-0000-0000-0000-0000000f12a1'$$,
  '42501', NULL, 'B cannot re-point their participant row at conversation Y');

SELECT is(
  (SELECT count(*)::int FROM public.golf_messages WHERE conversation_id = '00000000-0000-0000-0000-0000000f12b1'),
  0, 'B still cannot read Y''s messages after the attempt');
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants WHERE conversation_id = '00000000-0000-0000-0000-0000000f12b1'),
  0, 'B still sees none of Y''s participants');

SELECT throws_ok(
  $$INSERT INTO public.golf_messages (conversation_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-0000000f12b1', '00000000-0000-0000-0000-0000000f11b1', 'B posts into Y')$$,
  '42501', NULL, 'B cannot post into Y (the insert policy checks membership)');

SELECT throws_ok(
  $$UPDATE public.golf_conversation_participants SET user_id = '00000000-0000-0000-0000-0000000f11a1'
    WHERE user_id = '00000000-0000-0000-0000-0000000f11b1'$$,
  '42501', NULL, 'B cannot hand their participant row to another user');
SELECT throws_ok(
  $$UPDATE public.golf_conversation_participants SET joined_at = '2020-01-01'
    WHERE user_id = '00000000-0000-0000-0000-0000000f11b1'$$,
  '42501', NULL, 'B cannot back-date joined_at');
SELECT throws_ok(
  $$UPDATE public.golf_conversation_participants SET id = gen_random_uuid()
    WHERE user_id = '00000000-0000-0000-0000-0000000f11b1'$$,
  '42501', NULL, 'B cannot rewrite the row id');

-- Another member's row is out of reach even for the allowed columns.
SELECT is(
  public.f1_rows_affected($$UPDATE public.golf_conversation_participants SET last_read_at = now()
    WHERE user_id = '00000000-0000-0000-0000-0000000f11a1'$$),
  0, 'B updates 0 rows of A''s participant row (own-row policy)');

-- ---------------------------------------------------------------------------
-- The normal writes still work, as B
-- ---------------------------------------------------------------------------
SELECT lives_ok(
  $$UPDATE public.golf_conversation_participants SET last_read_at = '2026-11-02 09:00:00+00'
    WHERE conversation_id = '00000000-0000-0000-0000-0000000f12a1' AND user_id = '00000000-0000-0000-0000-0000000f11b1'$$,
  'B can still mark a conversation read (last_read_at)');
SELECT lives_ok(
  $$UPDATE public.golf_conversation_participants SET notification_level = 'muted', muted_until = '2026-12-01 00:00:00+00'
    WHERE conversation_id = '00000000-0000-0000-0000-0000000f12a1' AND user_id = '00000000-0000-0000-0000-0000000f11b1'$$,
  'B can still mute (notification_level + muted_until)');
SELECT lives_ok(
  $$UPDATE public.golf_conversation_participants SET hidden_at = '2026-11-03 09:00:00+00'
    WHERE conversation_id = '00000000-0000-0000-0000-0000000f12a1' AND user_id = '00000000-0000-0000-0000-0000000f11b1'$$,
  'B can still hide a conversation (hidden_at)');
SELECT lives_ok(
  $$UPDATE public.golf_conversation_participants SET hidden_at = NULL, notification_level = 'all', muted_until = NULL
    WHERE conversation_id = '00000000-0000-0000-0000-0000000f12a1' AND user_id = '00000000-0000-0000-0000-0000000f11b1'$$,
  'B can still unhide and unmute');
RESET ROLE;

SELECT is(
  (SELECT last_read_at FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-0000000f12a1' AND user_id = '00000000-0000-0000-0000-0000000f11b1'),
  '2026-11-02 09:00:00+00'::timestamptz, 'the last_read_at write landed');
SELECT is(
  (SELECT conversation_id FROM public.golf_conversation_participants
    WHERE user_id = '00000000-0000-0000-0000-0000000f11b1'),
  '00000000-0000-0000-0000-0000000f12a1'::uuid, 'B''s row is still in conversation X (read as the owner)');
SELECT is(
  (SELECT last_read_at FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-0000000f12a1' AND user_id = '00000000-0000-0000-0000-0000000f11a1'),
  '2026-11-01 10:00:00+00'::timestamptz, 'A''s row was not touched by B');

-- ---------------------------------------------------------------------------
-- User C is not in X: sees nothing of it
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f11c1", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants WHERE conversation_id = '00000000-0000-0000-0000-0000000f12a1'),
  0, 'a non-member sees none of X''s participants');
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages WHERE conversation_id = '00000000-0000-0000-0000-0000000f12a1'),
  0, 'a non-member sees none of X''s messages');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT 1 FROM public.golf_conversation_participants$$, '42501', NULL, 'anon cannot read participants');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- The trigger on its own: widen the grant inside this transaction (rolled back) and the guard still refuses
-- ---------------------------------------------------------------------------
GRANT UPDATE ON public.golf_conversation_participants TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f11b1", "role": "authenticated"}';
SELECT throws_ok(
  $$UPDATE public.golf_conversation_participants SET conversation_id = '00000000-0000-0000-0000-0000000f12b1'
    WHERE user_id = '00000000-0000-0000-0000-0000000f11b1'$$,
  '42501', 'A participant row cannot be moved',
  'with the grant widened, the identity guard still refuses a re-point');
SELECT lives_ok(
  $$UPDATE public.golf_conversation_participants SET last_read_at = '2026-11-04 09:00:00+00'
    WHERE user_id = '00000000-0000-0000-0000-0000000f11b1'$$,
  'and the guard lets a normal state write through');
RESET ROLE;
SELECT lives_ok(
  $$UPDATE public.golf_conversation_participants SET conversation_id = '00000000-0000-0000-0000-0000000f12a1'
    WHERE user_id = '00000000-0000-0000-0000-0000000f11b1'$$,
  'the table owner (admin repair, definer code) is not blocked by the guard');

SELECT * FROM finish();
ROLLBACK;
