-- =============================================================================
-- 20260624001600_baseball_replace_lineup_positions_rpc.sql
--
-- Wave 10 / packet: qa-screens
--
-- Fixes a HIGH-severity destructive-write defect in updateLineup()
-- (src/app/baseball/actions/lineups.ts): the save path DELETEd every row in
-- baseball_lineup_positions for a lineup and THEN INSERTed the new positions in
-- a separate, non-transactional Supabase call. Any failure on the INSERT (a
-- transient network error, a CHECK/unique constraint, an RLS WITH CHECK
-- rejection, or a batting_order conflict) left the prior positions already gone
-- with no rollback — the user's lineup was silently destroyed. This violates
-- the project's no-destructive-writes hard rule (CodeRabbit/Greptile block on
-- "destructive DELETE-then-INSERT in a save/submit/sync path").
--
-- The fix makes the whole replacement ATOMIC: a single SECURITY DEFINER
-- plpgsql RPC updates the lineup name + swaps the positions inside one
-- implicit transaction (a plpgsql function body is one transaction — if the
-- INSERT raises, the DELETE and the name UPDATE roll back together and the
-- existing lineup is preserved intact).
--
-- The function re-validates every trust boundary inside the definer body so it
-- cannot be abused to mutate another coach's lineup:
--   * caller must be authenticated (auth.uid())
--   * caller must have a baseball_coaches profile
--   * caller must be staff on the lineup's team WITH can_manage_lineups
--     (head/primary coach implicitly satisfy it) — mirrors the in-process
--     capability gate, enforced again at the privileged write boundary
--   * the lineup is row-locked FOR UPDATE for the duration of the swap so two
--     concurrent saves cannot interleave a half-applied replacement
--
-- GUARDRAILS HONORED:
--   * ADDITIVE ONLY (CREATE OR REPLACE FUNCTION). No DROP, no schema change,
--     no destructive DML against existing data.
--   * SECURITY DEFINER + pinned search_path (matches 0030/0050/0062).
--   * REVOKE ALL FROM PUBLIC + anon; GRANT EXECUTE only to authenticated.
--     Never GRANT to anon.
--   * baseball_*-scoped only — safe on the live DB shared with GolfHelm.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.baseball_replace_lineup_positions(
  p_lineup_id uuid,
  p_name      text,
  -- ordered array of { "batting_order": int, "player_id": uuid } objects.
  p_positions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_coach_id   uuid;
  v_team_id    uuid;
  v_is_staff   boolean;
  v_count      integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  -- Resolve the caller's coach profile.
  SELECT c.id INTO v_coach_id
  FROM public.baseball_coaches c
  WHERE c.user_id = v_uid;

  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_coach');
  END IF;

  -- Lock the lineup row for the duration of the swap (serializes concurrent
  -- saves of the same lineup) and capture its team.
  SELECT l.team_id INTO v_team_id
  FROM public.baseball_team_lineups l
  WHERE l.id = p_lineup_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Capability gate at the privileged boundary: caller must be active staff on
  -- the lineup's team with lineup authority (head/primary coach implicitly).
  SELECT EXISTS (
    SELECT 1
    FROM public.baseball_team_coach_staff tcs
    WHERE tcs.team_id = v_team_id
      AND tcs.coach_id = v_coach_id
      AND COALESCE(tcs.status, 'active') = 'active'
      AND (
        tcs.is_primary IS TRUE
        OR tcs.is_head_coach IS TRUE
        OR tcs.can_manage_lineups IS TRUE
      )
  ) INTO v_is_staff;

  IF NOT v_is_staff THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- Validate the incoming positions array shape/cardinality before any write.
  IF p_positions IS NULL OR jsonb_typeof(p_positions) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_positions');
  END IF;

  v_count := jsonb_array_length(p_positions);
  IF v_count < 1 OR v_count > 9 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_count');
  END IF;

  -- ---- Atomic replacement (single transaction = this function body) --------
  -- 1. Update the lineup name.
  UPDATE public.baseball_team_lineups
  SET name = p_name
  WHERE id = p_lineup_id;

  -- 2. Clear the old positions, then insert the new ones. If the INSERT raises
  --    (unique/CHECK/RLS), the whole body rolls back and the DELETE is undone —
  --    the existing positions are NEVER lost.
  DELETE FROM public.baseball_lineup_positions
  WHERE lineup_id = p_lineup_id;

  INSERT INTO public.baseball_lineup_positions (lineup_id, batting_order, player_id)
  SELECT
    p_lineup_id,
    (elem ->> 'batting_order')::integer,
    (elem ->> 'player_id')::uuid
  FROM jsonb_array_elements(p_positions) AS elem;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.baseball_replace_lineup_positions(uuid, text, jsonb) IS
  'Atomically replaces a baseball lineup name + batting-order positions in one '
  'transaction. Re-validates can_manage_lineups inside the definer body. Fixes '
  'the non-transactional delete-then-insert data-loss bug in updateLineup().';

REVOKE ALL ON FUNCTION public.baseball_replace_lineup_positions(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.baseball_replace_lineup_positions(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.baseball_replace_lineup_positions(uuid, text, jsonb) TO authenticated;
