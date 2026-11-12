-- pgTAP contract for 20261107090000_golf_participants_column_grants.sql (Messages v2 package M, priority security fix).
--
-- The exploit: golf_participants_update is `user_id = auth.uid()` only and `authenticated` could write every column, so a
-- member could re-point their own participant row at any conversation and read its messages. This suite acts as user B
-- (a plain member of conversation X) and proves every re-pointing write now fails, while the four columns the app writes
-- (last_read_at, notification_level, muted_until, hidden_at) still work, and that user C (not in X) sees nothing of X.
-- It also proves authenticated lost TRUNCATE (which ignores RLS), TRIGGER, MAINTAIN and REFERENCES on the table.
-- Runs on the local stack with npm run test:rls (first real run 2026-11-10).
--
-- Ids use the 0000...0f1xxx range. A creates X and is in X with B; C creates Y and is alone in it.

BEGIN;
\ir _helpers.sql

SELECT plan(32);

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
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.golf_conversation_participants', 'TRUNCATE, MAINTAIN, TRIGGER, REFERENCES')
  AND has_table_privilege('authenticated', 'public.golf_conversation_participants', 'SELECT')
  AND has_table_privilege('authenticated', 'public.golf_conversation_participants', 'INSERT')
  AND has_table_privilege('authenticated', 'public.golf_conversation_participants', 'DELETE'),
  'authenticated keeps SELECT, INSERT and DELETE and holds none of TRUNCATE, MAINTAIN, TRIGGER, REFERENCES'
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

-- TRUNCATE ignores RLS: with the privilege, one statement empties every conversation's membership.
SELECT throws_ok(
  $$TRUNCATE public.golf_conversation_participants$$,
  '42501', NULL, 'B cannot TRUNCATE the participants table');
-- TRIGGER is all it takes to attach a trigger function the role may execute.
SELECT throws_ok(
  $$CREATE TRIGGER f1_probe BEFORE INSERT ON public.golf_conversation_participants
    FOR EACH ROW EXECUTE FUNCTION public.golf_participants_identity_guard()$$,
  '42501', NULL, 'B cannot attach a trigger to the participants table');

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
-- INSERT: a creator cannot pre-set another member's private state (security review 2026-11-10, item 4).
-- INSERT is granted table-wide, so before the insert guard a creator could add a member with hidden_at,
-- last_read_at, muted_until and notification_level already set: that person never saw the chat.
-- ---------------------------------------------------------------------------
RESET ROLE;
-- A creator adds only people on the conversation's team, so A and B need one. Replica mode: no roster trigger runs.
SET LOCAL session_replication_role = replica;
INSERT INTO public.organizations (id, name, type) VALUES
  ('00000000-0000-0000-0000-0000000f1401', 'F1 Org', 'college');
INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
  ('00000000-0000-0000-0000-0000000f1501', 'F1 Team', 'F1TEAM01', '00000000-0000-0000-0000-0000000f1401');
INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
  ('00000000-0000-0000-0000-0000000f16a1', '00000000-0000-0000-0000-0000000f11a1', 'Aone', 'Player'),
  ('00000000-0000-0000-0000-0000000f16b1', '00000000-0000-0000-0000-0000000f11b1', 'Bone', 'Player');
INSERT INTO public.golf_team_members (player_id, team_id, status) VALUES
  ('00000000-0000-0000-0000-0000000f16a1', '00000000-0000-0000-0000-0000000f1501', 'active'),
  ('00000000-0000-0000-0000-0000000f16b1', '00000000-0000-0000-0000-0000000f1501', 'active');
SET LOCAL session_replication_role = origin;
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.golf_conversation_participants'::regclass
      AND tgname = 'golf_participants_insert_guard' AND NOT tgisinternal AND tgenabled = 'O'
      AND (tgtype & 1) = 1 AND (tgtype & 2) = 2 AND (tgtype & 4) = 4),
  'golf_participants_insert_guard is a BEFORE INSERT row trigger');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f11a1", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, created_by, team_id, is_team_chat, title)
      VALUES ('00000000-0000-0000-0000-0000000f12c1', '00000000-0000-0000-0000-0000000f11a1',
              '00000000-0000-0000-0000-0000000f1501', false, 'Z: A then B');
    INSERT INTO public.golf_conversation_participants
      (conversation_id, user_id, joined_at, last_read_at, hidden_at, muted_until, notification_level)
      VALUES ('00000000-0000-0000-0000-0000000f12c1', '00000000-0000-0000-0000-0000000f11a1',
              '2001-01-01', '2099-01-01', '2099-01-01', '2099-01-01', 'muted');
    INSERT INTO public.golf_conversation_participants
      (conversation_id, user_id, joined_at, last_read_at, hidden_at, muted_until, notification_level)
      VALUES ('00000000-0000-0000-0000-0000000f12c1', '00000000-0000-0000-0000-0000000f11b1',
              '2001-01-01', '2099-01-01', '2099-01-01', '2099-01-01', 'muted')$$,
  'a creator still adds themself and then another member, whatever state columns the insert carries');
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-0000000f12c1'
      AND joined_at = now() AND last_read_at IS NULL AND hidden_at IS NULL AND muted_until IS NULL
      AND notification_level = 'all'),
  2, 'both rows land with joined_at = now(), nothing read, not hidden, not muted, level all');
DELETE FROM public.golf_conversation_participants
WHERE conversation_id = '00000000-0000-0000-0000-0000000f12c1';
INSERT INTO public.golf_conversation_participants (conversation_id, user_id, joined_at, hidden_at, notification_level)
VALUES ('00000000-0000-0000-0000-0000000f12b1', '00000000-0000-0000-0000-0000000f11a1',
        '2026-11-02 08:00:00+00', '2026-11-02 09:00:00+00', 'mentions');
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-0000000f12b1' AND user_id = '00000000-0000-0000-0000-0000000f11a1'
      AND joined_at = '2026-11-02 08:00:00+00' AND hidden_at = '2026-11-02 09:00:00+00'
      AND notification_level = 'mentions'),
  1, 'the table owner (definer code, the service role, admin repair) inserts a row as written');
DELETE FROM public.golf_conversation_participants
WHERE conversation_id = '00000000-0000-0000-0000-0000000f12b1' AND user_id = '00000000-0000-0000-0000-0000000f11a1';

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
