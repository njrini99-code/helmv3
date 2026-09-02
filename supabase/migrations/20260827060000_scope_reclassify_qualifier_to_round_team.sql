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
-- ERROR CODES. 22023 for a malformed request (no such qualifier), 42501 for a
-- cross-tenant attempt, following the function's existing convention.
--
-- These two ARE distinguishable by SQLSTATE, and an earlier version of this
-- comment claimed the opposite in the same breath as describing the split. To
-- be plain: the codes differ ON PURPOSE, so a legitimate client passing a stale
-- qualifier id gets 22023 rather than a permission error. That is a theoretical
-- existence oracle for foreign qualifier UUIDs, and it is accepted as low
-- severity because v4 UUIDs are not enumerable, the sole app caller
-- (src/app/golf/actions/round-type.ts) collapses both codes to generic copy
-- before anything reaches a browser, and reaching the raw code at all requires
-- calling the RPC directly — which already bypasses the app.
--
-- VERIFIED (production, 2026-08-27, read-only):
--   SELECT pg_get_functiondef(
--     'public.reclassify_golf_round(uuid,text,uuid,integer)'::regprocedure);
--   -> md5 c7c2c3f15af684fcdf63286c150bb12c, length 1656, and
--      position('v_qualifier_team' in def) = 0, i.e. this fix was NOT yet live.
--   Blast radius: golf_rounds with team_id IS NULL, completed,
--   non-qualifier = 3.
--   Pre-existing cross-team rows (round.team_id <> qualifier.team_id) = 0,
--   so F8 has left no bad data to remediate — this is preventive only.
--   RE-RUN the pg_get_functiondef check before applying; if the md5 differs,
--   production has moved and this CREATE OR REPLACE would discard it.
--
-- ROLLBACK:
--   CLAUDE-SECURITY-20260826-224016/F8-ROLLBACK-reclassify_golf_round.sql
--   is the byte-exact pre-apply definition captured from production. Run it
--   as-is to revert.
--
-- KNOWN BEHAVIOUR CHANGE (corrective, not a regression): a round whose team_id
-- IS NULL can no longer be reclassified to 'qualifier' by its owning player,
-- because golf_qualifiers.team_id is NOT NULL so IS DISTINCT FROM always holds.
-- There is no "same team" for a round with no team; the prior behaviour let a
-- teamless round attach to a specific team's qualifier. 3 rounds are in that
-- state today. They surface the existing 42501 copy ("You don't have
-- permission to change this round"), which is misleading for a
-- data-integrity condition —
-- a copy fix in round-type.ts is a follow-up, not a blocker.
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
