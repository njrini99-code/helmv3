-- ============================================================================
-- ⛔ HOLD — DO NOT APPLY AS-IS. Caller-audit (2026-07-08) found two break risks:
--   1. recompute_golf_round_totals is invoked BY A TRIGGER on golf_shots and is
--      GRANTed to service_role. The owner/coach-only guard here has NO
--      service_role/backend allowance, so any service_role or seed/import write
--      that fires the trigger (auth.uid() = NULL) would hit RAISE 'Forbidden'
--      and BREAK legitimate golf writes. Before applying, add
--      `auth.role() = 'service_role'` (backend/trigger context) to the allowed
--      conditions, keeping owner/coach for direct authenticated/anon .rpc().
--   2. try_redeem/release_baseball_team_invitation gate on "owns a
--      baseball_players row" — a first-time user redeeming their initial invite
--      may not yet hold one, so the guard could block onboarding. Fix needs the
--      invite CODE threaded through (a signature change), per W10's own note.
-- This file touches a GOLF function (owner rule: golf untouchable) and is P2
-- security hardening, orthogonal to the routing/shell/UI/half-built pass. Left
-- unapplied on purpose; apply only after the two fixes above + owner sign-off.
-- ============================================================================
-- P2: three ungated/under-gated SECURITY DEFINER functions from the 2026-07-08
-- forensic audit. Additive guards only -- every function keeps its exact
-- signature and computation; bodies are otherwise byte-identical to the most
-- recent pre-existing definitions (recompute_golf_round_totals from
-- 20260606190000_fix_fairway_denominator.sql; the two redemption RPCs from
-- 20260630180200_baseball_team_invitation_redeem_rpc.sql). Idempotent
-- (CREATE OR REPLACE). Written NOT applied.

-- ---------------------------------------------------------------------------
-- (a) recompute_golf_round_totals(p_round_id uuid) -- GOLF function, SECURITY
--     DEFINER, currently GRANTed to anon/authenticated/service_role with no
--     authorization check at all: any authenticated (or anon) caller could
--     force a recompute of ANY round's totals. Add an ownership check mirroring
--     the existing golf_rounds RLS shape (golf_rounds_update: the caller owns
--     the player via golf_players.user_id, OR golf_rounds_update_coach /
--     golf_rounds_select: the caller coaches the round's team via
--     is_golf_team_coach(team_id)). Computation is untouched.
CREATE OR REPLACE FUNCTION public.recompute_golf_round_totals(p_round_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM golf_rounds gr
    JOIN golf_players gp ON gp.id = gr.player_id
    WHERE gr.id = p_round_id
      AND (
        gp.user_id = auth.uid()
        OR (gr.team_id IS NOT NULL AND public.is_golf_team_coach(gr.team_id))
      )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE golf_rounds r
  SET
    total_putts = COALESCE(t.sum_putts, 0),
    total_gir = COALESCE(t.sum_gir, 0),
    total_gir_possible = COALESCE(t.cnt, 0),
    total_fairways_hit = COALESCE(t.sum_fwy_hit, 0),
    total_fairways = COALESCE(t.cnt_par4plus, 0)
  FROM (
    SELECT
      SUM(putts) AS sum_putts,
      SUM(CASE
            WHEN par >= 3
             AND score > 0
             AND (score - COALESCE(putts, 0)) > 0
             AND (score - COALESCE(putts, 0)) <= (par - 2)
            THEN 1 ELSE 0
          END) AS sum_gir,
      COUNT(*) AS cnt,
      SUM(CASE WHEN par >= 4 AND fairway_hit = true THEN 1 ELSE 0 END) AS sum_fwy_hit,
      -- denominator: par-4/5 holes with a recorded fairway result (was: all par-4/5)
      SUM(CASE WHEN par >= 4 AND fairway_hit IS NOT NULL THEN 1 ELSE 0 END) AS cnt_par4plus
    FROM golf_holes
    WHERE round_id = p_round_id
  ) t
  WHERE r.id = p_round_id;
END
$function$;

-- ---------------------------------------------------------------------------
-- (b)/(c) try_redeem_baseball_team_invitation(p_invitation_id uuid) and
--     release_baseball_team_invitation_redemption(p_invitation_id uuid).
--     GRANTed to authenticated + service_role only (no anon, per
--     20260702100300_baseball_anon_grant_drift_revoke.sql). But an arbitrary
--     authenticated caller can already discover any active invitation's id
--     via the permissive "Anyone can view active invitations by code" SELECT
--     policy (USING (is_active = true), no code/team scoping) and then call
--     either RPC directly with that id -- try_redeem burns a redemption slot
--     without ever joining (denial-of-service against a coach's invite), and
--     release has NO precondition at all, so it can zero out used_count on an
--     invitation the caller has no relationship to, defeating max_uses.
--     Fix: only actual baseball player accounts (or admins) may call these --
--     the real app flow (src/app/baseball/actions/teams.ts
--     processTeamInvitation) already verifies the caller owns a
--     baseball_players row before invoking either RPC, so this is a no-op for
--     the legitimate path and closes it off for coach-only/staff-only or
--     player-less accounts. This narrows but does not fully close the
--     surface -- a genuine player account could still target another team's
--     invitation id; a complete fix needs the invitation `code` (not just its
--     id) threaded through as a second parameter, which would change the
--     signature and is out of scope for this additive pass.
CREATE OR REPLACE FUNCTION public.try_redeem_baseball_team_invitation(p_invitation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (
    public.is_super_admin()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.baseball_players WHERE user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.baseball_team_invitations
  SET used_count = COALESCE(used_count, 0) + 1
  WHERE id = p_invitation_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR COALESCE(used_count, 0) < max_uses)
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.try_redeem_baseball_team_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_redeem_baseball_team_invitation(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_baseball_team_invitation_redemption(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    public.is_super_admin()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.baseball_players WHERE user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.baseball_team_invitations
  SET used_count = GREATEST(COALESCE(used_count, 0) - 1, 0)
  WHERE id = p_invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.release_baseball_team_invitation_redemption(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_baseball_team_invitation_redemption(uuid) TO authenticated, service_role;
