-- =============================================================================
-- F8 — reclassify_golf_round let an authorized caller attach their round to
--      ANY team's qualifier.
--
-- STATUS: PREPARED, NOT APPLIED. R3 (privileged: SECURITY DEFINER function
-- granted to `authenticated`). Per memory/system/golfhelm-engineering-os.md,
-- daily reliability prepares this; only the owner executes the production
-- apply, and `db-migration-reviewer` review is mandatory first. See the row in
-- supabase/migrations/HELD.md.
--
-- THE DEFECT
-- ----------
-- public.reclassify_golf_round is SECURITY DEFINER with
-- GRANT EXECUTE TO authenticated. It verifies the caller OWNS the round
-- (golf_players.user_id = auth.uid()) or COACHES its team
-- (is_golf_team_coach(v_round.team_id)) — but never verifies that the
-- client-supplied p_qualifier_id belongs to that same team, or that it
-- references an existing golf_qualifiers row at all.
--
-- So an authenticated player calls:
--   reclassify_golf_round(
--     p_round_id               => <a round they own>,
--     p_round_type             => 'qualifier',
--     p_qualifier_id           => <a FOREIGN team's qualifier uuid>,
--     p_qualifier_round_number => 1)
-- The ownership check passes. Nothing constrains the qualifier. The lifecycle
-- guard trigger restricts WHICH columns may change, not their values. The write
-- succeeds and permanently retags an otherwise-immutable completed round into
-- another program's qualifier — colliding with that qualifier's
-- qualifier_round_number unique index and polluting the leaderboard a different
-- team's coach relies on.
--
-- THE FIX
-- -------
-- Before the UPDATE, require that a supplied p_qualifier_id resolves to a
-- golf_qualifiers row whose team_id equals the ROUND's team_id. Everything else
-- in the function is carried over byte-for-byte.
--
-- Error codes follow the function's existing convention: 22023 for a malformed
-- request (no such qualifier), 42501 for a cross-tenant attempt, so an attacker
-- cannot use the code to probe which foreign qualifier uuids exist.
-- Deliberately NOT distinguishable: both paths must look the same to a caller
-- who is guessing uuids. They are separated here only because a legitimate
-- client passing a stale qualifier id deserves the 22023.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reclassify_golf_round(
    p_round_id uuid,
    p_round_type text,
    p_qualifier_id uuid,
    p_qualifier_round_number integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_round public.golf_rounds%ROWTYPE;
  v_updated_id uuid;
  v_is_owner boolean := false;
  v_is_coach boolean := false;
  v_qualifier_team uuid;
BEGIN
  IF p_round_type NOT IN ('practice', 'tournament', 'qualifier') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported round type.';
  END IF;
  SELECT * INTO v_round FROM public.golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.golf_players gp
    WHERE gp.id = v_round.player_id AND gp.user_id = auth.uid()
  ) INTO v_is_owner;
  SELECT public.is_golf_team_coach(v_round.team_id) INTO v_is_coach;
  IF NOT (v_is_owner OR coalesce(v_is_coach, false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You do not have permission to change this round.';
  END IF;
  IF p_round_type = 'qualifier' AND p_qualifier_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A qualifier round must be attached to a qualifier.';
  END IF;

  -- F8: the qualifier must belong to the ROUND's own team.
  IF p_round_type = 'qualifier' THEN
    SELECT gq.team_id INTO v_qualifier_team
    FROM public.golf_qualifiers gq
    WHERE gq.id = p_qualifier_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No such qualifier.';
    END IF;

    IF v_qualifier_team IS DISTINCT FROM v_round.team_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'That qualifier belongs to a different team.';
    END IF;
  END IF;

  PERFORM set_config('helm.golf_lifecycle_write', 'reclassify', true);
  UPDATE public.golf_rounds
  SET round_type = p_round_type,
      qualifier_id = CASE WHEN p_round_type = 'qualifier' THEN p_qualifier_id ELSE NULL END,
      qualifier_round_number = CASE WHEN p_round_type = 'qualifier' THEN p_qualifier_round_number ELSE NULL END
  WHERE id = p_round_id
  RETURNING id INTO v_updated_id;
  RETURN v_updated_id;
END;
$$;

-- Grants restated because CREATE OR REPLACE does not change them, and stating
-- them keeps this file self-describing. anon must never execute a SECURITY
-- DEFINER function (.claude/rules/shipping.md).
REVOKE EXECUTE ON FUNCTION public.reclassify_golf_round(
    uuid, text, uuid, integer
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reclassify_golf_round(
    uuid, text, uuid, integer
) TO authenticated;
