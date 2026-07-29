-- pgTAP contracts for the baseball_team_invitations code exposure — the
-- sibling of the baseball_teams.join_code leak, and the last of the
-- "secret stored in a column, guarded by a policy that cannot see the query"
-- family in this schema.
--
-- THE LEAK THIS PINS CLOSED. Live since the 2026-05-27 baseline
-- (20260527000000_prod_public_baseline.sql:16699):
--
--     CREATE POLICY "Anyone can view active invitations by code"
--       ON public.baseball_team_invitations
--       FOR SELECT TO authenticated USING (("is_active" = true));
--
-- The name asserts a check the predicate never performs. `code` is an
-- 8-character secret in a column, so ANY authenticated user could run
-- `SELECT code, team_id FROM baseball_team_invitations WHERE is_active` and
-- walk away with every live invitation code for every program in the
-- database — then redeem them. One account on one team was enough to join
-- any other team.
--
-- WHY IT SURVIVED TWO EARLIER PASSES. 20260701000000:173 replaced the
-- INSERT/UPDATE/DELETE policies with has_baseball_staff_capability gates and
-- recorded the SELECT policy as deliberately "untouched". 20260708141000:86
-- then described the exploit path exactly — discover an invitation id through
-- this policy, call the redemption RPCs with it — narrowed those RPCs to
-- player accounts, and signed off with "This narrows but does not fully close
-- the surface ... a complete fix needs the invitation `code` ... threaded
-- through as a second parameter, which ... is out of scope". Closing the READ
-- closes it from the other side: ids stop being discoverable, so they are
-- unguessable v4 UUIDs and no signature change is needed.
--
-- SHIPS AS THE SAME SEQUENCED PAIR as the rest of the tenant-isolation fix:
--   20260729000100_..._a_additive.sql   SECTION 7 — the resolver RPC (additive)
--   20260729000200_..._b_policies.sql   SECTION 3 — the policy swap (the fix)
--
-- THIS SUITE ASSERTS THE POST-B STATE. Run against an A-only database the
-- policy groups fail, which is correct rather than broken.
--
-- The two assertions that carry the most weight are the negatives — a coach
-- cannot see another program's invitation, and a non-staff member sees none
-- at all. Both were TRUE-by-default for two months, and both fail silently in
-- the direction of disclosure, which is why they are pinned behaviourally
-- (real rows, real impersonation) rather than by reading the policy text.

BEGIN;
\ir _helpers.sql

SELECT plan(18);

-- ============================================================================
-- GROUP 1 — resolver invariants. Mirrors the invariant block every sibling
-- suite opens with: definer, pinned search_path, anon excluded.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'resolve_baseball_team_invitation_by_code'
      AND p.prosecdef = true
      AND p.proconfig @> ARRAY['search_path=public, pg_temp']
  ),
  'resolve_baseball_team_invitation_by_code is SECURITY DEFINER with pinned search_path'
);

SELECT isnt(
  has_function_privilege('anon', 'public.resolve_baseball_team_invitation_by_code(text)', 'EXECUTE'),
  true,
  'anon cannot execute resolve_baseball_team_invitation_by_code'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.resolve_baseball_team_invitation_by_code(text)', 'EXECUTE'),
  'authenticated CAN execute resolve_baseball_team_invitation_by_code'
);

-- The resolver must never hand `code` back. The caller supplied it, so
-- returning it buys nothing and turns any incidental log of the result into a
-- credential leak. Asserted on the declared result signature, which is where
-- a future "just add the code so the UI can show it" edit would land.
SELECT ok(
  position('code' IN COALESCE((
    SELECT pg_get_function_result(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'resolve_baseball_team_invitation_by_code'
  ), '')) = 0,
  'the resolver never returns the invitation code itself'
);

-- ============================================================================
-- GROUP 2 — policy shape.
-- ============================================================================

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_team_invitations'
      AND p.polname = 'Anyone can view active invitations by code'
  ),
  'the permissive baseline policy "Anyone can view active invitations by code" is GONE'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_team_invitations'
      AND p.polname = 'baseball_team_invitations_select'
      AND p.polcmd = 'r'
  ),
  'baseball_team_invitations_select exists as a SELECT policy'
);

SELECT ok(
  position('has_baseball_staff_capability' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_team_invitations'
       AND p.polname = 'baseball_team_invitations_select'
  ), '')) > 0,
  'baseball_team_invitations_select gates on has_baseball_staff_capability — the same gate its INSERT/UPDATE/DELETE siblings use'
);

-- Recursion-class guard, and it is not theoretical: the first draft of this
-- migration pair shipped TWO independent recursion cycles that survived
-- line-by-line adversarial review and were caught only by executing the SQL.
-- A USING clause built purely from definer function calls has no table to
-- recurse through; an inline subquery is exactly how both cycles got in.
SELECT ok(
  position(' FROM ' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_team_invitations'
       AND p.polname = 'baseball_team_invitations_select'
  ), '')) = 0,
  'baseball_team_invitations_select USING contains no inline subquery — no path to a policy recursion cycle'
);

-- ============================================================================
-- GROUP 3 — anon defense in depth.
-- ============================================================================

SELECT isnt(
  has_table_privilege('anon', 'public.baseball_team_invitations', 'SELECT'),
  true,
  'anon cannot SELECT baseball_team_invitations'
);

-- ============================================================================
-- SEED — two programs in two organizations, each with a live invitation, plus
-- a deactivated invitation on program A and an ordinary rostered player who
-- holds no staff role anywhere.
--
-- Ids in the 0000000e* range; checked against every sibling suite for
-- collisions.
-- ============================================================================
DO $$
BEGIN
  INSERT INTO public.organizations (id, name, type) VALUES
    ('00000000-0000-0000-0000-0000000e0001', 'Invite Program A', 'college'),
    ('00000000-0000-0000-0000-0000000e0002', 'Invite Program B', 'college')
  ON CONFLICT DO NOTHING;

  -- --- Program A: a coach with can_manage_roster, and a rostered player ---
  INSERT INTO auth.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000e0101', 'invitecoacha@helm.test', 'authenticated'),
    ('00000000-0000-0000-0000-0000000e0301', 'inviteplayer@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.users (id, email, role) VALUES
    ('00000000-0000-0000-0000-0000000e0101', 'invitecoacha@helm.test', 'coach'),
    ('00000000-0000-0000-0000-0000000e0301', 'inviteplayer@helm.test', 'player')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_coaches (id, user_id, coach_type, full_name)
    VALUES ('00000000-0000-0000-0000-0000000e0102',
            '00000000-0000-0000-0000-0000000e0101', 'college', 'Invite Coach A')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_teams (id, organization_id, name, team_type, join_code)
    VALUES ('00000000-0000-0000-0000-0000000e0103',
            '00000000-0000-0000-0000-0000000e0001',
            'Invite Team A', 'college', 'EJOINAAA')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_coach_staff
    (team_id, coach_id, role, is_primary, is_head_coach, status)
  VALUES
    ('00000000-0000-0000-0000-0000000e0103', '00000000-0000-0000-0000-0000000e0102',
     'head_coach', true, true, 'active')
  ON CONFLICT (team_id, coach_id) DO UPDATE
    SET is_primary = true, is_head_coach = true, status = 'active';

  INSERT INTO public.baseball_players (id, user_id, player_type, recruiting_activated)
    VALUES ('00000000-0000-0000-0000-0000000e0302',
            '00000000-0000-0000-0000-0000000e0301', 'college', false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.baseball_team_members (team_id, player_id, status)
    VALUES ('00000000-0000-0000-0000-0000000e0103',
            '00000000-0000-0000-0000-0000000e0302', 'active')
  ON CONFLICT DO NOTHING;

  -- --- Program B: a separate tenant. Its invitation is the cross-tenant
  -- --- target — under the old policy every authenticated user could read it.
  INSERT INTO public.baseball_teams (id, organization_id, name, team_type, join_code)
    VALUES ('00000000-0000-0000-0000-0000000e0203',
            '00000000-0000-0000-0000-0000000e0002',
            'Invite Team B', 'college', 'EJOINBBB')
  ON CONFLICT DO NOTHING;

  -- --- Invitations. created_by_coach_id is NOT NULL and FKs to
  -- --- baseball_coaches; which coach minted a row is irrelevant to the
  -- --- policy under test (it gates on team_id), so Coach A is reused.
  INSERT INTO public.baseball_team_invitations
    (id, team_id, code, created_by_coach_id, max_uses, used_count, expires_at, is_active)
  VALUES
    ('00000000-0000-0000-0000-0000000e0a01',
     '00000000-0000-0000-0000-0000000e0103', 'EINVITEA',
     '00000000-0000-0000-0000-0000000e0102', 25, 0, NULL, true),
    ('00000000-0000-0000-0000-0000000e0a02',
     '00000000-0000-0000-0000-0000000e0103', 'EINVDEAD',
     '00000000-0000-0000-0000-0000000e0102', 25, 0, NULL, false),
    ('00000000-0000-0000-0000-0000000e0b01',
     '00000000-0000-0000-0000-0000000e0203', 'EINVITEB',
     '00000000-0000-0000-0000-0000000e0102', 25, 0, NULL, true)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- GROUP 4 — behavioural: who can read the code column.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000e0101", "role": "authenticated"}';

SELECT is(
  (SELECT code FROM public.baseball_team_invitations
    WHERE id = '00000000-0000-0000-0000-0000000e0a01'),
  'EINVITEA'::varchar(8),
  'Coach A CAN read their OWN team''s invitation code (the legitimate capability is preserved)'
);

-- THE FIX. Under the baseline policy this returned 'EINVITEB'.
SELECT is(
  (SELECT count(*)::int FROM public.baseball_team_invitations
    WHERE id = '00000000-0000-0000-0000-0000000e0b01'),
  0,
  'Coach A CANNOT read Program B''s invitation — cross-tenant invitation-code exposure closed'
);

SELECT is(
  (SELECT count(*)::int FROM public.baseball_team_invitations),
  2,
  'Coach A''s unfiltered SELECT returns ONLY their own team''s two invitations — no bulk enumeration'
);

RESET role;
RESET request.jwt.claims;

-- A rostered player holds no staff capability anywhere. Under the baseline
-- policy this account could read EVERY active invitation in the database;
-- it is the exact shape of the original exposure.
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000e0301", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int FROM public.baseball_team_invitations WHERE is_active),
  0,
  'A non-staff player sees ZERO invitations even though two are active — the enumeration path is gone'
);

RESET role;
RESET request.jwt.claims;

-- ============================================================================
-- GROUP 5 — the resolver keeps the join flow working for exactly the caller
-- the policy now excludes. Without this the fix would be a regression: every
-- invite link would report "Invalid invitation code".
--
-- Run as the Program A player deliberately — someone with an account, no
-- staff role, and no membership on Program B. That is precisely who follows
-- an invite link, and precisely who the policy denies.
-- ============================================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub": "00000000-0000-0000-0000-0000000e0301", "role": "authenticated"}';

SELECT is(
  (SELECT count(*)::int
     FROM public.resolve_baseball_team_invitation_by_code('EINVITEB')),
  1,
  'a non-member holding Program B''s code resolves it — the join flow survives the policy change'
);

SELECT is(
  (SELECT team_name
     FROM public.resolve_baseball_team_invitation_by_code('EINVITEB')),
  'Invite Team B',
  'the resolver names the team, so the join screen can render it'
);

SELECT is(
  (SELECT organization_name
     FROM public.resolve_baseball_team_invitation_by_code('EINVITEB')),
  'Invite Program B',
  'the resolver carries organization branding through the LEFT JOIN'
);

SELECT is(
  (SELECT team_id
     FROM public.resolve_baseball_team_invitation_by_code('EINVITEB')),
  '00000000-0000-0000-0000-0000000e0203'::uuid,
  'the resolver returns the team_id the redemption path joins against'
);

-- Not an oracle: without a valid code there is nothing to learn.
SELECT is(
  (SELECT count(*)::int
     FROM public.resolve_baseball_team_invitation_by_code('NOTACODE')),
  0,
  'an unknown code resolves to nothing — no enumeration through the resolver either'
);

-- The deliberate behaviour change, pinned so it is not "tidied up" later.
-- The old policy filtered is_active in the policy, making a deactivated code
-- indistinguishable from a nonexistent one and leaving processTeamInvitation's
-- is_active/expiry branches unreachable. The resolver returns the row and lets
-- the app tell the player the truth.
SELECT is(
  (SELECT is_active
     FROM public.resolve_baseball_team_invitation_by_code('EINVDEAD')),
  false,
  'a DEACTIVATED code still resolves, carrying is_active=false — so the player is told "no longer active" instead of "invalid code"'
);

RESET role;
RESET request.jwt.claims;

SELECT * FROM finish();
ROLLBACK;
