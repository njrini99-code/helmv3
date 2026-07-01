-- ============================================================================
-- Migration: 20260630233000_baseball_team_join_policy_rls.sql
-- Issue #502 — BaseballHelm: Enforce team join policy (closed / approval-
--              required) on join-code redemption.
--
-- Companion to the app-layer fix in src/app/baseball/actions/teams.ts
-- (joinTeam now reads baseball_teams.invite_policy / require_coach_approval
-- and computes the membership status before inserting, capturing + checking
-- the team-lookup error instead of discarding it). That app-layer gate alone
-- is bypassable: the existing "baseball_team_members_insert" policy (prod
-- baseline) only verifies the caller owns the target player_id — it places NO
-- constraint on team_id or status. Any authenticated user could therefore
-- POST directly to PostgREST with { team_id: <closed team>, player_id: <own>,
-- status: 'active' } and bypass joinTeam / invite_policy / require_coach_
-- approval entirely, no join code or invitation needed at all.
--
-- This migration hardens the INSERT policy itself so the data layer enforces
-- the same rule the server action enforces, independent of which client wrote
-- the row:
--   * invite_policy = 'closed'  -> no INSERT at all for that team.
--   * status = 'active'         -> only allowed when
--                                  require_coach_approval = false.
--   * everything else (pending / inactive / removed / the column default
--     when status is omitted) is unaffected by the new check — approval
--     workflows move a row from pending -> active via the existing staff-only
--     "baseball_team_members_update_coach" UPDATE policy, not via a fresh
--     INSERT, so that flow is untouched.
--
-- ZIP NON-NEGOTIABLES honored:
--   * ADDITIVE ONLY — CREATE OR REPLACE FUNCTION; DROP POLICY IF EXISTS then
--     CREATE POLICY (re-runnable). No destructive DROP/rename.
--   * SECURITY DEFINER helper mirrors the existing is_baseball_team_member /
--     has_baseball_staff_capability pattern (STABLE, SET search_path =
--     public, pg_temp). EXECUTE granted to authenticated + service_role ONLY
--     — NEVER anon.
--   * COALESCE-style defaults inside the helper guard against
--     20260624000095_baseball_team_and_season_settings.sql's invite_policy /
--     require_coach_approval columns not being guaranteed applied on every
--     environment — an unresolvable team fails CLOSED (returns false),
--     matching the app-layer fix's fail-closed posture.
--
-- This file is WRITTEN, NOT APPLIED.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1 — Helper: may a direct INSERT create a baseball_team_members row
-- with this status, for this team, given the team's join policy?
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_insert_baseball_team_member(
  p_team_id uuid,
  p_status  public.team_member_status
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite_policy          text;
  v_require_coach_approval boolean;
BEGIN
  IF p_team_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    COALESCE(bt.invite_policy, 'invite_only'),
    COALESCE(bt.require_coach_approval, true)
  INTO v_invite_policy, v_require_coach_approval
  FROM public.baseball_teams bt
  WHERE bt.id = p_team_id;

  -- Unresolvable team (missing row, or the policy columns not yet applied on
  -- this environment and COALESCE above still failed to produce a row at
  -- all): fail closed.
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Closed rosters accept no new membership rows via direct insert either.
  IF v_invite_policy = 'closed' THEN
    RETURN false;
  END IF;

  -- A row may only be created already-'active' when the team does not
  -- require coach approval. Every other requested status (pending — the
  -- column default when omitted — inactive, removed, or NULL) is left to the
  -- pre-existing ownership check below.
  IF p_status = 'active' AND v_require_coach_approval THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.can_insert_baseball_team_member(uuid, public.team_member_status) IS
  'RLS helper (#502): gates direct baseball_team_members INSERTs against the owning team''s invite_policy/require_coach_approval, mirroring the app-layer check in joinTeam(). Fails closed (false) when the team row cannot be resolved.';

REVOKE ALL ON FUNCTION public.can_insert_baseball_team_member(uuid, public.team_member_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_insert_baseball_team_member(uuid, public.team_member_status) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- SECTION 2 — Harden baseball_team_members_insert (re-runnable)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_team_members') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.baseball_team_members ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "baseball_team_members_insert" ON public.baseball_team_members';

    EXECUTE $p$CREATE POLICY "baseball_team_members_insert" ON public.baseball_team_members
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.baseball_players
          WHERE baseball_players.id = baseball_team_members.player_id
            AND baseball_players.user_id = auth.uid()
        )
        AND public.can_insert_baseball_team_member(baseball_team_members.team_id, baseball_team_members.status)
      )$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 3 — anon lockdown (defence in depth; matches the sport-wide Wave-1/2
-- baseball anon-revoke migrations — never re-grant anon on this table).
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.baseball_team_members FROM anon;

-- ============================================================================
-- END — #502 join-policy RLS hardening. ADDITIVE. NOT applied to any DB.
-- ============================================================================
