-- pgTAP contract for 20261107090200_golf_conversation_list_rpc_privacy.sql (Messages v2 package M, priority privacy fix).
--
-- get_golf_conversations_with_details is SECURITY DEFINER and used to return users.email for every co-participant of every
-- conversation the caller was in. It now returns display names (golf_players first + last, golf_coaches full_name, else
-- 'Unknown') and never an e-mail address; unread_count counts from the caller's own last_read_at, not the shared `read` flag
-- (a never-read group counts every message from someone else; a never-read direct conversation keeps the flag);
-- participant_ids and participant_names are one ordered list; a non-member gets nothing; anon cannot call it.
-- Run on the real local stack 2026-11-10 (supabase test db --local).
--
-- Ids use the 0000...0f3xxx range. G: group chat created by coach A with A, B, C, D (D has no profile row).
-- DM: A and B. E is in nothing.

BEGIN;
\ir _helpers.sql

SELECT plan(18);

DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f31a1', 'f3-coach-secret@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f31b1', 'f3-bea-secret@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f31c1', 'f3-cy-secret@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f31d1', 'f3-noprofile-secret@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000f31e1', 'f3-outsider@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000f31a1', 'f3-coach-secret@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000f31b1', 'f3-bea-secret@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f31c1', 'f3-cy-secret@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f31d1', 'f3-noprofile-secret@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000f31e1', 'f3-outsider@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id, full_name) VALUES
    ('00000000-0000-0000-0000-0000000f3ca1', '00000000-0000-0000-0000-0000000f31a1', 'Coach Carter')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-0000000f3b01', '00000000-0000-0000-0000-0000000f31b1', 'Bea', 'Player'),
    ('00000000-0000-0000-0000-0000000f3b02', '00000000-0000-0000-0000-0000000f31c1', 'Cy', NULL)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.golf_conversations (id, created_by, is_team_chat, title) VALUES
    ('00000000-0000-0000-0000-0000000f32a1', '00000000-0000-0000-0000-0000000f31a1', true, 'G group'),
    ('00000000-0000-0000-0000-0000000f32b1', '00000000-0000-0000-0000-0000000f31a1', false, NULL)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id, joined_at, last_read_at) VALUES
    ('00000000-0000-0000-0000-0000000f32a1', '00000000-0000-0000-0000-0000000f31a1', '2026-11-01 09:00:00+00', NULL),
    ('00000000-0000-0000-0000-0000000f32a1', '00000000-0000-0000-0000-0000000f31b1', '2026-11-01 09:01:00+00', '2026-11-01 10:03:00+00'),
    ('00000000-0000-0000-0000-0000000f32a1', '00000000-0000-0000-0000-0000000f31c1', '2026-11-01 09:02:00+00', NULL),
    ('00000000-0000-0000-0000-0000000f32a1', '00000000-0000-0000-0000-0000000f31d1', '2026-11-01 09:03:00+00', NULL),
    ('00000000-0000-0000-0000-0000000f32b1', '00000000-0000-0000-0000-0000000f31a1', '2026-11-01 09:00:00+00', NULL),
    ('00000000-0000-0000-0000-0000000f32b1', '00000000-0000-0000-0000-0000000f31b1', '2026-11-01 09:01:00+00', NULL)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, created_at, is_deleted) VALUES
    ('00000000-0000-0000-0000-0000000f33a1', '00000000-0000-0000-0000-0000000f32a1', '00000000-0000-0000-0000-0000000f31a1', 'A one',   '2026-11-01 10:00:00+00', false),
    ('00000000-0000-0000-0000-0000000f33a2', '00000000-0000-0000-0000-0000000f32a1', '00000000-0000-0000-0000-0000000f31a1', 'A two',   '2026-11-01 10:05:00+00', false),
    ('00000000-0000-0000-0000-0000000f33b1', '00000000-0000-0000-0000-0000000f32a1', '00000000-0000-0000-0000-0000000f31b1', 'B own',   '2026-11-01 10:06:00+00', false),
    ('00000000-0000-0000-0000-0000000f33c1', '00000000-0000-0000-0000-0000000f32a1', '00000000-0000-0000-0000-0000000f31c1', 'C one',   '2026-11-01 10:07:00+00', false),
    ('00000000-0000-0000-0000-0000000f33a3', '00000000-0000-0000-0000-0000000f32a1', '00000000-0000-0000-0000-0000000f31a1', '',        '2026-11-01 10:08:00+00', true),
    ('00000000-0000-0000-0000-0000000f33d1', '00000000-0000-0000-0000-0000000f32b1', '00000000-0000-0000-0000-0000000f31a1', 'DM hi',  '2026-11-01 10:00:00+00', false)
  ON CONFLICT DO NOTHING;
END $$;

-- Structure ------------------------------------------------------------------
SELECT ok(
  pg_get_functiondef('public.get_golf_conversations_with_details(uuid)'::regprocedure) NOT ILIKE '%email%'
  AND (SELECT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
         FROM pg_proc p WHERE p.oid = 'public.get_golf_conversations_with_details(uuid)'::regprocedure),
  'the RPC body names no e-mail column, is SECURITY DEFINER and pins search_path to empty'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_golf_conversations_with_details(uuid)', 'execute')
  AND NOT has_function_privilege('anon', 'public.get_golf_conversations_with_details(uuid)', 'execute'),
  'authenticated may call the RPC; anon may not'
);

-- As B (a player in G and in the DM) -----------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f31b1", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32a1'),
  1, 'B''s list includes G');
SELECT is(
  (SELECT participant_ids FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32a1'),
  ARRAY['00000000-0000-0000-0000-0000000f31a1', '00000000-0000-0000-0000-0000000f31b1',
        '00000000-0000-0000-0000-0000000f31c1', '00000000-0000-0000-0000-0000000f31d1']::uuid[],
  'participant_ids are in join order');
SELECT is(
  (SELECT participant_names FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32a1'),
  ARRAY['Coach Carter', 'Bea Player', 'Cy', 'Unknown'],
  'participant_names line up with participant_ids: coach full name, player first + last, a first name alone, Unknown');
SELECT is(
  (SELECT count(*)::int FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1') r,
     LATERAL unnest(r.participant_names) AS n WHERE n LIKE '%@%' OR n ILIKE '%secret%'),
  0, 'no returned name contains an e-mail address');
SELECT is(
  (SELECT unread_count FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32a1'),
  2::bigint, 'B''s unread in G is the two messages from others after B''s last_read_at (own and deleted excluded)');
SELECT is(
  (SELECT is_group AND participant_count = 4 FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32a1'),
  true, 'G is a group of four');
RESET ROLE;

-- Someone else opening the group flips the shared `read` flag (what mark_golf_messages_read did to everyone's count).
UPDATE public.golf_messages SET read = true WHERE conversation_id = '00000000-0000-0000-0000-0000000f32a1';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f31b1", "role": "authenticated"}';
SELECT is(
  (SELECT unread_count FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32a1'),
  2::bigint, 'a shared read flag set by another member does not clear B''s unread');
UPDATE public.golf_conversation_participants SET last_read_at = '2026-11-01 10:10:00+00'
  WHERE conversation_id = '00000000-0000-0000-0000-0000000f32a1' AND user_id = '00000000-0000-0000-0000-0000000f31b1';
SELECT is(
  (SELECT unread_count FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32a1'),
  0::bigint, 'B''s own last_read_at clears it');
RESET ROLE;

-- As A, who never read anything -------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f31a1", "role": "authenticated"}';
SELECT is(
  (SELECT unread_count FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31a1')
    WHERE id = '00000000-0000-0000-0000-0000000f32a1'),
  2::bigint, 'A, who has never read G, has B''s and C''s messages unread (own and deleted excluded)');
RESET ROLE;

-- A direct conversation nobody has read: the flag still decides, so direct messages read before last_read_at existed
-- do not come back as unread.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f31b1", "role": "authenticated"}';
SELECT is(
  (SELECT unread_count FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32b1'),
  1::bigint, 'B, who has never read the DM, has A''s unflagged message unread');
SELECT is(
  (SELECT is_group FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32b1'),
  false, 'the DM is not a group');
RESET ROLE;
UPDATE public.golf_messages SET read = true WHERE conversation_id = '00000000-0000-0000-0000-0000000f32b1';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f31b1", "role": "authenticated"}';
SELECT is(
  (SELECT unread_count FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32b1'),
  0::bigint, 'a DM read under the old flag stays read for a viewer with no last_read_at');
RESET ROLE;

-- Hidden rule unchanged: the DM B hid stays out until a newer message arrives ---------------------
UPDATE public.golf_conversation_participants SET hidden_at = '2026-11-01 10:30:00+00'
  WHERE conversation_id = '00000000-0000-0000-0000-0000000f32b1' AND user_id = '00000000-0000-0000-0000-0000000f31b1';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f31b1", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32b1'),
  0, 'a conversation B hid is not listed');
RESET ROLE;
INSERT INTO public.golf_messages (conversation_id, sender_id, content, created_at)
  VALUES ('00000000-0000-0000-0000-0000000f32b1', '00000000-0000-0000-0000-0000000f31a1', 'DM again', '2026-11-01 10:40:00+00');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f31b1", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')
    WHERE id = '00000000-0000-0000-0000-0000000f32b1'),
  1, 'and it comes back when a newer message arrives');
RESET ROLE;

-- As E, who is in nothing; and anon -------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000f31e1", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')),
  0, 'a user in no conversation gets nothing, even when passing someone else''s id as p_user_id');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.get_golf_conversations_with_details('00000000-0000-0000-0000-0000000f31b1')$$,
  '42501', NULL, 'anon cannot call the RPC');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
