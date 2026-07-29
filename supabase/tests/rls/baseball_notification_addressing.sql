-- pgTAP contracts for baseball_notifications' INSERT policy.
--
-- THE BUG. The baseline shipped:
--
--     -- 20260527000000_prod_public_baseline.sql:18078
--     CREATE POLICY "baseball_notifications_insert"
--       ON public.baseball_notifications FOR INSERT WITH CHECK (true);
--
-- No TO clause (so it covered anon until 20260626000030 revoked anon's table
-- grant) and no check at all on `user_id`. Any authenticated user could insert
-- a notification addressed to any other user, choosing the type, title, body
-- and data. Reads were already correctly self-scoped, so this is not
-- disclosure — it is in-app phishing, rendered by the product's own UI and
-- indistinguishable from a real notification.
--
-- WHY THE OBVIOUS FIX IS WRONG, AND WHY THIS SUITE IS SHAPED THE WAY IT IS.
-- `WITH CHECK (auth.uid() = user_id)` reads like the correct answer and would
-- break the product: notifications are legitimately written TO OTHER PEOPLE
-- through the caller's own session, not a service-role client —
--
--     practice.ts:516      coach publishes -> one row per rostered player
--     lifting-v11.ts:2411  coach lift message -> one row for that player
--
-- Both use createClient(), not createAdminClient(). So a suite that only
-- asserted "you cannot notify a stranger" would pass against a policy that
-- silently disables practice-publish. GROUP 2 exists to make that
-- impossible: it asserts the coach CAN still notify their own player, and it
-- is the assertion most likely to catch a well-intentioned tightening later.
--
-- ASSERTS THE POST-B STATE. Against an A-only database the policy group fails,
-- correctly — WITH CHECK (true) is still in place.
--
-- Plan arithmetic, per group: 4 (function + policy shape) + 3 (permitted)
-- + 3 (denied) = 10. Counted rather than eyeballed — a miscounted plan aborts
-- the runner's `set -euo pipefail` loop and silently skips every
-- alphabetically later suite.

BEGIN;
\ir _helpers.sql

SELECT plan(10);

-- ============================================================================
-- GROUP 1 — helper invariants + policy shape.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_notify_baseball_user'
      AND p.prosecdef = true
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ),
  'can_notify_baseball_user runs with definer rights and a pinned search_path'
);

SELECT isnt(
  has_function_privilege('anon', 'public.can_notify_baseball_user(uuid)', 'EXECUTE'),
  true,
  'anon cannot execute can_notify_baseball_user'
);

-- The regression guard with the widest blast radius: if the WITH CHECK ever
-- goes back to a bare `true`, every other assertion here still passes on the
-- permitted cases and only the denied ones catch it. Assert the predicate
-- itself references the helper.
SELECT ok(
  position('can_notify_baseball_user' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_notifications'
       AND p.polname = 'baseball_notifications_insert'
  ), '')) > 0,
  'baseball_notifications_insert WITH CHECK calls can_notify_baseball_user — not a bare true'
);

-- The baseline policy had NO `TO` clause, which is how it came to cover anon.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'baseball_notifications'
      AND p.polname = 'baseball_notifications_insert'
      AND 'authenticated' = ANY (
        SELECT rolname FROM pg_roles WHERE oid = ANY (p.polroles)
      )
  ),
  'the INSERT policy is scoped TO authenticated explicitly — the baseline had no TO clause at all'
);

-- ============================================================================
-- SEED — one program with a coach and a rostered player, plus an unrelated
-- user on no team at all (the attacker in the denied cases below).
--
-- Ids in the 00000012* range; checked against every sibling suite.
-- ============================================================================
DO $$
BEGIN
  INSERT INTO public.organizations (id, name, type)
    VALUES ('00000000-0000-0000-0000-000000120001', 'Notify Program', 'college')
  ON CONFLICT DO NOTHING;

  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000120101', 'notifycoach@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000120301', 'notifyplayer@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-000000120401', 'notifystranger@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000120101', 'notifycoach@helm.test', 'coach'),
    ('00000000-0000-0000-0000-000000120301', 'notifyplayer@helm.test', 'player'),
    ('00000000-0000-0000-0000-000000120401', 'notifystranger@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_coaches (id, user_id, coach_type, full_name)
    VALUES ('00000000-0000-0000-0000-000000120102',
            '00000000-0000-0000-0000-000000120101', 'college', 'Notify Coach')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, organization_id, name, team_type, join_code)
    VALUES ('00000000-0000-0000-0000-000000120103',
            '00000000-0000-0000-0000-000000120001',
            'Notify Team', 'college', 'HNOTIFYA')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_coach_staff
    (team_id, coach_id, role, is_primary, is_head_coach, status)
  VALUES
    ('00000000-0000-0000-0000-000000120103', '00000000-0000-0000-0000-000000120102',
     'head_coach', true, true, 'active')
  ON CONFLICT (team_id, coach_id) DO UPDATE
    SET is_primary = true, is_head_coach = true, status = 'active';

  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated)
    VALUES ('00000000-0000-0000-0000-000000120302',
            '00000000-0000-0000-0000-000000120301', 'college', false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-000000120103',
            '00000000-0000-0000-0000-000000120302', 'active')
  ON CONFLICT DO NOTHING;

  -- The stranger has an account and a player row but belongs to no team.
  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated)
    VALUES ('00000000-0000-0000-0000-000000120402',
            '00000000-0000-0000-0000-000000120401', 'college', false)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- GROUP 2 — what MUST still work. These matter more than the denials: a
-- self-only policy would pass every denial below while breaking the product.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000120101", "role": "authenticated"}';

-- The practice-publish and lift-message shape.
SELECT lives_ok(
  $$INSERT INTO public.baseball_notifications (user_id, type, title, body)
    VALUES ('00000000-0000-0000-0000-000000120301', 'practice_published',
            'Practice is available', 'Tap to view your schedule.')$$,
  'a coach CAN notify a player rostered on their own team — practice-publish and lift messages keep working'
);

SELECT lives_ok(
  $$INSERT INTO public.baseball_notifications (user_id, type, title, body)
    VALUES ('00000000-0000-0000-0000-000000120101', 'self_note', 'Own note', 'x')$$,
  'a caller CAN always notify themselves'
);

RESET role;
RESET request.jwt.claims;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000120301", "role": "authenticated"}';

SELECT lives_ok(
  $$INSERT INTO public.baseball_notifications (user_id, type, title, body)
    VALUES ('00000000-0000-0000-0000-000000120301', 'self_note', 'Own note', 'x')$$,
  'a player CAN notify themselves'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- GROUP 3 — the phishing paths, now closed.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000120401", "role": "authenticated"}';

-- THE FIX. Under WITH CHECK (true) this succeeded.
SELECT throws_ok(
  $$INSERT INTO public.baseball_notifications (user_id, type, title, body)
    VALUES ('00000000-0000-0000-0000-000000120301', 'recruiting_interest',
            'A D1 coach viewed your profile', 'Tap to view')$$,
  '42501',
  NULL,
  'a stranger CANNOT plant a notification in a player''s feed — the in-app phishing path is closed'
);

SELECT throws_ok(
  $$INSERT INTO public.baseball_notifications (user_id, type, title, body)
    VALUES ('00000000-0000-0000-0000-000000120101', 'staff_alert',
            'Urgent: verify your account', 'Tap to verify')$$,
  '42501',
  NULL,
  'a stranger CANNOT notify a coach either — the direction an attacker benefits from most'
);

RESET role;
RESET request.jwt.claims;

-- A coach's authority is per-team, not global: being staff somewhere does not
-- license notifying a player they have no relationship with.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-000000120101", "role": "authenticated"}';

SELECT throws_ok(
  $$INSERT INTO public.baseball_notifications (user_id, type, title, body)
    VALUES ('00000000-0000-0000-0000-000000120401', 'recruiting_interest',
            'We are interested', 'Tap to view')$$,
  '42501',
  NULL,
  'a coach CANNOT notify a player who is not on any team of theirs — staff capability is per-team, not global'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
