-- =============================================================================
-- Helm Lifting Lab — Accept-Invite + Assign-Team + Sync-Athletes RPCs
-- Migration: 20260625000030_helm_lifting_accept_invite_rpc.sql
--
-- Spec: docs/lifting-lab/HELM_LIFTING_LAB_BLUEPRINT.md §3.4, §7 (Wave 1 RPCs)
--
-- Creates three SECURITY DEFINER RPCs:
--   1. helm_lifting_accept_invite(p_token uuid) → jsonb
--      Re-validates invite; upserts helm_lifting_coaches; flips invite to 'accepted';
--      downgrades all head-coach org viewers to can_edit=false (coach-active);
--      optionally seeds initial coach assignments.
--
--   2. helm_lifting_assign_team(p_org uuid, p_sport text, p_team_id uuid,
--                               p_team_name text) → uuid
--      Adds/reactivates a helm_lifting_coach_assignments row for the calling coach.
--
--   3. helm_lifting_sync_org_athletes(p_org uuid, p_sport text, p_team_id uuid)
--        → integer
--      Idempotent upsert of helm_lifting_athletes from the sport roster
--      (baseball_players/baseball_team_members or golf_players/golf_team_members).
--      Returns count of rows upserted.
--
-- SECURITY MODEL
--   * SECURITY DEFINER; SET search_path = public, pg_temp
--   * REVOKE EXECUTE FROM anon; GRANT to authenticated + service_role
--   * No function touches any golf_* or baseball_* SCHEMA object destructively.
--   * Stage-and-swap upserts throughout; no delete-then-insert.
--   * viewer downgrade on accept = UPDATE (not delete).
--
-- GOLF-SAFETY: purely additive; ZERO ALTER/DROP of any golf_* or baseball_* table.
-- =============================================================================

-- ===========================================================================
-- 1. helm_lifting_accept_invite
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.helm_lifting_accept_invite(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite  public.helm_lifting_coach_invites%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_email   text;
  v_coach_id uuid;
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  -- Resolve the caller's email from public.users
  SELECT email INTO v_email
  FROM public.users
  WHERE id = v_user_id;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- Re-validate the token: status=pending, not expired, email matches
  SELECT * INTO v_invite
  FROM public.helm_lifting_coach_invites
  WHERE token  = p_token
    AND status = 'pending'
    AND expires_at > now()
    AND lower(email) = lower(v_email);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_or_expired_invite');
  END IF;

  -- Stage-and-swap UPSERT for the coach profile
  INSERT INTO public.helm_lifting_coaches
    (user_id, organization_id, email, title, status, onboarding_completed)
  VALUES
    (v_user_id, v_invite.organization_id, v_email, v_invite.role_title, 'active', false)
  ON CONFLICT (user_id, organization_id)
  DO UPDATE SET
    status               = 'active',
    title                = COALESCE(EXCLUDED.title, helm_lifting_coaches.title),
    email                = COALESCE(EXCLUDED.email, helm_lifting_coaches.email),
    updated_at           = now()
  RETURNING id INTO v_coach_id;

  -- Flip the invite to accepted
  UPDATE public.helm_lifting_coach_invites
  SET status     = 'accepted',
      updated_at = now()
  WHERE id = v_invite.id;

  -- Downgrade every head-coach org viewer to can_edit=false (coach-active switch)
  -- This is a non-destructive UPDATE — viewer rows are preserved for SELECT access.
  UPDATE public.helm_lifting_org_viewers
  SET can_edit = false
  WHERE organization_id = v_invite.organization_id
    AND can_edit = true;

  RETURN jsonb_build_object(
    'ok',       true,
    'coach_id', v_coach_id,
    'org_id',   v_invite.organization_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.helm_lifting_accept_invite(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helm_lifting_accept_invite(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.helm_lifting_accept_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helm_lifting_accept_invite(uuid) TO service_role;

-- ===========================================================================
-- 2. helm_lifting_assign_team
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.helm_lifting_assign_team(
  p_org       uuid,
  p_sport     text,
  p_team_id   uuid,
  p_team_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_coach_id uuid;
  v_assign_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Caller must be an active lifting coach for this org
  SELECT id INTO v_coach_id
  FROM public.helm_lifting_coaches
  WHERE user_id       = v_user_id
    AND organization_id = p_org
    AND status          = 'active';

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'not_a_lifting_coach_for_org';
  END IF;

  -- Upsert the assignment (stage-and-swap; reactivate if previously deactivated)
  INSERT INTO public.helm_lifting_coach_assignments
    (coach_id, organization_id, sport, team_id, team_name_snapshot, is_active, assigned_by_user_id)
  VALUES
    (v_coach_id, p_org, p_sport, p_team_id, p_team_name, true, v_user_id)
  ON CONFLICT (coach_id, sport, team_id)
  DO UPDATE SET
    is_active           = true,
    team_name_snapshot  = COALESCE(EXCLUDED.team_name_snapshot, helm_lifting_coach_assignments.team_name_snapshot),
    updated_at          = now()
  RETURNING id INTO v_assign_id;

  RETURN v_assign_id;
END;
$$;

REVOKE ALL ON FUNCTION public.helm_lifting_assign_team(uuid, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helm_lifting_assign_team(uuid, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.helm_lifting_assign_team(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helm_lifting_assign_team(uuid, text, uuid, text) TO service_role;

-- ===========================================================================
-- 3. helm_lifting_sync_org_athletes
--    Idempotent upsert of helm_lifting_athletes from either sport's roster.
--    Returns the count of rows inserted (skips conflicts silently).
--    GOLF-SAFETY: only reads from baseball_*/golf_* tables — no writes to them.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.helm_lifting_sync_org_athletes(
  p_org     uuid,
  p_sport   text,
  p_team_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count   integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Caller must be an active lifting coach OR a can_edit org viewer
  IF NOT public.helm_lifting_can_edit_org(p_org) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_sport = 'baseball' THEN
    -- Seed from baseball_players via baseball_team_members
    INSERT INTO public.helm_lifting_athletes
      (organization_id, sport, sport_player_id, user_id, team_id, first_name, last_name, position, is_active)
    SELECT
      p_org,
      'baseball',
      bp.id,
      bp.user_id,
      p_team_id,
      bp.first_name,
      bp.last_name,
      bp.primary_position,
      true
    FROM public.baseball_players bp
    JOIN public.baseball_team_members btm ON btm.player_id = bp.id
    WHERE btm.team_id = p_team_id
    ON CONFLICT (organization_id, sport, sport_player_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_sport = 'golf' THEN
    -- Seed from golf_players via golf_team_members
    INSERT INTO public.helm_lifting_athletes
      (organization_id, sport, sport_player_id, user_id, team_id, first_name, last_name, position, is_active)
    SELECT
      p_org,
      'golf',
      gp.id,
      gp.user_id,
      p_team_id,
      gp.first_name,
      gp.last_name,
      NULL, -- golf_players has no primary_position equivalent
      true
    FROM public.golf_players gp
    JOIN public.golf_team_members gtm ON gtm.player_id = gp.id
    WHERE gtm.team_id = p_team_id
    ON CONFLICT (organization_id, sport, sport_player_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSE
    RAISE EXCEPTION 'unsupported_sport: %', p_sport;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.helm_lifting_sync_org_athletes(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helm_lifting_sync_org_athletes(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.helm_lifting_sync_org_athletes(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helm_lifting_sync_org_athletes(uuid, text, uuid) TO service_role;
