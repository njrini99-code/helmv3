-- Does Messages still work with the whole release set applied?
--
-- Every other pgTAP file of this set proves that something is refused. This one proves the opposite: each write and
-- read the app makes in Messages, and each way the app puts a player on a roster, SUCCEEDS as a real coach session,
-- a real assistant-coach session and a real player session (role authenticated, the user's own JWT subject), with
-- 20261107090000, 090100, 090200, 20261110090000, 090050, 090200, 090300, 090400, 090500, 090600 and 090700 applied.
-- The statements are the app's own, column for column, taken from a sweep of src/** at main (743cb23a1) and at the
-- build production serves (d0f467a73). The call sites are named on each assertion (file:line at main). d0f467a73
-- makes the same calls except the three it does not have yet: poll votes (golf_message_responses), pins
-- (golf_pin_conversation) and availability.
--
-- What the app does not offer, so nothing here covers it: a player creating a group (createGolfTeamBroadcast is
-- coach-only, messages.ts:894), renaming a group (no code updates golf_conversations.title), an "unhide" write (a
-- hidden conversation comes back when a later message arrives), adding a player who has no account (no such insert).
-- "Invite" sends the team's join code; the roster row is then written by golf_join_team_with_code.
-- Typing is a Realtime broadcast on the public topic golf-conversation:<id> (use-golf-messages.ts:965,
-- use-typing-by-conversation.ts:46): no table, no policy, nothing in the release set touches it.
-- Uploading an attachment's bytes goes through the Storage API; its policy asks user_conversation_ids(), which is
-- asserted here. The upload itself is not run in pgTAP.
--
-- People: C head coach, A assistant coach, P1 and P2 active players, P3 and P4 with an account and no team yet.
-- Ids use the 0000...0d1xxx range.

BEGIN;
\ir _helpers.sql

SELECT plan(47);

CREATE FUNCTION public.d1_in(p_conversation uuid, p_user uuid) RETURNS integer
LANGUAGE sql AS $f$
  SELECT count(*)::int FROM public.golf_conversation_participants
  WHERE conversation_id = p_conversation AND user_id = p_user;
$f$;
CREATE FUNCTION public.d1_channel() RETURNS uuid
LANGUAGE sql AS $f$
  SELECT id FROM public.golf_conversations
  WHERE team_id = '00000000-0000-0000-0000-0000000d1201' AND is_team_channel;
$f$;

SET LOCAL session_replication_role = replica;
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000d1c01', 'd1-coach@helm.test',     'authenticated'),
    ('00000000-0000-0000-0000-0000000d1c02', 'd1-assistant@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000d1b01', 'd1-p1@helm.test',        'authenticated'),
    ('00000000-0000-0000-0000-0000000d1b02', 'd1-p2@helm.test',        'authenticated'),
    ('00000000-0000-0000-0000-0000000d1b03', 'd1-p3@helm.test',        'authenticated'),
    ('00000000-0000-0000-0000-0000000d1b04', 'd1-p4@helm.test',        'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000d1c01', 'd1-coach@helm.test',     'coach'),
    ('00000000-0000-0000-0000-0000000d1c02', 'd1-assistant@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000d1b01', 'd1-p1@helm.test',        'player'),
    ('00000000-0000-0000-0000-0000000d1b02', 'd1-p2@helm.test',        'player'),
    ('00000000-0000-0000-0000-0000000d1b03', 'd1-p3@helm.test',        'player'),
    ('00000000-0000-0000-0000-0000000d1b04', 'd1-p4@helm.test',        'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-0000000d1101', 'D1 Org', 'college');
  INSERT INTO public.golf_teams (id, name, join_code, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000d1201', 'D1 Team', 'D1TEAM01', '00000000-0000-0000-0000-0000000d1101');
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000d1301', '00000000-0000-0000-0000-0000000d1c01', '00000000-0000-0000-0000-0000000d1101'),
    ('00000000-0000-0000-0000-0000000d1302', '00000000-0000-0000-0000-0000000d1c02', '00000000-0000-0000-0000-0000000d1101')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    ('00000000-0000-0000-0000-0000000d1201', '00000000-0000-0000-0000-0000000d1301', 'head_coach',      true),
    ('00000000-0000-0000-0000-0000000d1201', '00000000-0000-0000-0000-0000000d1302', 'assistant_coach', false);
  INSERT INTO public.golf_players (id, user_id, first_name, last_name) VALUES
    ('00000000-0000-0000-0000-0000000d1401', '00000000-0000-0000-0000-0000000d1b01', 'Pone',   'Player'),
    ('00000000-0000-0000-0000-0000000d1402', '00000000-0000-0000-0000-0000000d1b02', 'Ptwo',   'Player'),
    ('00000000-0000-0000-0000-0000000d1403', '00000000-0000-0000-0000-0000000d1b03', 'Pthree', 'Joins'),
    ('00000000-0000-0000-0000-0000000d1404', '00000000-0000-0000-0000-0000000d1b04', 'Pfour',  'Asks')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (player_id, team_id, status) VALUES
    ('00000000-0000-0000-0000-0000000d1401', '00000000-0000-0000-0000-0000000d1201', 'active'),
    ('00000000-0000-0000-0000-0000000d1402', '00000000-0000-0000-0000-0000000d1201', 'active');
END $$;
SET LOCAL session_replication_role = origin;
-- The team's channel, created and filled the way 20261110090300 / 090500 do it.
SELECT helm_private.golf_ensure_team_channel('00000000-0000-0000-0000-0000000d1201');

-- ===========================================================================
-- Head coach C
-- ===========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1c01", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, title, is_team_chat, created_by, created_at, updated_at)
      VALUES ('00000000-0000-0000-0000-0000000d1500', '00000000-0000-0000-0000-0000000d1201', 'Travel squad', true,
              '00000000-0000-0000-0000-0000000d1c01', now(), now());
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id, joined_at) VALUES
      ('00000000-0000-0000-0000-0000000d1500', '00000000-0000-0000-0000-0000000d1c01', now()),
      ('00000000-0000-0000-0000-0000000d1500', '00000000-0000-0000-0000-0000000d1b01', now()),
      ('00000000-0000-0000-0000-0000000d1500', '00000000-0000-0000-0000-0000000d1b02', now())$$,
  'coach creates a group with two players (createGolfTeamBroadcast, messages.ts:1050 + :1080)');
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read)
      VALUES ('00000000-0000-0000-0000-0000000d1601', '00000000-0000-0000-0000-0000000d1500',
              '00000000-0000-0000-0000-0000000d1c01', 'Tee times are up', false);
    UPDATE public.golf_conversations SET updated_at = now() WHERE id = '00000000-0000-0000-0000-0000000d1500'$$,
  'coach sends a message and bumps the conversation (sendMessage, messages.ts:170 + :277)');
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read, notify_anyway)
      VALUES ('00000000-0000-0000-0000-0000000d1602', '00000000-0000-0000-0000-0000000d1500',
              '00000000-0000-0000-0000-0000000d1c01', 'Bus leaves at 6', false, true)$$,
  'coach sends with "notify anyway" (sendMessage, messages.ts:170, flag class_awareness_v1)');
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, created_by, created_at, updated_at, team_id)
      VALUES ('00000000-0000-0000-0000-0000000d1501', '00000000-0000-0000-0000-0000000d1c01', now(), now(),
              '00000000-0000-0000-0000-0000000d1201');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id, joined_at)
      VALUES ('00000000-0000-0000-0000-0000000d1501', '00000000-0000-0000-0000-0000000d1c01', now());
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id, joined_at)
      VALUES ('00000000-0000-0000-0000-0000000d1501', '00000000-0000-0000-0000-0000000d1b01', now())$$,
  'coach starts a direct conversation with a player (createConversation, messages.ts:459 + :523 + :527)');
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-0000000d1500', '00000000-0000-0000-0000-0000000d1c02')$$,
  'coach adds the assistant coach to the group (addGolfGroupMember, messages.ts:2039)');
SELECT lives_ok(
  $$DELETE FROM public.golf_conversation_participants
      WHERE conversation_id = '00000000-0000-0000-0000-0000000d1500' AND user_id = '00000000-0000-0000-0000-0000000d1b02'$$,
  'coach removes a player from the group (removeGolfGroupMember, messages.ts:2119)');
SELECT lives_ok(
  $$INSERT INTO public.golf_conversation_participants (conversation_id, user_id, joined_at)
      VALUES ('00000000-0000-0000-0000-0000000d1500', '00000000-0000-0000-0000-0000000d1b02', now())$$,
  'coach sends to the same audience again and the missing player is put back (createGolfTeamBroadcast reuse, messages.ts:1028)');
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-0000000d1500'),
  4, 'the group holds the coach, the assistant and both players');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1c01", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read, kind, payload)
      VALUES ('00000000-0000-0000-0000-0000000d1603', '00000000-0000-0000-0000-0000000d1500',
              '00000000-0000-0000-0000-0000000d1c01', 'Poll: Van time?', false, 'poll',
              '{"v":1,"question":"Van time?","options":[{"id":"o1","label":"7:00"},{"id":"o2","label":"7:30"}],"multi":false,"closes_at":null,"closed_at":null}');
    UPDATE public.golf_conversations SET updated_at = now() WHERE id = '00000000-0000-0000-0000-0000000d1500'$$,
  'coach creates a poll (createGolfPoll, message-polls.ts:97 + :130)');
SELECT lives_ok(
  $$SELECT public.golf_pin_conversation('00000000-0000-0000-0000-0000000d1500', true)$$,
  'coach pins the group (use-conversation-pins.ts:86)');
SELECT is(
  (SELECT count(*)::int FROM public.get_golf_conversations_with_details((SELECT auth.uid()))),
  3, 'coach opens the inbox: the team channel, the group and the direct conversation (use-golf-messages.ts:1547)');

-- ===========================================================================
-- Player P1
-- ===========================================================================
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1b01", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.get_golf_conversations_with_details((SELECT auth.uid()))),
  3, 'player opens the inbox: the team channel, the group and the direct conversation');
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages WHERE conversation_id = '00000000-0000-0000-0000-0000000d1500'),
  3, 'player opens the group thread and reads its three messages');
SELECT lives_ok(
  $$SELECT count(*) FROM public.golf_conversations WHERE id = '00000000-0000-0000-0000-0000000d1500';
    SELECT count(*) FROM public.golf_conversation_participants WHERE conversation_id = '00000000-0000-0000-0000-0000000d1500';
    SELECT count(*) FROM public.golf_message_attachments WHERE message_id = '00000000-0000-0000-0000-0000000d1601';
    SELECT count(*) FROM public.golf_message_reactions WHERE message_id = '00000000-0000-0000-0000-0000000d1601';
    SELECT count(*) FROM public.golf_message_responses WHERE message_id = '00000000-0000-0000-0000-0000000d1603'$$,
  'player reads the thread''s conversation row, members, attachments, reactions and poll votes');
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read, reply_to_id)
      VALUES ('00000000-0000-0000-0000-0000000d1604', '00000000-0000-0000-0000-0000000d1500',
              '00000000-0000-0000-0000-0000000d1b01', 'Got it', false, '00000000-0000-0000-0000-0000000d1601');
    UPDATE public.golf_conversations SET updated_at = now() WHERE id = '00000000-0000-0000-0000-0000000d1500'$$,
  'player replies to the coach''s message (sendMessage with reply_to_id, messages.ts:170 + :277)');
SELECT lives_ok(
  $$UPDATE public.golf_messages SET content = 'Got it, thanks', edited_at = now()
      WHERE id = '00000000-0000-0000-0000-0000000d1604' AND sender_id = '00000000-0000-0000-0000-0000000d1b01'$$,
  'player edits their own message (editMessage, messages.ts:1297)');
SELECT lives_ok(
  $$INSERT INTO public.golf_message_reactions (message_id, user_id, emoji)
      VALUES ('00000000-0000-0000-0000-0000000d1601', '00000000-0000-0000-0000-0000000d1b01', 'thumbs_up');
    DELETE FROM public.golf_message_reactions
      WHERE message_id = '00000000-0000-0000-0000-0000000d1601' AND user_id = '00000000-0000-0000-0000-0000000d1b01'
        AND emoji = 'thumbs_up'$$,
  'player reacts and takes the reaction back (use-message-reactions.ts:155 + :156)');
SELECT lives_ok(
  $$INSERT INTO public.golf_message_responses (message_id, user_id, choice, updated_at)
      VALUES ('00000000-0000-0000-0000-0000000d1603', '00000000-0000-0000-0000-0000000d1b01', 'o1', now())
      ON CONFLICT (message_id, user_id) DO UPDATE SET choice = excluded.choice, updated_at = excluded.updated_at;
    INSERT INTO public.golf_message_responses (message_id, user_id, choice, updated_at)
      VALUES ('00000000-0000-0000-0000-0000000d1603', '00000000-0000-0000-0000-0000000d1b01', 'o2', now())
      ON CONFLICT (message_id, user_id) DO UPDATE SET choice = excluded.choice, updated_at = excluded.updated_at$$,
  'player votes in the poll and changes the vote (use-message-responses.ts:187)');
SELECT lives_ok(
  $$DELETE FROM public.golf_message_responses
      WHERE message_id = '00000000-0000-0000-0000-0000000d1603' AND user_id = '00000000-0000-0000-0000-0000000d1b01'$$,
  'player withdraws the vote (use-message-responses.ts:191)');
SELECT lives_ok(
  $$UPDATE public.golf_conversation_participants SET last_read_at = now()
      WHERE conversation_id = '00000000-0000-0000-0000-0000000d1500' AND user_id = '00000000-0000-0000-0000-0000000d1b01';
    SELECT public.mark_golf_messages_read('00000000-0000-0000-0000-0000000d1500')$$,
  'player marks the thread read (markMessagesAsRead, messages.ts:683 + :725)');
SELECT lives_ok(
  $$UPDATE public.golf_conversation_participants SET notification_level = 'muted', muted_until = now() + interval '8 hours'
      WHERE conversation_id = '00000000-0000-0000-0000-0000000d1500' AND user_id = '00000000-0000-0000-0000-0000000d1b01';
    UPDATE public.golf_conversation_participants SET notification_level = 'all', muted_until = NULL
      WHERE conversation_id = '00000000-0000-0000-0000-0000000d1500' AND user_id = '00000000-0000-0000-0000-0000000d1b01'$$,
  'player mutes the group for eight hours and unmutes it (message-mute.ts:59)');
SELECT lives_ok(
  $$UPDATE public.golf_conversation_participants SET hidden_at = now()
      WHERE conversation_id = '00000000-0000-0000-0000-0000000d1500' AND user_id = '00000000-0000-0000-0000-0000000d1b01'$$,
  'player hides the group (conversation-hide.ts:75)');
SELECT is(
  (SELECT count(*)::int FROM public.get_golf_conversations_with_details((SELECT auth.uid()))),
  2, 'the hidden group is out of the player''s inbox');
RESET ROLE;
-- Time passes and the coach writes again. One transaction has one now(), so the later message is dated by hand.
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read, created_at)
VALUES ('00000000-0000-0000-0000-0000000d1607', '00000000-0000-0000-0000-0000000d1500',
        '00000000-0000-0000-0000-0000000d1c01', 'One more thing', false, now() + interval '1 minute');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1b01", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.get_golf_conversations_with_details((SELECT auth.uid()))),
  3, 'a later message brings the hidden group back (the app has no unhide write)');
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read, has_attachments)
      VALUES ('00000000-0000-0000-0000-0000000d1605', '00000000-0000-0000-0000-0000000d1500',
              '00000000-0000-0000-0000-0000000d1b01', '', false, true);
    INSERT INTO public.golf_message_attachments (message_id, file_name, file_type, mime_type, file_size, storage_path)
      VALUES ('00000000-0000-0000-0000-0000000d1605', 'card.jpg', 'image', 'image/jpeg', 1234,
              'conversations/00000000-0000-0000-0000-0000000d1500/00000000-0000-0000-0000-0000000d1605/card.jpg');
    UPDATE public.golf_conversations SET updated_at = now() WHERE id = '00000000-0000-0000-0000-0000000d1500'$$,
  'player sends a photo (sendGolfMessageWithAttachments, message-attachments.ts:140 + :201 + :285)');
SELECT ok(
  '00000000-0000-0000-0000-0000000d1500' IN (SELECT public.user_conversation_ids((SELECT auth.uid()))),
  'the Storage policy''s test (the conversation is one of the player''s) holds, so the upload and download are allowed');
SELECT is(
  (SELECT count(*)::int FROM public.golf_message_attachments WHERE message_id = '00000000-0000-0000-0000-0000000d1605'),
  1, 'the player reads the attachment row back');
SELECT lives_ok(
  $$DELETE FROM public.golf_message_attachments WHERE message_id = '00000000-0000-0000-0000-0000000d1605';
    UPDATE public.golf_messages SET has_attachments = false WHERE id = '00000000-0000-0000-0000-0000000d1605'$$,
  'a failed upload is undone: attachment row removed, flag cleared (message-attachments.ts:618 + :273)');
SELECT lives_ok(
  $$UPDATE public.golf_messages SET is_deleted = true, content = ''
      WHERE id = '00000000-0000-0000-0000-0000000d1604' AND sender_id = '00000000-0000-0000-0000-0000000d1b01'$$,
  'player deletes their own message (deleteMessage, messages.ts:1374)');
RESET ROLE;
SELECT is(
  (SELECT content || '/' || is_deleted FROM public.golf_messages WHERE id = '00000000-0000-0000-0000-0000000d1604'),
  '/true', 'the deleted message is blanked and flagged');

-- ===========================================================================
-- Head coach C again: the poll
-- ===========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1c01", "role": "authenticated"}';
SELECT lives_ok(
  $$UPDATE public.golf_messages SET payload = payload || jsonb_build_object('closed_at', now())
      WHERE id = '00000000-0000-0000-0000-0000000d1603' AND sender_id = '00000000-0000-0000-0000-0000000d1c01'$$,
  'coach closes the poll (closeGolfPoll, message-polls.ts:164)');
SELECT lives_ok(
  $$UPDATE public.golf_messages SET is_deleted = true, content = '', payload = NULL
      WHERE id = '00000000-0000-0000-0000-0000000d1603' AND sender_id = '00000000-0000-0000-0000-0000000d1c01'$$,
  'coach deletes the poll message (deleteMessage on a poll, messages.ts:1374)');

-- ===========================================================================
-- Player P2: a direct conversation with the coach, then leaving the group
-- ===========================================================================
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1b02", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, created_by, created_at, updated_at, team_id)
      VALUES ('00000000-0000-0000-0000-0000000d1502', '00000000-0000-0000-0000-0000000d1b02', now(), now(),
              '00000000-0000-0000-0000-0000000d1201');
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id, joined_at)
      VALUES ('00000000-0000-0000-0000-0000000d1502', '00000000-0000-0000-0000-0000000d1b02', now());
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id, joined_at)
      VALUES ('00000000-0000-0000-0000-0000000d1502', '00000000-0000-0000-0000-0000000d1c01', now());
    INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read)
      VALUES ('00000000-0000-0000-0000-0000000d1606', '00000000-0000-0000-0000-0000000d1502',
              '00000000-0000-0000-0000-0000000d1b02', 'Coach, can I miss Thursday?', false)$$,
  'player starts a direct conversation with the coach and writes (createConversation + sendMessage)');
SELECT lives_ok(
  $$DELETE FROM public.golf_conversation_participants
      WHERE conversation_id = '00000000-0000-0000-0000-0000000d1500' AND user_id = '00000000-0000-0000-0000-0000000d1b02'$$,
  'player leaves the group (leaveGolfGroup, messages.ts:2189)');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1c01", "role": "authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.golf_messages WHERE conversation_id = '00000000-0000-0000-0000-0000000d1502'),
  1, 'the coach reads the player''s direct message');
RESET ROLE;
SELECT is(
  public.d1_in('00000000-0000-0000-0000-0000000d1500', '00000000-0000-0000-0000-0000000d1b02'),
  0, 'and the player who left is out of the group');

-- ===========================================================================
-- A new player joins with the team's code and lands in the team channel
-- ===========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1b03", "role": "authenticated"}';
SELECT lives_ok(
  $$SELECT * FROM public.golf_join_team_with_code('D1TEAM01')$$,
  'a new player joins with the code from the coach''s invite (joinGolfTeam, teams.ts:430)');
SELECT is(
  (SELECT count(*)::int FROM public.get_golf_conversations_with_details((SELECT auth.uid()))),
  1, 'the new player''s inbox holds the team channel');
SELECT lives_ok(
  $$INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read)
      VALUES ('00000000-0000-0000-0000-0000000d1608', public.d1_channel(),
              '00000000-0000-0000-0000-0000000d1b03', 'Hi team', false)$$,
  'and the new player writes in the team channel');

-- ===========================================================================
-- A player asks to join; the ASSISTANT coach approves
-- ===========================================================================
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1b04", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_team_join_requests (id, team_id, player_id, status, message)
      VALUES ('00000000-0000-0000-0000-0000000d1701', '00000000-0000-0000-0000-0000000d1201',
              '00000000-0000-0000-0000-0000000d1404', 'pending', NULL)$$,
  'a player asks to join the team (createTeamJoinRequest, teams.ts:1050)');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1c02", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
      VALUES ('00000000-0000-0000-0000-0000000d1404', '00000000-0000-0000-0000-0000000d1201', 'active');
    UPDATE public.golf_team_join_requests
      SET status = 'approved', reviewed_by = '00000000-0000-0000-0000-0000000d1302', reviewed_at = now()
      WHERE id = '00000000-0000-0000-0000-0000000d1701'$$,
  'the assistant coach approves the request (acceptJoinRequest, teams.ts:1355 + :1371)');
RESET ROLE;
SELECT is(
  public.d1_in(public.d1_channel(), '00000000-0000-0000-0000-0000000d1b03')
  + public.d1_in(public.d1_channel(), '00000000-0000-0000-0000-0000000d1b04'),
  2, 'both new players are in the team channel');

-- ===========================================================================
-- The assistant coach does what the head coach does
-- ===========================================================================
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1c02", "role": "authenticated"}';
SELECT lives_ok(
  $$INSERT INTO public.golf_conversations (id, team_id, title, is_team_chat, created_by, created_at, updated_at)
      VALUES ('00000000-0000-0000-0000-0000000d1503', '00000000-0000-0000-0000-0000000d1201', 'Short game', true,
              '00000000-0000-0000-0000-0000000d1c02', now(), now());
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id, joined_at) VALUES
      ('00000000-0000-0000-0000-0000000d1503', '00000000-0000-0000-0000-0000000d1c02', now()),
      ('00000000-0000-0000-0000-0000000d1503', '00000000-0000-0000-0000-0000000d1b01', now()),
      ('00000000-0000-0000-0000-0000000d1503', '00000000-0000-0000-0000-0000000d1b03', now());
    INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, read)
      VALUES ('00000000-0000-0000-0000-0000000d1609', '00000000-0000-0000-0000-0000000d1503',
              '00000000-0000-0000-0000-0000000d1c02', 'Wedges at 3', false);
    INSERT INTO public.golf_conversation_participants (conversation_id, user_id)
      VALUES ('00000000-0000-0000-0000-0000000d1503', '00000000-0000-0000-0000-0000000d1b04');
    DELETE FROM public.golf_conversation_participants
      WHERE conversation_id = '00000000-0000-0000-0000-0000000d1503' AND user_id = '00000000-0000-0000-0000-0000000d1b03'$$,
  'the assistant coach creates a group, writes in it, adds the newest player and removes another');
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.golf_conversation_participants
    WHERE conversation_id = '00000000-0000-0000-0000-0000000d1503'),
  3, 'the assistant''s group holds the assistant and two players');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000d1c02", "role": "authenticated"}';
SELECT lives_ok(
  $$UPDATE public.golf_team_members SET status = 'inactive', updated_at = now()
      WHERE player_id = '00000000-0000-0000-0000-0000000d1402' AND team_id = '00000000-0000-0000-0000-0000000d1201';
    UPDATE public.golf_team_members SET status = 'active', updated_at = now()
      WHERE player_id = '00000000-0000-0000-0000-0000000d1402' AND team_id = '00000000-0000-0000-0000-0000000d1201'$$,
  'the assistant coach sets a player inactive and active again (updatePlayerStatus, team-management.ts:335)');
RESET ROLE;
SELECT is(
  public.d1_in(public.d1_channel(), '00000000-0000-0000-0000-0000000d1b02'),
  1, 'the reactivated player is in the team channel');

-- ===========================================================================
-- The two writes the server makes with the service role
-- ===========================================================================
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$UPDATE public.golf_messages SET notify_anyway_pushed_at = now()
      WHERE id = '00000000-0000-0000-0000-0000000d1602';
    DELETE FROM public.golf_conversations WHERE id = '00000000-0000-0000-0000-0000000d1502'$$,
  'the server stamps a "notify anyway" push and can undo a half-created conversation (golf-message-fanout.ts:188, messages.ts:570)');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
