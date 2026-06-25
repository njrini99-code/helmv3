-- pgTAP contracts for the BaseballHelm staff INVITE-ACCEPT path (Wave 11).
--
-- Wave 11 adds no new tables; it adds the accept/manage UI + server actions on
-- top of the Wave 1 schema. This test complements baseball_staff_capabilities.sql
-- by pinning the security contract that the accept flow relies on. It asserts
-- the FINAL policy set after migration 20260624000050 (which REPLACES the
-- 0030 *_manage / *_invitee_select policies with the canonical
-- *_select / *_insert / *_update / *_delete set):
--
--   1. The invitee can SELECT their own invite (email match) — so they can
--      accept it — and managers (primary / can_invite_staff) can read too.
--   2. The UPDATE policy lets a manager revoke/edit AND lets the invitee claim
--      (accept) their own invite by email match — but the WITH CHECK still
--      gates manager-side writes on the invite capability.
--   3. INSERT/DELETE are gated on baseball_can_invite_staff authority
--      (primary OR can_invite_staff), never a blanket team-coach check.
--   4. baseball_team_coach_staff is RLS-enabled with INSERT/UPDATE policies
--      gated on invite authority (so accept's UPSERT and the settings editor
--      cannot be driven by a non-authorized coach).
--   5. No anon access to either surface.
--
-- Schema-light: asserts over pg_policy / pg_class / information_schema without
-- seeding integration rows (matches _helpers.sql deferral).
--
-- Source: Wave 11 decision-room packet (BaseballHelm).

BEGIN;
\ir _helpers.sql

SELECT plan(13);

-- ============================================================================
-- 1. Invitee SELECT path — the canonical select policy matches on email so an
--    invited coach can read (and accept) their own invitation.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'baseball_staff_invitations'
      AND policyname = 'baseball_staff_invitations_select'
  ),
  'canonical SELECT policy exists on baseball_staff_invitations'
);

SELECT ok(
  position('email' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_staff_invitations'
        AND p.polname = 'baseball_staff_invitations_select'
  ), '')) > 0,
  'invitation SELECT policy matches the invitee on email (accept path)'
);

SELECT ok(
  position('can_invite_staff' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_staff_invitations'
        AND p.polname = 'baseball_staff_invitations_select'
  ), '')) > 0,
  'invitation SELECT policy also admits managers (can_invite_staff)'
);

-- ============================================================================
-- 2. UPDATE — invitee may claim/accept own (email match) AND managers may edit.
-- ============================================================================

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'baseball_staff_invitations'
      AND policyname = 'baseball_staff_invitations_update'
  ),
  'canonical UPDATE policy exists on baseball_staff_invitations'
);

SELECT ok(
  position('email' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_staff_invitations'
        AND p.polname = 'baseball_staff_invitations_update'
  ), '')) > 0,
  'UPDATE policy USING lets the invitee accept their own invite (email match)'
);

SELECT ok(
  position('can_invite_staff' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_staff_invitations'
        AND p.polname = 'baseball_staff_invitations_update'
  ), '')) > 0,
  'UPDATE policy WITH CHECK gates manager-side writes on the invite capability'
);

-- ============================================================================
-- 3. INSERT/DELETE gated on the invite authority (not a blanket team check).
-- ============================================================================

SELECT ok(
  position('can_invite_staff' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_staff_invitations'
        AND p.polname = 'baseball_staff_invitations_insert'
  ), '')) > 0,
  'invitation INSERT WITH CHECK gates on the invite capability'
);

SELECT ok(
  position('can_invite_staff' IN COALESCE((
    SELECT pg_get_expr(p.polqual, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_staff_invitations'
        AND p.polname = 'baseball_staff_invitations_delete'
  ), '')) > 0,
  'invitation DELETE USING gates on the invite capability'
);

-- ============================================================================
-- 4. baseball_team_coach_staff — RLS on, INSERT/UPDATE gated on invite cap.
--    (Backs accept's UPSERT + the settings capability editor.)
-- ============================================================================

SELECT ok(
  (SELECT relrowsecurity FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'baseball_team_coach_staff'),
  'RLS is ENABLED on baseball_team_coach_staff'
);

SELECT ok(
  position('can_invite_staff' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_team_coach_staff'
        AND p.polname = 'baseball_team_coach_staff_insert'
  ), '')) > 0,
  'team_coach_staff INSERT WITH CHECK gates on invite authority (accept UPSERT)'
);

SELECT ok(
  position('can_invite_staff' IN COALESCE((
    SELECT pg_get_expr(p.polwithcheck, p.polrelid)
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'baseball_team_coach_staff'
        AND p.polname = 'baseball_team_coach_staff_update'
  ), '')) > 0,
  'team_coach_staff UPDATE WITH CHECK gates on invite authority (settings editor)'
);

-- ============================================================================
-- 5. No anon access to either surface.
-- ============================================================================

SELECT isnt(
  has_table_privilege('anon', 'public.baseball_staff_invitations', 'SELECT'),
  true,
  'anon cannot SELECT baseball_staff_invitations'
);

SELECT isnt(
  has_table_privilege('anon', 'public.baseball_team_coach_staff', 'UPDATE'),
  true,
  'anon cannot UPDATE baseball_team_coach_staff'
);

SELECT * FROM finish();
ROLLBACK;
