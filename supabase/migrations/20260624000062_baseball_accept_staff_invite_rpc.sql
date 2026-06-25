-- =============================================================================
-- 20260624000062_baseball_accept_staff_invite_rpc.sql
--
-- Wave 11 / packet: decision-room
--
-- NOTE: renumbered from ...000060 to ...000062 to resolve a duplicate migration
-- version collision with 20260624000060_baseball_practices.sql (the Supabase
-- CLI keys migrations by the version timestamp; two files sharing one version
-- error / apply non-deterministically). 000062 applies AFTER 000050 (which
-- defines the baseball_staff_invitations policies this RPC reconciles) and
-- after 000060/000061, with no collision.
--
-- Adds the SECURITY DEFINER RPC that lets an INVITED coach accept their own
-- staff invitation. This is required because the RLS write policies on
-- baseball_team_coach_staff gate INSERT/UPDATE on invite authority (primary
-- coach OR can_invite_staff) — which the accepting coach does NOT yet hold.
-- Without a definer RPC the invitee could never create their own staff row.
--
-- The function is the SOLE privileged write path for accept. It re-validates
-- every trust boundary inside the definer body (token, status, expiry, and the
-- email match against auth.users) so it cannot be abused to join an arbitrary
-- team:
--
--   * token must resolve to a pending, unexpired invitation
--   * the caller must have a baseball_coaches profile
--   * the invitation email must equal the caller's auth email (case-insensitive)
--   * capabilities/role are read from the STORED invitation, never an argument
--   * the staff row is UPSERTed on (team_id, coach_id) — never delete+insert
--   * the invitation is flipped to 'accepted' only from 'pending' (idempotent)
--
-- GUARDRAILS HONORED:
--   * ADDITIVE ONLY (CREATE OR REPLACE FUNCTION; IF NOT EXISTS guard on the
--     optional accepted_by_user_id column). No DROP, no destructive DML.
--   * SECURITY DEFINER + pinned search_path (matches the existing helper
--     pattern in 0030/0050).
--   * REVOKE ALL FROM PUBLIC + anon; GRANT EXECUTE only to authenticated.
--     Never GRANT to anon.
--   * Safe to run on a live DB shared with GolfHelm (baseball_*-scoped only).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Reconcile the optional accepted_by_user_id column referenced by the 0050
--    invitation policies. 0050's USING/CHECK clauses reference
--    accepted_by_user_id, but the 0030 table only shipped accepted_at. Add the
--    column defensively so both the policies and this RPC have a stable shape.
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_staff_invitations
  ADD COLUMN IF NOT EXISTS accepted_by_user_id uuid;

COMMENT ON COLUMN public.baseball_staff_invitations.accepted_by_user_id IS
  'auth.users.id of the coach who accepted this invitation (set by baseball_accept_staff_invite).';

-- -----------------------------------------------------------------------------
-- 1. baseball_accept_staff_invite(p_token text) -> jsonb
--
-- Returns a small jsonb status object the server action maps to its result:
--   { "ok": true,  "team_id": "<uuid>" }
--   { "ok": false, "reason": "invalid|not_pending|expired|wrong_email|no_coach" }
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.baseball_accept_staff_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_email      text;
  v_coach_id   uuid;
  v_invite     public.baseball_staff_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  -- Resolve the caller's auth email + coach profile.
  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_uid;

  SELECT c.id INTO v_coach_id
  FROM public.baseball_coaches c
  WHERE c.user_id = v_uid;

  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_coach');
  END IF;

  -- Lock the invitation row for the duration of the accept (prevents a double
  -- accept race).
  SELECT * INTO v_invite
  FROM public.baseball_staff_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending');
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF v_email IS NULL OR lower(v_invite.email) <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_email');
  END IF;

  -- UPSERT the staff membership (stage-and-swap on the unique (team_id,coach_id)
  -- constraint). Capabilities/role come from the stored invitation only. The
  -- jsonb capability bag is materialized onto the dedicated boolean columns so
  -- the in-process resolver + RLS helper agree on the grant.
  INSERT INTO public.baseball_team_coach_staff AS tcs (
    team_id, coach_id, role, status,
    can_manage_roster, can_manage_practice, can_manage_lifting,
    can_view_academics, can_manage_imports, can_manage_stats,
    can_invite_staff, can_manage_settings, can_view_medical,
    can_message_team, can_manage_calendar, capabilities
  )
  VALUES (
    v_invite.team_id, v_coach_id, v_invite.role, 'active',
    COALESCE((v_invite.capabilities ->> 'can_manage_roster')::boolean, false),
    COALESCE((v_invite.capabilities ->> 'can_manage_practice')::boolean, false),
    COALESCE((v_invite.capabilities ->> 'can_manage_lifting')::boolean, false),
    COALESCE((v_invite.capabilities ->> 'can_view_academics')::boolean, false),
    COALESCE((v_invite.capabilities ->> 'can_manage_imports')::boolean, false),
    COALESCE((v_invite.capabilities ->> 'can_manage_stats')::boolean, false),
    COALESCE((v_invite.capabilities ->> 'can_invite_staff')::boolean, false),
    COALESCE((v_invite.capabilities ->> 'can_manage_settings')::boolean, false),
    COALESCE((v_invite.capabilities ->> 'can_view_medical')::boolean, false),
    COALESCE((v_invite.capabilities ->> 'can_message_team')::boolean, false),
    COALESCE((v_invite.capabilities ->> 'can_manage_calendar')::boolean, false),
    COALESCE(v_invite.capabilities, '{}'::jsonb)
  )
  ON CONFLICT (team_id, coach_id) DO UPDATE SET
    role                = EXCLUDED.role,
    status              = 'active',
    can_manage_roster   = EXCLUDED.can_manage_roster,
    can_manage_practice = EXCLUDED.can_manage_practice,
    can_manage_lifting  = EXCLUDED.can_manage_lifting,
    can_view_academics  = EXCLUDED.can_view_academics,
    can_manage_imports  = EXCLUDED.can_manage_imports,
    can_manage_stats    = EXCLUDED.can_manage_stats,
    can_invite_staff    = EXCLUDED.can_invite_staff,
    can_manage_settings = EXCLUDED.can_manage_settings,
    can_view_medical    = EXCLUDED.can_view_medical,
    can_message_team    = EXCLUDED.can_message_team,
    can_manage_calendar = EXCLUDED.can_manage_calendar,
    capabilities        = EXCLUDED.capabilities
  -- Never let an accept demote/clobber a primary or head coach row.
  WHERE tcs.is_primary IS NOT TRUE AND tcs.is_head_coach IS NOT TRUE;

  -- Flip the invitation to accepted (idempotent guard on status='pending').
  UPDATE public.baseball_staff_invitations
  SET status              = 'accepted',
      accepted_at         = now(),
      accepted_by_user_id = v_uid
  WHERE id = v_invite.id
    AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'team_id', v_invite.team_id);
END;
$$;

REVOKE ALL ON FUNCTION public.baseball_accept_staff_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.baseball_accept_staff_invite(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.baseball_accept_staff_invite(text) TO authenticated;
