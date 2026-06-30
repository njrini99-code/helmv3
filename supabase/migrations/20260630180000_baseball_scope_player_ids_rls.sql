-- #406 — Canonicalize staff player-scope enforcement on scope_player_ids.

UPDATE public.baseball_team_coach_staff
SET scope_player_ids = sub.ids
FROM (
  SELECT
    tcs.id,
    CASE
      WHEN jsonb_typeof(tcs.player_scope) = 'object'
           AND tcs.player_scope ? 'player_ids'
           AND jsonb_typeof(tcs.player_scope->'player_ids') = 'array'
           AND jsonb_array_length(tcs.player_scope->'player_ids') > 0
        THEN ARRAY(
          SELECT jsonb_array_elements_text(tcs.player_scope->'player_ids')::uuid
        )
      WHEN jsonb_typeof(tcs.player_scope) = 'array'
           AND jsonb_array_length(tcs.player_scope) > 0
        THEN ARRAY(
          SELECT jsonb_array_elements_text(tcs.player_scope)::uuid
        )
      ELSE NULL::uuid[]
    END AS ids
  FROM public.baseball_team_coach_staff tcs
  WHERE tcs.scope_player_ids IS NULL
    AND tcs.player_scope IS NOT NULL
) sub
WHERE baseball_team_coach_staff.id = sub.id
  AND sub.ids IS NOT NULL
  AND cardinality(sub.ids) > 0;

COMMENT ON COLUMN public.baseball_team_coach_staff.player_scope IS
  'LEGACY compatibility jsonb — superseded by scope_player_ids. Retained for audit; RLS reads scope_player_ids only.';

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

  IF v_staff.position_scope IS NOT NULL AND cardinality(v_staff.position_scope) > 0 THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.baseball_players bp
      JOIN public.baseball_team_members btm ON btm.player_id = bp.id
      WHERE bp.id = p_player_id
        AND btm.team_id = p_team_id
        AND bp.primary_position = ANY (v_staff.position_scope)
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_baseball_player(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_baseball_player(uuid, uuid) TO authenticated, service_role;
