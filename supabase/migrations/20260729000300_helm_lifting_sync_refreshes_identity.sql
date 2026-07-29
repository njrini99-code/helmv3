-- ============================================================================
-- 20260729000300_helm_lifting_sync_refreshes_identity.sql
--
-- helm_lifting_athletes.user_id is write-once, and stale in production.
--
-- THE BUG. helm_lifting_sync_org_athletes seeds athletes with
-- `ON CONFLICT (organization_id, sport, sport_player_id) DO NOTHING`
-- (20260625000030:214, :235). DO NOTHING means every column is fixed at the
-- moment of the FIRST sync and never revisited.
--
-- `user_id` is copied from `baseball_players.user_id`, which is NULL until the
-- player accepts their invite and their account is linked. A coach who runs
-- Sync Athletes before their roster has finished signing up — which is the
-- normal order of operations, and what the demo seed does — writes NULL into
-- every athlete row. Re-running the sync does not fix it. Nothing else writes
-- that column.
--
-- The consequence is not cosmetic: `/lifting/dashboard`'s athlete-self gate
-- resolves the viewer through `helm_lifting_athletes.user_id`. A player whose
-- row was seeded early can never see their own lifting data, permanently, and
-- there is no UI anywhere that repairs it.
--
-- THE FIX. `DO NOTHING` becomes a NARROW `DO UPDATE` that refreshes the
-- identity fields the source of truth owns. Re-running Sync Athletes — which
-- coaches already do, and which the settings screen already offers — now
-- repairs the link.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH
--
--   is_active  — this is the important one. A blanket `DO UPDATE SET ... ` that
--                included is_active would set every athlete back to true on
--                every sync, silently resurrecting players who were cut from
--                the roster. That is exactly the bug closed hours ago by
--                wiring baseball roster deactivation through to Lift Lab
--                (roster.ts setLiftLabAthleteActive). A sync must never
--                undo a coach's roster decision.
--
--   team_id    — only filled when currently NULL. The unique key is
--                (organization_id, sport, sport_player_id), so a player on two
--                teams in one org has ONE athlete row. Overwriting team_id
--                would make it last-sync-wins and flip back and forth as a
--                coach syncs each team in turn. First-write-wins is not
--                obviously right either, but it is what exists today and
--                changing it is a product decision, not a bug fix.
--
--   user_id    — COALESCE(EXCLUDED.user_id, existing). A source row whose
--                user_id has gone back to NULL must not blank a link that was
--                already established: unlinking is not something a sync should
--                infer.
--
-- Names and position DO refresh: a corrected spelling or a position change on
-- the roster should reach Lift Lab, and those columns have no other writer.
--
-- SAFETY. This replaces one function body. No table is altered, no policy
-- changes, no data is deleted. It is idempotent and re-runnable, and reverting
-- is the DO NOTHING form quoted in the rollback below.
--
-- ⚠️ NOT APPLIED BY THIS FILE.
--
-- ROLLBACK: re-apply 20260625000030_helm_lifting_accept_invite_rpc.sql's
-- definition of this function verbatim (the only difference is the two
-- ON CONFLICT clauses reading `DO NOTHING`).
-- ============================================================================

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

  IF NOT public.helm_lifting_can_edit_org(p_org) THEN
    RAISE EXCEPTION 'not_a_lifting_coach_for_org';
  END IF;

  IF p_sport = 'baseball' THEN
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
    ON CONFLICT (organization_id, sport, sport_player_id) DO UPDATE SET
      -- Repair the account link once it exists; never blank one that does.
      user_id    = COALESCE(EXCLUDED.user_id, helm_lifting_athletes.user_id),
      -- Only fill an absent team; see the header for why this is not an
      -- overwrite.
      team_id    = COALESCE(helm_lifting_athletes.team_id, EXCLUDED.team_id),
      first_name = EXCLUDED.first_name,
      last_name  = EXCLUDED.last_name,
      position   = EXCLUDED.position,
      updated_at = now();
      -- is_active is ABSENT on purpose. See the header: including it would
      -- resurrect every cut player on every sync.

    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_sport = 'golf' THEN
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
    ON CONFLICT (organization_id, sport, sport_player_id) DO UPDATE SET
      user_id    = COALESCE(EXCLUDED.user_id, helm_lifting_athletes.user_id),
      team_id    = COALESCE(helm_lifting_athletes.team_id, EXCLUDED.team_id),
      first_name = EXCLUDED.first_name,
      last_name  = EXCLUDED.last_name,
      updated_at = now();
      -- position is not refreshed for golf: the source has no equivalent
      -- column, so EXCLUDED.position is always NULL and writing it would blank
      -- anything a coach had set by hand.

    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSE
    RAISE EXCEPTION 'unsupported_sport: %', p_sport;
  END IF;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.helm_lifting_sync_org_athletes(uuid, text, uuid) IS
  'Seed/refresh helm_lifting_athletes for one (org, sport, team). Upserts identity fields — user_id (COALESCEd so a link is repaired but never blanked), names, position — so re-running Sync Athletes repairs an athlete seeded before their account was linked, which was previously permanent and locked them out of /lifting/dashboard forever. Deliberately does NOT touch is_active: including it would resurrect roster-deactivated players on every sync. Returns the number of rows inserted or updated.';

REVOKE ALL ON FUNCTION public.helm_lifting_sync_org_athletes(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helm_lifting_sync_org_athletes(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.helm_lifting_sync_org_athletes(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helm_lifting_sync_org_athletes(uuid, text, uuid) TO service_role;

-- ============================================================================
-- NOTE ON THE RETURN VALUE. It was "rows inserted" and is now "rows inserted
-- or updated", because ROW_COUNT counts both. The callers already treat it as
-- "what this sync did" rather than "new athletes", and the UI copy added
-- alongside this work says "Added N athletes" only when N > 0 and otherwise
-- reports the org total — so a refresh-only sync now reports work it really
-- did instead of a bare zero. Called out because it is a semantic change to a
-- value the UI renders, not a silent one.
-- ============================================================================
