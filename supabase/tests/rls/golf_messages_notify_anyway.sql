-- pgTAP contract for 20261025070300_golf_messages_notify_anyway.sql
-- (Clubhouse P-10 Notify anyway).
--
-- Only a coach OF THE CONVERSATION'S TEAM, sending as themselves, can set the flag
-- on insert. A bare golf_coaches row (anyone can create one), a coach of another
-- team, a conversation with no team, a player, another sender and the service role
-- all get false. The flag never changes after insert. The delivery stamp is the
-- fan-out's alone (service role), set once, on a flagged message.
--
-- The trigger reads auth.uid() and auth.role() from request.jwt.claims, so the
-- checks insert as the table owner with the claims of the user under test: that
-- tests the trigger itself, independent of the insert policies on golf_messages.
--
-- Plan arithmetic: 3 structural + 8 insert + 3 update + 4 stamp = 18.

BEGIN;
\ir _helpers.sql

SELECT plan(18);

CREATE FUNCTION public.p10_id(k text) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT md5('p10-notify:' || k)::uuid $$;

-- Act as a user (by key), as the service role, or as nobody; session stays the table owner
-- so row level security does not mask the trigger.
CREATE FUNCTION public.p10_claims(p_user uuid, p_role text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_user IS NULL THEN json_build_object('role', p_role)::text
         ELSE json_build_object('sub', p_user, 'role', p_role)::text END, true);
END $$;

-- ============================================================================
-- Seed. Coach cA staffs team A; coach cB staffs team B; 'bare' has a golf_coaches
-- row and no staff row; pA is a player on team A.
-- ============================================================================
DO $$
DECLARE
  k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['cA', 'cB', 'bare', 'pA'] LOOP
    INSERT INTO auth.users (id, email, role)
    VALUES (public.p10_id('u:' || k), k || '@notify.test', 'authenticated') ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.golf_teams (id, name, join_code) VALUES
    (public.p10_id('teamA'), 'Notify Team A', 'NTFYA001'),
    (public.p10_id('teamB'), 'Notify Team B', 'NTFYB001');

  INSERT INTO public.golf_coaches (id, user_id) VALUES
    (public.p10_id('coach:cA'),   public.p10_id('u:cA')),
    (public.p10_id('coach:cB'),   public.p10_id('u:cB')),
    (public.p10_id('coach:bare'), public.p10_id('u:bare'));
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id) VALUES
    (public.p10_id('teamA'), public.p10_id('coach:cA')),
    (public.p10_id('teamB'), public.p10_id('coach:cB'));

  INSERT INTO public.golf_players (id, user_id, first_name, last_name)
  VALUES (public.p10_id('p:pA'), public.p10_id('u:pA'), 'Pat', 'A');
  INSERT INTO public.golf_team_members (team_id, player_id, status)
  VALUES (public.p10_id('teamA'), public.p10_id('p:pA'), 'active');

  INSERT INTO public.golf_conversations (id, created_by, team_id, title) VALUES
    (public.p10_id('convA'),    public.p10_id('u:cA'), public.p10_id('teamA'), 'A'),
    (public.p10_id('convB'),    public.p10_id('u:cB'), public.p10_id('teamB'), 'B'),
    (public.p10_id('convNone'), public.p10_id('u:cA'), NULL,                   'None');
END $$;

-- ============================================================================
-- Structural
-- ============================================================================
SELECT ok(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'golf_messages'
             AND column_name = 'notify_anyway' AND is_nullable = 'NO' AND data_type = 'boolean'
             AND column_default = 'false')
  AND EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'golf_messages'
                 AND column_name = 'notify_anyway_pushed_at' AND is_nullable = 'YES'),
  'notify_anyway is boolean not null default false; notify_anyway_pushed_at is nullable'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.golf_messages_notify_anyway_guard()', 'execute')
  AND NOT has_function_privilege('authenticated', 'public.golf_messages_notify_anyway_guard()', 'execute'),
  'the guard function is not callable by clients'
);

SELECT ok(
  pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgname = 'golf_messages_notify_anyway_insert')) ILIKE '%WHEN%'
  AND pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgname = 'golf_messages_notify_anyway_update')) ILIKE '%WHEN%',
  'both triggers carry a WHEN clause, so an ordinary message never runs the guard'
);

-- ============================================================================
-- Insert
-- ============================================================================
SELECT public.p10_claims(public.p10_id('u:cA'));
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, notify_anyway)
VALUES (public.p10_id('m:coach'), public.p10_id('convA'), public.p10_id('u:cA'), 'now', true);

SELECT is(
  (SELECT notify_anyway FROM public.golf_messages WHERE id = public.p10_id('m:coach')),
  true,
  'a coach of the conversation''s team sending as themselves keeps the flag'
);

INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, notify_anyway)
VALUES (public.p10_id('m:other'), public.p10_id('convB'), public.p10_id('u:cA'), 'x', true);
SELECT is(
  (SELECT notify_anyway FROM public.golf_messages WHERE id = public.p10_id('m:other')),
  false,
  'a coach of team A in a team B conversation loses the flag'
);

INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, notify_anyway)
VALUES (public.p10_id('m:none'), public.p10_id('convNone'), public.p10_id('u:cA'), 'x', true);
SELECT is(
  (SELECT notify_anyway FROM public.golf_messages WHERE id = public.p10_id('m:none')),
  false,
  'a conversation with no team never carries the flag, even from a coach'
);

SELECT public.p10_claims(public.p10_id('u:bare'));
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, notify_anyway)
VALUES (public.p10_id('m:bare'), public.p10_id('convA'), public.p10_id('u:bare'), 'x', true);
SELECT is(
  (SELECT notify_anyway FROM public.golf_messages WHERE id = public.p10_id('m:bare')),
  false,
  'a bare golf_coaches row with no staff row on the team loses the flag (Must 3)'
);

SELECT public.p10_claims(public.p10_id('u:pA'));
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, notify_anyway)
VALUES (public.p10_id('m:player'), public.p10_id('convA'), public.p10_id('u:pA'), 'x', true);
SELECT is(
  (SELECT notify_anyway FROM public.golf_messages WHERE id = public.p10_id('m:player')),
  false,
  'a player loses the flag'
);

SELECT public.p10_claims(public.p10_id('u:cA'));
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, notify_anyway)
VALUES (public.p10_id('m:spoof'), public.p10_id('convA'), public.p10_id('u:pA'), 'x', true);
SELECT is(
  (SELECT notify_anyway FROM public.golf_messages WHERE id = public.p10_id('m:spoof')),
  false,
  'a coach inserting with someone else as sender loses the flag'
);

SELECT public.p10_claims(NULL, 'service_role');
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, notify_anyway)
VALUES (public.p10_id('m:svc'), public.p10_id('convA'), public.p10_id('u:cA'), 'x', true);
SELECT is(
  (SELECT notify_anyway FROM public.golf_messages WHERE id = public.p10_id('m:svc')),
  false,
  'the service role (no auth.uid()) cannot set the flag on insert'
);

SELECT public.p10_claims(public.p10_id('u:cA'));
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content)
VALUES (public.p10_id('m:plain'), public.p10_id('convA'), public.p10_id('u:cA'), 'plain');
SELECT is(
  (SELECT notify_anyway FROM public.golf_messages WHERE id = public.p10_id('m:plain')),
  false,
  'a message sent without the flag stores false'
);

-- ============================================================================
-- Update: the flag never changes after insert
-- ============================================================================
UPDATE public.golf_messages SET notify_anyway = true WHERE id = public.p10_id('m:plain');
SELECT is(
  (SELECT notify_anyway FROM public.golf_messages WHERE id = public.p10_id('m:plain')),
  false,
  'setting the flag on an existing message does nothing, even for the coach who sent it'
);

UPDATE public.golf_messages SET notify_anyway = false WHERE id = public.p10_id('m:coach');
SELECT is(
  (SELECT notify_anyway FROM public.golf_messages WHERE id = public.p10_id('m:coach')),
  true,
  'clearing the flag on a flagged message does nothing'
);

SELECT public.p10_claims(NULL, 'service_role');
UPDATE public.golf_messages SET notify_anyway = false WHERE id = public.p10_id('m:coach');
SELECT is(
  (SELECT notify_anyway FROM public.golf_messages WHERE id = public.p10_id('m:coach')),
  true,
  'not even the service role can change the flag'
);

-- ============================================================================
-- The delivery stamp
-- ============================================================================
UPDATE public.golf_messages SET notify_anyway_pushed_at = '2026-10-26 14:00:00+00' WHERE id = public.p10_id('m:coach');
SELECT is(
  (SELECT notify_anyway_pushed_at FROM public.golf_messages WHERE id = public.p10_id('m:coach')),
  '2026-10-26 14:00:00+00'::timestamptz,
  'the service role stamps a flagged message after a real delivery'
);

UPDATE public.golf_messages SET notify_anyway_pushed_at = '2026-10-26 15:00:00+00' WHERE id = public.p10_id('m:coach');
SELECT is(
  (SELECT notify_anyway_pushed_at FROM public.golf_messages WHERE id = public.p10_id('m:coach')),
  '2026-10-26 14:00:00+00'::timestamptz,
  'the stamp is set once'
);

UPDATE public.golf_messages SET notify_anyway_pushed_at = now() WHERE id = public.p10_id('m:plain');
SELECT is(
  (SELECT notify_anyway_pushed_at FROM public.golf_messages WHERE id = public.p10_id('m:plain')),
  NULL::timestamptz,
  'an unflagged message cannot be stamped'
);

SELECT public.p10_claims(public.p10_id('u:cA'));
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, notify_anyway, notify_anyway_pushed_at)
VALUES (public.p10_id('m:forged'), public.p10_id('convA'), public.p10_id('u:cA'), 'x', true, now());
UPDATE public.golf_messages SET notify_anyway_pushed_at = now() WHERE id = public.p10_id('m:coach');
SELECT is(
  (SELECT notify_anyway_pushed_at FROM public.golf_messages WHERE id = public.p10_id('m:forged')),
  NULL::timestamptz,
  'a coach cannot forge the stamp on insert, and cannot restamp a message (only the service role stamps)'
);

SELECT * FROM finish();
ROLLBACK;
