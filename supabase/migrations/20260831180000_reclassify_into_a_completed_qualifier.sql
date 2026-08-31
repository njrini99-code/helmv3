-- Let a round be re-typed into a qualifier that has already been CONCLUDED.
--
-- Owner instruction, 2026-08-31: "there should be no time constraints."
--
-- WHY THIS IS NOT A DATA FIX. The refusal lived in three places at once —
-- the round detail page filtered completed qualifiers out of the picker, the
-- server action refused before it ever called this function, and this
-- function refused again. Removing only the database check would have changed
-- nothing a coach could see, because the two layers above it never let the
-- call through. This migration is the third of three changes, not the whole
-- fix.
--
-- WHAT THIS PERMITS, STATED PLAINLY. `get_qualifier_leaderboard` recomputes
-- live from `golf_rounds`, so attaching a round to a concluded qualifier
-- CHANGES ITS PUBLISHED RESULT. That is the point — a round recorded as
-- practice by mistake was always meant to count, and the qualifier being over
-- does not make the mistake less wrong. It is also why the UI now labels a
-- completed qualifier as completed at the point of choosing it, rather than
-- letting the standings move silently.
--
-- WHAT IS DELIBERATELY UNCHANGED. Submitting a NEW round into a completed
-- qualifier is still refused (`qualifier_closed`, golf.ts). That is a
-- different act: this is correcting what an EXISTING round counts toward,
-- which never touches a stroke. Immutability of SCORES is the invariant;
-- immutability of CLASSIFICATION never was.
--
-- Every other rule this function enforces is retained verbatim: round exists
-- and is live-or-submitted, caller is owner or team coach, the player is
-- entered, the qualifier belongs to the round's team, the round number is
-- within range, and the slot is free.
--
-- Reversible: the sole change is one removed IF block. Re-adding it restores
-- the previous behaviour exactly.

CREATE OR REPLACE FUNCTION public.reclassify_golf_round(
    p_round_id uuid,
    p_round_type text,
    p_qualifier_id uuid,
    p_qualifier_round_number integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_round      public.golf_rounds%ROWTYPE;
  v_qualifier  public.golf_qualifiers%ROWTYPE;
  v_updated_id uuid;
  v_is_owner   boolean := false;
  v_is_coach   boolean := false;
  v_round_no   integer;
BEGIN
  IF p_round_type NOT IN ('practice', 'tournament', 'qualifier') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported round type.';
  END IF;

  SELECT * INTO v_round FROM public.golf_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_round.status NOT IN ('completed', 'in_progress') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Only a live or submitted round can be re-typed.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.golf_players gp
    WHERE gp.id = v_round.player_id AND gp.user_id = auth.uid()
  ) INTO v_is_owner;
  SELECT public.is_golf_team_coach(v_round.team_id) INTO v_is_coach;

  IF NOT (v_is_owner OR coalesce(v_is_coach, false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You do not have permission to change this round.';
  END IF;

  IF p_round_type = 'qualifier' THEN
    IF p_qualifier_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'A qualifier round must be attached to a qualifier.';
    END IF;

    SELECT * INTO v_qualifier FROM public.golf_qualifiers WHERE id = p_qualifier_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'That qualifier does not exist.';
    END IF;

    -- Entries are coach-managed, so a player cannot forge their way into
    -- another program's qualifier.
    IF NOT EXISTS (
      SELECT 1 FROM public.golf_qualifier_entries e
      WHERE e.qualifier_id = p_qualifier_id AND e.player_id = v_round.player_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'This player is not entered in that qualifier.';
    END IF;

    -- Skipped when the round carries no team at all — 8 such rounds exist and
    -- refusing them would be a regression, not a fix.
    IF v_round.team_id IS NOT NULL
      AND v_qualifier.team_id IS DISTINCT FROM v_round.team_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'That qualifier belongs to a different team.';
    END IF;

    -- REMOVED 2026-08-31: the refusal on `v_qualifier.status = 'completed'`.
    -- A concluded qualifier is a finished competition, not a sealed record,
    -- and a round that always belonged in it does not stop belonging in it
    -- when the competition ends.

    v_round_no := coalesce(p_qualifier_round_number, v_round.qualifier_round_number, 1);
    IF v_round_no < 1 OR v_round_no > coalesce(v_qualifier.num_rounds, 1) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'That round number is outside this qualifier.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.golf_rounds r
      WHERE r.qualifier_id = p_qualifier_id
        AND r.player_id = v_round.player_id
        AND r.qualifier_round_number = v_round_no
        AND r.status <> 'abandoned'
        AND r.id <> p_round_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'That qualifier round number is already taken by another round.';
    END IF;
  END IF;

  PERFORM set_config('helm.golf_lifecycle_write', 'reclassify', true);

  UPDATE public.golf_rounds
  SET round_type = p_round_type,
      qualifier_id = CASE WHEN p_round_type = 'qualifier' THEN p_qualifier_id ELSE NULL END,
      qualifier_round_number = CASE WHEN p_round_type = 'qualifier' THEN v_round_no ELSE NULL END
  WHERE id = p_round_id
  RETURNING id INTO v_updated_id;

  RETURN v_updated_id;
END;
$function$;

-- Grants restated: a privileged function should never leave its reachability
-- implicit, and anon must never execute a SECURITY DEFINER function.
REVOKE ALL ON FUNCTION public.reclassify_golf_round(uuid, text, uuid, integer)
FROM public, anon;
GRANT EXECUTE ON FUNCTION
public.reclassify_golf_round(uuid, text, uuid, integer)
TO authenticated, service_role;
