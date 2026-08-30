-- =============================================================================
-- Round reclassification: make the RPC own its own integrity, and stop the
-- lifecycle guard refusing a round for not being finished yet.
--
-- STATUS: PREPARED, NOT APPLIED. R3 (privileged: SECURITY DEFINER function
-- granted to `authenticated`, plus the BEFORE-UPDATE trigger function on a
-- live golf table). Per memory/system/golfhelm-engineering-os.md an agent
-- prepares this and only the owner executes the production apply, with
-- `db-migration-reviewer` review first. See the row in HELD.md.
--
-- SUPERSEDES 20260827060000_scope_reclassify_qualifier_to_round_team.sql,
-- which is held and unapplied. That file fixed F8 alone; this one carries the
-- same fix (by a stronger route — see F8 below) plus the rest of the path, and
-- the two would otherwise both rewrite the same function. Applying only that
-- one is still safe; applying this one alone is sufficient.
--
--
-- DEFECT 1 — a round that is not finished cannot be re-typed at all
-- -----------------------------------------------------------------
-- Reported 2026-08-30: "players still cannot edit round type after the round."
--
-- `helm_private.guard_golf_round_lifecycle` grew a `reclassify` exception on
-- 2026-08-24 so a COMPLETED round could change what it counts toward. The
-- exception is gated on `OLD.status = 'completed'`. Every other status falls
-- through to the general UPDATE branch, which refuses any change to
-- round_type / qualifier_id / qualifier_round_number with SQLSTATE 55000 and
-- the message "A started round keeps its original qualifier identity."
--
-- So a player who has finished playing but not yet submitted — the round sits
-- `in_progress` — cannot correct a mis-tapped round type, and neither can
-- their coach. Measured against production 2026-08-30: 25 rounds are
-- `in_progress` (14 practice, 11 qualifier), the most recent from 2026-08-28.
--
-- The 2026-08-24 reasoning applies unchanged to a live round: re-typing
-- changes what a round COUNTS TOWARD, not a single stroke of it. The guard was
-- over-broad for completed rounds and is over-broad here for the same reason.
--
-- The fix drops `OLD.status = 'completed'` from that one branch. Everything
-- else about it is deliberately kept, and it is the column allowlist rather
-- than the status test that makes this safe: `status` is NOT in the allowlist,
-- so a marked write that also tries to move a round between statuses still
-- fails the jsonb comparison and falls through to the refusals below. An
-- UNMARKED write — anything that is not this RPC — is still refused exactly as
-- before, so a direct client UPDATE gains nothing here.
--
--
-- DEFECT 2 — the integrity checks lived in TypeScript, not in the function
-- ------------------------------------------------------------------------
-- `public.reclassify_golf_round` is SECURITY DEFINER and granted to
-- `authenticated`, so any signed-in user can call it directly with any
-- arguments. It checked the caller's permission and that a qualifier round
-- names SOME qualifier — nothing more. The four checks that keep a qualifier
-- coherent (exists, open, player entered, slot free) lived only in
-- `src/app/golf/actions/round-type.ts`, which a direct RPC call never runs.
--
-- That is the same class of mistake as F8 below, and the fix is the same one:
-- a SECURITY DEFINER function granted to `authenticated` is a public API, and
-- it has to be able to defend itself. The checks now live here. The action
-- keeps its own copies — not redundancy for its own sake, but because the
-- action can say "Round 3 of that qualifier is already taken by another round"
-- while a trigger can only raise a SQLSTATE.
--
--
-- F8 — reclassify let a caller attach their round to ANY team's qualifier
-- ----------------------------------------------------------------------
-- From the 2026-08-26 security scan. An authenticated player could pass a
-- FOREIGN team's qualifier uuid: the ownership check passes (it is their
-- round), nothing constrained the qualifier, and the write permanently
-- retagged the round into another program's standings — colliding with that
-- qualifier's `qualifier_round_number` unique index.
--
-- Closed here by the ENTRY check rather than by comparing team ids, which is
-- what 20260827060000 proposed. The entry check is the stronger gate: rows in
-- `golf_qualifier_entries` are coach-managed (its INSERT/UPDATE/DELETE
-- policies are all `is_golf_team_coach`), so "this player is entered in this
-- qualifier" cannot be forged by the player, and it holds even if a round's
-- `team_id` is wrong or absent.
--
-- It also does not break real data. Measured 2026-08-30: 8 rounds carry a NULL
-- `team_id` (3 of them completed), so a bare `round.team_id = qualifier.team_id`
-- equality would have refused those rounds a qualifier they may legitimately
-- belong to. The team comparison is still applied, as defence in depth, but
-- only when the round actually carries a team. Existing cross-team links: 0,
-- so nothing currently stored violates either rule.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The lifecycle guard. Reproduced in full because CREATE OR REPLACE
--    replaces the whole body; every branch other than `reclassify` is
--    byte-for-byte what production carries today.
--
--    PRE-APPLY CHECK — DO NOT SKIP. A CREATE OR REPLACE silently discards
--    anything production has that this file does not. Both bodies were read
--    from the live catalog on 2026-08-30 and fingerprinted:
--
--      helm_private.guard_golf_round_lifecycle()
--        md5 cbc5671bc953183a4967d43b7d66699e   length 3403
--      public.reclassify_golf_round(uuid,text,uuid,integer)
--        md5 c7c2c3f15af684fcdf63286c150bb12c   length 1656
--
--    Re-run immediately before applying:
--
--      SELECT md5(pg_get_functiondef(
--               'helm_private.guard_golf_round_lifecycle()'::regprocedure)),
--             length(pg_get_functiondef(
--               'helm_private.guard_golf_round_lifecycle()'::regprocedure));
--      SELECT md5(pg_get_functiondef(
--               'public.reclassify_golf_round(uuid,text,uuid,integer)'::regprocedure)),
--             length(pg_get_functiondef(
--               'public.reclassify_golf_round(uuid,text,uuid,integer)'::regprocedure));
--
--    If either md5 differs from the value above, production has moved since
--    this file was written and applying it would DISCARD that change. Stop and
--    re-derive. (This is the discipline 20260827060000 used and this file
--    originally dropped — restored after review.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION helm_private.guard_golf_round_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'atomic' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user IN ('postgres', 'service_role')
    AND current_setting('helm.golf_lifecycle_write', true) = 'stats_cache'
    AND (to_jsonb(NEW) - ARRAY[
      'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach',
      'strokes_gained_around_green', 'strokes_gained_putting'
    ]) = (to_jsonb(OLD) - ARRAY[
      'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach',
      'strokes_gained_around_green', 'strokes_gained_putting'
    ]) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'round_recap'
    AND (to_jsonb(NEW) - ARRAY['ai_recap', 'ai_recap_generated_at'])
      = (to_jsonb(OLD) - ARRAY['ai_recap', 'ai_recap_generated_at']) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status = 'completed'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'coachhelm_terminal'
    AND (to_jsonb(NEW) - ARRAY[
      'coachhelm_analyzed_at', 'coachhelm_failed_at', 'coachhelm_failure_reason'
    ]) = (to_jsonb(OLD) - ARRAY[
      'coachhelm_analyzed_at', 'coachhelm_failed_at', 'coachhelm_failure_reason'
    ]) THEN
    RETURN NEW;
  END IF;

  -- CHANGED: no longer requires OLD.status = 'completed'. Re-typing a round
  -- changes what it counts toward, not its scores, and that is as true of a
  -- live round as a submitted one. `status` is absent from the allowlist
  -- below, so this branch still cannot be used to move a round between
  -- statuses, and an unmarked write still never reaches it.
  IF TG_OP = 'UPDATE'
    AND current_user = 'postgres'
    AND current_setting('helm.golf_lifecycle_write', true) = 'reclassify'
    AND (to_jsonb(NEW) - ARRAY[
      'round_type', 'qualifier_id', 'qualifier_round_number'
    ]) = (to_jsonb(OLD) - ARRAY[
      'round_type', 'qualifier_id', 'qualifier_round_number'
    ]) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Completed rounds must be submitted through the protected round-submit flow.';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.status = 'completed' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Completed rounds are permanent history and cannot be deleted.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Completed rounds are permanent history and cannot be changed.';
    END IF;
    IF NEW.status = 'completed' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Completed rounds must be submitted through the protected round-submit flow.';
    END IF;
    IF NEW.player_id IS DISTINCT FROM OLD.player_id
      OR NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.round_type IS DISTINCT FROM OLD.round_type
      OR NEW.qualifier_id IS DISTINCT FROM OLD.qualifier_id
      OR NEW.qualifier_round_number IS DISTINCT FROM OLD.qualifier_round_number THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'A started round keeps its original qualifier identity. Resume or discard it instead of changing it.';
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The RPC, now enforcing every rule the action enforces.
--
--    Error codes are the function's existing convention, extended:
--      22023  malformed request      — bad type, no qualifier named, no such
--                                      qualifier, closed qualifier, bad number
--      42501  not permitted          — not owner/coach, or not entered
--      23505  slot already taken     — another round holds that round number
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- FOR UPDATE, because the status check below and the UPDATE at the end are
  -- otherwise a TOCTOU: `submit_round_atomic` can complete this very round in
  -- between, and since the guard's reclassify branch no longer looks at status
  -- at all, nothing downstream would notice. The realistic window is a
  -- qualifying weekend, where reclassifying and submitting happen at once.
  -- `submit_round_atomic` already takes this same row lock first, so this
  -- introduces no new lock-ordering inversion.
  SELECT * INTO v_round FROM public.golf_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Live or submitted only. An abandoned round must not be re-typed back into
  -- a qualifier's standings. (Production carries only these two statuses as of
  -- 2026-08-30; this is written to hold if a third is ever introduced.)
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

    -- F8, primary gate. Entries are coach-managed, so a player cannot forge
    -- their way into another program's qualifier.
    IF NOT EXISTS (
      SELECT 1 FROM public.golf_qualifier_entries e
      WHERE e.qualifier_id = p_qualifier_id AND e.player_id = v_round.player_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'This player is not entered in that qualifier.';
    END IF;

    -- F8, defence in depth. Skipped when the round carries no team at all —
    -- 8 such rounds exist and refusing them would be a regression, not a fix.
    IF v_round.team_id IS NOT NULL
      AND v_qualifier.team_id IS DISTINCT FROM v_round.team_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'That qualifier belongs to a different team.';
    END IF;

    IF v_qualifier.status = 'completed' THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'That qualifier is already completed, so rounds can no longer be added to it.';
    END IF;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants restated. CREATE OR REPLACE preserves them, but a privileged
--    function should never leave its own reachability implicit.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.reclassify_golf_round(uuid, text, uuid, integer)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reclassify_golf_round(uuid, text, uuid, integer)
  TO authenticated, service_role;

-- The trigger function is reachable only through the trigger and must never be
-- callable directly. CREATE OR REPLACE does not reset ACLs, so this changes
-- nothing today — it is restated because every prior migration touching this
-- function did, and a privileged object whose reachability is stated in some
-- files and assumed in others is one a reader has to go and check.
REVOKE ALL ON FUNCTION helm_private.guard_golf_round_lifecycle()
  FROM public, anon, authenticated;
