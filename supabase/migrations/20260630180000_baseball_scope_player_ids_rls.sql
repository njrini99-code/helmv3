-- #406 — Canonicalize staff player-scope enforcement on scope_player_ids.
--
-- ADAPTED to live schema (2026-07-01): the original authored version referenced
-- legacy columns `player_scope` and `position_scope` on
-- baseball_team_coach_staff, neither of which exists on the live/deployed
-- database (only `scope_player_ids` and `scope_group_ids` do — the
-- prod_public_baseline never added player_scope/position_scope). The original
-- version therefore failed to apply (SQLSTATE 42703). This version:
--   * drops the player_scope -> scope_player_ids backfill entirely (there is no
--     player_scope column and no legacy data to migrate; scope_player_ids is
--     already the canonical column), and
--   * removes the position_scope fallback branch from the function.
-- Intent preserved: a scoped (non-head) assistant coach only sees players in
-- their scope_player_ids; suspended/removed/invited staff see nothing.
-- Applied to prod via MCP on 2026-07-01 in this exact form.
--
-- ADDITIVE / re-runnable: CREATE OR REPLACE only. No destructive DDL.

CREATE OR REPLACE FUNCTION public.can_view_baseball_player(
  p_team_id uuid,
  p_player_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_coach_id uuid := public.get_my_coach_id();
  v_staff    public.baseball_team_coach_staff%ROWTYPE;
BEGIN
  IF p_player_id = public.get_my_baseball_player_id() THEN
    RETURN true;
  END IF;

  IF v_coach_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_baseball_primary_coach(p_team_id) THEN
    RETURN true;
  END IF;

  SELECT tcs.*
    INTO v_staff
    FROM public.baseball_team_coach_staff tcs
   WHERE tcs.team_id = p_team_id
     AND tcs.coach_id = v_coach_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_staff.status IN ('suspended', 'removed', 'invited') THEN
    RETURN false;
  END IF;

  IF v_staff.is_head_coach THEN
    RETURN true;
  END IF;

  IF v_staff.scope_player_ids IS NOT NULL AND cardinality(v_staff.scope_player_ids) > 0 THEN
    RETURN p_player_id = ANY (v_staff.scope_player_ids);
  END IF;

  -- No explicit player scope set -> full team visibility for active staff.
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_baseball_player(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_baseball_player(uuid, uuid) TO authenticated, service_role;
