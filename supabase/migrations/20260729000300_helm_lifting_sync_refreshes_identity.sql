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
-- WHERE THE NULLs COME FROM. Not from the RPC:
-- `baseball_players.user_id` and `golf_players.user_id` are both NOT NULL
-- (20260527000000_prod_public_baseline.sql:8005 and the golf_players block),
-- so the SELECTs below can only ever copy a real account id. An earlier
-- draft of this migration blamed unaccepted invites; that was wrong, and CI
-- rejected the fixture built on it with `null value in column "user_id" of
-- relation "baseball_players" violates not-null constraint`.
--
-- They come from writes that bypass the RPC entirely. The demo seed inserts
-- athlete rows directly with `user_id: null`
-- (scripts/seed-baseball-lifting-demo.ts:311, "player logins from Phase-1
-- don't auto-link here"), overriding it for exactly one demo login. Every
-- other seeded athlete is unlinked. Any future direct write has the same
-- effect.
--
-- Under DO NOTHING those NULLs were PERMANENT: the one mechanism that could
-- have supplied the id — this sync — declined to write it. Nothing else
-- writes that column, and no UI repairs it.
--
-- The consequence is not cosmetic: `/lifting/dashboard`'s athlete-self gate
-- resolves the viewer through `helm_lifting_athletes.user_id`. An unlinked
-- athlete can never see their own lifting data.
--
-- Because the source columns are NOT NULL, the repair below is guaranteed to
-- succeed rather than merely likely: `EXCLUDED.user_id` always carries a real
-- id, so one re-sync fixes every unlinked row.
--
-- THE FIX. `DO NOTHING` becomes a NARROW `DO UPDATE` that refreshes the
-- identity fields the source of truth owns. Re-running Sync Athletes — which
-- coaches already do, and which the settings screen already offers — now
-- repairs the link. It also means a rename or position change on the roster
-- finally propagates, which DO NOTHING had silently prevented too.
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
-- ✅ APPLIED TO PRODUCTION 2026-07-29, on the owner's explicit instruction —
-- and the repair itself was then RUN, because applying this file only makes the
-- fix possible; a coach clicking "Sync Athletes" is what performs it.
--
-- Measured before: 22 baseball athletes, of which 21 had user_id IS NULL and
-- is_active — every one of them unable to open /lifting/dashboard, permanently,
-- because DO NOTHING meant the only mechanism that could supply the id refused
-- to. All 21 mapped to a baseball_players row with a real user_id and were
-- still on the synced team, so the repair was reachable rather than merely
-- plausible.
--
-- Behaviour verified in a rolled-back transaction BEFORE writing anything: a
-- deliberately deactivated athlete was still inactive after a sync (is_active
-- is not resurrected) while unlinked fell 13 -> 0 on that team. A structural
-- check confirms zero `is_active =` assignments in the body — the word appears
-- only in the comment explaining its absence, which a naive substring check
-- does match, so it was re-checked with a regex.
--
-- Then run for real, as each org's own lifting coach: Rini University 14 rows,
-- Demo University 8 rows. After: 22 athletes, 0 unlinked, 22 active (unchanged
-- — no activation was flipped), and every athlete's user_id equals its source
-- player's user_id across 22 distinct accounts, so no two athletes were linked
-- to the same person.
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
