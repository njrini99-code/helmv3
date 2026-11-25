-- pgTAP contract for 20261125130000_golf_auth_integrity.sql (auth scrub, 2026-11-25).
--
-- 1. An email change in auth.users reaches users and the golf profile rows.
-- 2. A signed-in user cannot rewrite their own users.email (it blocked the owner's sign-up), but their other writes to
--    users still work.
-- 3. Join codes are unique ignoring case, and stored upper case in the 4 to 12 letter-and-digit shape.
-- 4. One current (active or pending) team per player; history rows (inactive, removed) may pile up.
-- 5. golf_join_team_with_code: joins, re-joins its own team as a no-op, refuses a second team and a coach's login.
-- 6. A player's own join request can only be inserted as pending.
--
-- Fixture: org A with teams TA (code G9TEAMA1) and TB (G9TEAMB1). P1 and P2 are players with no team. C1 is a coach
-- who also has a player row (the coach-into-player case). Ids use the 0000...0c9xxx range.

BEGIN;
\ir _helpers.sql

SELECT plan(22);

SET LOCAL session_replication_role = replica;
DO $$
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000c9b01', 'c9-p1@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000c9b02', 'c9-p2@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000c9c01', 'c9-coach@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000c9b01', 'c9-p1@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000c9b02', 'c9-p2@helm.test', 'player'),
    ('00000000-0000-0000-0000-0000000c9c01', 'c9-coach@helm.test', 'coach')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.organizations (id, name, type) VALUES ('00000000-0000-0000-0000-0000000c9101', 'C9 Org', 'college');
  INSERT INTO public.golf_teams (id, name, join_code, gender, organization_id) VALUES
    ('00000000-0000-0000-0000-0000000c9201', 'C9 Team A', 'G9TEAMA1', 'mens',   '00000000-0000-0000-0000-0000000c9101'),
    ('00000000-0000-0000-0000-0000000c9202', 'C9 Team B', 'G9TEAMB1', 'womens', '00000000-0000-0000-0000-0000000c9101');
  INSERT INTO public.golf_coaches (id, user_id, organization_id, email) VALUES
    ('00000000-0000-0000-0000-0000000c9301', '00000000-0000-0000-0000-0000000c9c01', '00000000-0000-0000-0000-0000000c9101', 'c9-coach@helm.test');
  INSERT INTO public.golf_players (id, user_id, email, onboarding_completed) VALUES
    ('00000000-0000-0000-0000-0000000c9401', '00000000-0000-0000-0000-0000000c9b01', 'c9-p1@helm.test', true),
    ('00000000-0000-0000-0000-0000000c9402', '00000000-0000-0000-0000-0000000c9b02', 'c9-p2@helm.test', true),
    ('00000000-0000-0000-0000-0000000c9403', '00000000-0000-0000-0000-0000000c9c01', 'c9-coach@helm.test', true);
END $$;
SET LOCAL session_replication_role = origin;

-- 1. Email changes reach the app's copies ─────────────────────────────────────────────────────────────────────────
SELECT has_trigger('auth', 'users', 'on_auth_user_email_changed', 'auth.users has the email-change trigger');
UPDATE auth.users SET email = 'c9-p1-new@helm.test' WHERE id = '00000000-0000-0000-0000-0000000c9b01';
SELECT is((SELECT email FROM public.users WHERE id = '00000000-0000-0000-0000-0000000c9b01'), 'c9-p1-new@helm.test',
  'users.email follows an email change');
SELECT is((SELECT email FROM public.golf_players WHERE user_id = '00000000-0000-0000-0000-0000000c9b01'), 'c9-p1-new@helm.test',
  'golf_players.email follows it too');
UPDATE auth.users SET email = 'c9-coach-new@helm.test' WHERE id = '00000000-0000-0000-0000-0000000c9c01';
SELECT is((SELECT email FROM public.golf_coaches WHERE user_id = '00000000-0000-0000-0000-0000000c9c01'), 'c9-coach-new@helm.test',
  'golf_coaches.email follows a coach''s change');
-- A copy that cannot be written (the new address already held by a stale users row) never blocks the auth change.
UPDATE public.users SET email = 'c9-held@helm.test' WHERE id = '00000000-0000-0000-0000-0000000c9b02';
SELECT lives_ok(
  $$UPDATE auth.users SET email = 'c9-held@helm.test' WHERE id = '00000000-0000-0000-0000-0000000c9b01'$$,
  'an email change whose copy collides still succeeds in auth.users');
SELECT is((SELECT email FROM auth.users WHERE id = '00000000-0000-0000-0000-0000000c9b01'), 'c9-held@helm.test',
  'auth.users kept the change');
UPDATE auth.users SET email = 'c9-p1-new@helm.test' WHERE id = '00000000-0000-0000-0000-0000000c9b01';
UPDATE public.users SET email = 'c9-p2@helm.test' WHERE id = '00000000-0000-0000-0000-0000000c9b02';

-- 2. users.email is not self-editable; other self-writes are ────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c9b02", "role": "authenticated"}';
SELECT throws_ok(
  $$UPDATE public.users SET email = 'someone-else@school.test' WHERE id = '00000000-0000-0000-0000-0000000c9b02'$$,
  '42501', NULL, 'a signed-in user cannot put another address on their users row');
SELECT lives_ok(
  $$UPDATE public.users SET updated_at = now() WHERE id = '00000000-0000-0000-0000-0000000c9b02'$$,
  'their other writes to their users row still work');
RESET ROLE;
SELECT is((SELECT email FROM public.users WHERE id = '00000000-0000-0000-0000-0000000c9b02'), 'c9-p2@helm.test',
  'the address was not changed');

-- 3. Join codes ─────────────────────────────────────────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO public.golf_teams (name, join_code, organization_id) VALUES ('C9 Dupe', 'g9teama1', '00000000-0000-0000-0000-0000000c9101')$$,
  NULL, NULL, 'a code that differs from another only in case is refused');
SELECT throws_ok(
  $$UPDATE public.golf_teams SET join_code = 'G9-TEAM-B' WHERE id = '00000000-0000-0000-0000-0000000c9202'$$,
  '23514', NULL, 'a code with a dash is refused');
SELECT lives_ok(
  $$UPDATE public.golf_teams SET join_code = 'G9TEAMB2' WHERE id = '00000000-0000-0000-0000-0000000c9202'$$,
  'a new upper-case code is accepted (Settings, New code)');
UPDATE public.golf_teams SET join_code = 'G9TEAMB1' WHERE id = '00000000-0000-0000-0000-0000000c9202';

-- 5. The join function ──────────────────────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c9b02", "role": "authenticated"}';
SELECT lives_ok($$SELECT * FROM public.golf_join_team_with_code('g9teama1 ')$$, 'a player joins with the code, any case, trimmed');
SELECT lives_ok($$SELECT * FROM public.golf_join_team_with_code('G9TEAMA1')$$, 'joining their own team again is a no-op success');
SELECT throws_ok($$SELECT * FROM public.golf_join_team_with_code('G9TEAMB1')$$, '23505', 'already on another team',
  'a second team is refused');
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c9c01", "role": "authenticated"}';
SELECT throws_ok($$SELECT * FROM public.golf_join_team_with_code('G9TEAMB1')$$, '42501', 'coach accounts cannot join as players',
  'a coach''s login cannot join a team as a player, even with a player row');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.golf_team_members WHERE player_id = '00000000-0000-0000-0000-0000000c9402'), 1,
  'the player is on exactly one team');
SELECT is((SELECT count(*)::int FROM public.golf_team_members WHERE player_id = '00000000-0000-0000-0000-0000000c9403'), 0,
  'the coach is on no roster');

-- 4. One current team, enforced by the database ─────────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000c9402', '00000000-0000-0000-0000-0000000c9202', 'active')$$,
  '23505', NULL, 'a second active membership is refused even without the function (the race)');
SELECT lives_ok(
  $$INSERT INTO public.golf_team_members (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000c9402', '00000000-0000-0000-0000-0000000c9202', 'inactive')$$,
  'a history row on another team is allowed');

-- 6. Join requests start pending ────────────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000c9b01", "role": "authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.golf_team_join_requests (player_id, team_id, status)
    VALUES ('00000000-0000-0000-0000-0000000c9401', '00000000-0000-0000-0000-0000000c9201', 'approved')$$,
  '42501', NULL, 'a player cannot file their own request as approved');
SELECT lives_ok(
  $$INSERT INTO public.golf_team_join_requests (player_id, team_id)
    VALUES ('00000000-0000-0000-0000-0000000c9401', '00000000-0000-0000-0000-0000000c9201')$$,
  'a pending request still works');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
