-- ===========================================================================
-- Shot-detail RLS: make every predicate correlated instead of table-wide
-- ===========================================================================
-- Symptom (Helm Bridge, 45 incidents over 7 days, still firing 2026-07-28):
--
--   insight-delivery.fetchShotDriversByCategory
--   "fetchShotDriversByCategory failed (continuing without shot drivers):
--    canceling statement due to statement timeout"   (n=30)
--   "…: AbortError: This operation was aborted"      (n=15)
--
-- `fetchShotDriversByCategory` reads `golf_shots` for a player's completed
-- rounds with the two 1:1 embeds the stats pipeline uses:
--
--   .select('..., putt_details(...), approach_miss_details(...)')
--
-- and gives up after BEST_EFFORT_QUERY_TIMEOUT_MS (5s, insight-delivery.ts).
-- Whichever budget trips first decides which of the two messages above the
-- Bridge gets, which is why one cause arrived as two incidents.
--
-- ---------------------------------------------------------------------------
-- WHAT THE COST ACTUALLY IS
-- ---------------------------------------------------------------------------
-- `pg_stat_statements`, production, this exact PostgREST read:
--
--   calls 916 | mean 1,299 ms | max 7,865 ms | total 1,190 s
--
-- The max is 1.6x the client's 5s budget, so the abort is not a tail anomaly:
-- it is the normal outcome once a player's set is big enough. The same policy
-- family accounts for the single most expensive statement on the database
-- (2,004 calls, mean 1,729 ms, total 3,465 s).
--
-- The cost is the RLS predicate, not the data. `putt_details_select_own` and
-- `putt_details_select_team` (and their `approach_miss_details` twins) are an
-- UNCORRELATED set-membership test:
--
--   shot_id IN (SELECT gs.id FROM golf_shots gs
--                 JOIN golf_holes gh   ON gh.id = gs.hole_id
--                 JOIN golf_rounds gr  ON gr.id = gh.round_id
--                 JOIN golf_players gp ON gp.id = gr.player_id
--               WHERE gp.user_id = auth.uid())
--
-- Nothing in that subquery references the outer row, so Postgres evaluates it
-- once and materialises the id of EVERY shot the user can see. Worse, the
-- inner `golf_shots` reference is itself RLS-checked, so that materialisation
-- drags in all four of `golf_shots`' permissive SELECT policies — one of
-- which (`golf_shots_select_team`) calls `is_golf_team_coach()` once per round
-- in the entire table. Cost therefore scales with the size of the whole
-- database, not with the rows the request asked for.
--
-- Measured directly: counting the detail rows for one affected player's 15
-- rounds took 2,392 ms to return ZERO rows. The predicate is the entire bill.
-- It cannot be worked around app-side — splitting the embeds into separate
-- round trips pays the same full scan twice.
--
-- ---------------------------------------------------------------------------
-- THE WRITE PREDICATES HAVE THE SAME DEFECT
-- ---------------------------------------------------------------------------
-- `*_insert_own`, `*_update_own` and `*_delete_own` use the identical
-- uncorrelated shape, so round submission pays it too. `pg_stat_statements`
-- for the PostgREST `INSERT INTO putt_details … RETURNING`:
--
--   calls 82 | mean 3,408 ms | max 7,121 ms | total 279 s
--
-- Note that a plain INSERT is billed for the SELECT policy as well, because
-- PostgREST always adds `RETURNING`, and `RETURNING` is a read. Measured on
-- production, a single-row insert of one `putt_details` row cost 4,438 ms, of
-- which 2,256 ms was the SELECT policy and the remaining 2,182 ms the INSERT's
-- own `WITH CHECK`. There are no INSERT triggers on either table; it is all
-- predicate. This is why logging a round is slow, and it is the same bug.
--
-- ---------------------------------------------------------------------------
-- FIX
-- ---------------------------------------------------------------------------
-- Resolve the predicate from the outer row's own `shot_id` through the
-- `shot_id` unique index, inside a SECURITY DEFINER helper so the lookup does
-- not re-enter the `golf_shots` / `golf_holes` / `golf_rounds` policy stack.
--
-- The helpers are written to be predicate-EQUIVALENT to the policies they
-- replace, not simplifications:
--
--   read  = (the shot row is readable under golf_shots' own RLS)  -- inherited
--           AND (I am the player OR I am a coach in the player's organisation)
--
--   write = (the shot row is readable under golf_shots' own RLS)  -- inherited
--           AND (I am the player)
--
-- Both conjuncts are reproduced literally below. In particular the read
-- helper's coach branch keeps the narrowing the inherited `golf_shots` check
-- supplied (`is_golf_team_coach` / `is_golf_team_player` on the round's team),
-- so an org coach who does not staff the player's team still cannot read the
-- row — dropping that conjunct would have WIDENED access.
--
-- For the write helper the inherited conjunct is provably redundant and is
-- therefore not repeated: owning the round already satisfies
-- `golf_shots_select_own` (`hole_id IN (holes of my rounds)`), so ownership
-- implies readability. Ownership alone is the exact original predicate.
--
-- ---------------------------------------------------------------------------
-- VERIFIED ON PRODUCTION (inside a rolled-back transaction)
-- ---------------------------------------------------------------------------
-- Equivalence — for a player who owns detail rows, a second such player, a
-- coach staffing both teams in an org, a coach staffing only the team that
-- holds the data, a coach staffing only the other team, and a third player:
-- the visible row set was IDENTICAL before and after for all 12
-- actor x table pairs, compared by row count AND by md5 of the sorted id
-- list. The non-staffing coach saw 0 rows before and 0 rows after.
--
-- Latency — replaying the exact PostgREST statement (lateral embeds with the
-- inner LIMIT/OFFSET that PostgREST emits), asserting byte-identical JSON
-- payloads before and after:
--
--   coach staffing both teams .... 6,178 ms -> 596 ms   (10.4x)
--   player, 14 rounds ............ 4,790 ms -> 151 ms   (31.7x)
--   player, 15 rounds ............ 4,861 ms -> 160 ms   (30.4x)
--
-- The coach case was 1.2x OVER the 5s client budget, i.e. a guaranteed abort.
-- Every case now sits an order of magnitude inside it.
--
-- Idempotent: CREATE OR REPLACE for the helpers, DROP POLICY IF EXISTS +
-- CREATE POLICY for the policies.
-- ===========================================================================

-- --- helpers ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_read_golf_shot_detail(p_shot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_shots gs
    JOIN public.golf_holes gh          ON gh.id = gs.hole_id
    JOIN public.golf_rounds gr_hole    ON gr_hole.id = gh.round_id
    JOIN public.golf_players gp_hole   ON gp_hole.id = gr_hole.player_id
    JOIN public.golf_rounds gr_shot    ON gr_shot.id = gs.round_id
    JOIN public.golf_players gp_shot   ON gp_shot.id = gr_shot.player_id
    WHERE gs.id = p_shot_id
      -- Conjunct 1 — the underlying shot must be readable. This is the union
      -- of golf_shots' four permissive SELECT policies (admin_read_all,
      -- golf_shots_select, golf_shots_select_own, golf_shots_select_team),
      -- which the old detail policies inherited by referencing golf_shots
      -- inside their subquery.
      --
      -- Branch order matters: the plain column comparison is first so the
      -- overwhelmingly common self-read never pays for the three helper
      -- functions, each of which is a query of its own.
      AND (
        gp_shot.user_id = (SELECT auth.uid())
        OR gp_hole.user_id = (SELECT auth.uid())
        OR (
          gr_shot.team_id IS NOT NULL
          AND public.is_golf_team_coach(gr_shot.team_id)
        )
        OR (
          gr_shot.team_id IS NOT NULL
          AND public.is_golf_team_player(gr_shot.team_id)
        )
        OR (
          gr_hole.team_id IS NOT NULL
          AND public.is_golf_team_coach(gr_hole.team_id)
        )
        OR public.is_admin()
      )
      -- Conjunct 2 — the detail row's own ownership test, verbatim from
      -- putt_details_select_own / putt_details_select_team.
      AND (
        gp_hole.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.golf_team_members gtm
          JOIN public.golf_teams gt   ON gt.id = gtm.team_id
          JOIN public.golf_coaches gc ON gc.organization_id = gt.organization_id
          WHERE gtm.player_id = gp_hole.id
            AND gc.user_id = (SELECT auth.uid())
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_read_golf_shot_detail(uuid) IS
  'RLS helper for putt_details / approach_miss_details SELECT. Correlated on '
  'the caller''s shot_id so the predicate costs one index lookup per row '
  'instead of a full RLS-filtered scan of golf_shots. SECURITY DEFINER only '
  'to avoid re-entering the golf_shots policy stack — the shot-readability '
  'conjunct is reproduced explicitly inside.';

-- Write predicate: the caller owns the round the shot belongs to. Separate
-- from the read helper because the detail write policies are owner-only —
-- a coach may READ a player's putt detail but never INSERT/UPDATE/DELETE it,
-- and folding the two would silently hand coaches write access.
CREATE OR REPLACE FUNCTION public.owns_golf_shot(p_shot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_shots gs
    JOIN public.golf_holes gh   ON gh.id = gs.hole_id
    JOIN public.golf_rounds gr  ON gr.id = gh.round_id
    JOIN public.golf_players gp ON gp.id = gr.player_id
    WHERE gs.id = p_shot_id
      AND gp.user_id = (SELECT auth.uid())
  );
$$;

COMMENT ON FUNCTION public.owns_golf_shot(uuid) IS
  'RLS helper for putt_details / approach_miss_details INSERT/UPDATE/DELETE. '
  'True when the caller is the player whose round the shot belongs to — the '
  'same predicate the old uncorrelated *_own policies expressed, correlated '
  'on shot_id so logging a round does not scan golf_shots.';

-- `anon` has to be revoked EXPLICITLY. Supabase ships an ALTER DEFAULT
-- PRIVILEGES entry granting EXECUTE on every new function in `public` directly
-- to anon, authenticated and service_role, so `REVOKE ... FROM PUBLIC` does
-- nothing for it — the grant is a direct grant, not one held via PUBLIC. The
-- sibling RLS helpers these two sit beside (`is_admin`, `is_golf_team_coach`,
-- `is_golf_team_player`) all carry no anon grant; matching them keeps a
-- privileged reader of the whole shot graph off the anonymous surface.
REVOKE ALL ON FUNCTION public.can_read_golf_shot_detail(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_golf_shot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_golf_shot_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_golf_shot(uuid) TO authenticated;

-- --- putt_details ----------------------------------------------------------
-- Every policy below is recreated `TO authenticated`, which is exactly the
-- role list the originals carried — this migration does not change who the
-- policies apply to, only how their predicate is evaluated.

DROP POLICY IF EXISTS "putt_details_select_own" ON public.putt_details;
DROP POLICY IF EXISTS "putt_details_select_team" ON public.putt_details;
DROP POLICY IF EXISTS "putt_details_select" ON public.putt_details;

CREATE POLICY "putt_details_select" ON public.putt_details
  FOR SELECT
  TO authenticated
  USING (public.can_read_golf_shot_detail(shot_id));

DROP POLICY IF EXISTS "putt_details_insert_own" ON public.putt_details;

CREATE POLICY "putt_details_insert_own" ON public.putt_details
  FOR INSERT
  TO authenticated
  WITH CHECK (public.owns_golf_shot(shot_id));

DROP POLICY IF EXISTS "putt_details_update_own" ON public.putt_details;

CREATE POLICY "putt_details_update_own" ON public.putt_details
  FOR UPDATE
  TO authenticated
  USING (public.owns_golf_shot(shot_id))
  WITH CHECK (public.owns_golf_shot(shot_id));

DROP POLICY IF EXISTS "putt_details_delete_own" ON public.putt_details;

CREATE POLICY "putt_details_delete_own" ON public.putt_details
  FOR DELETE
  TO authenticated
  USING (public.owns_golf_shot(shot_id));

-- --- approach_miss_details -------------------------------------------------

DROP POLICY IF EXISTS "approach_miss_details_select_own" ON public.approach_miss_details;
DROP POLICY IF EXISTS "approach_miss_details_select_team" ON public.approach_miss_details;
DROP POLICY IF EXISTS "approach_miss_details_select" ON public.approach_miss_details;

CREATE POLICY "approach_miss_details_select" ON public.approach_miss_details
  FOR SELECT
  TO authenticated
  USING (public.can_read_golf_shot_detail(shot_id));

DROP POLICY IF EXISTS "approach_miss_details_insert_own" ON public.approach_miss_details;

CREATE POLICY "approach_miss_details_insert_own" ON public.approach_miss_details
  FOR INSERT
  TO authenticated
  WITH CHECK (public.owns_golf_shot(shot_id));

DROP POLICY IF EXISTS "approach_miss_details_update_own" ON public.approach_miss_details;

CREATE POLICY "approach_miss_details_update_own" ON public.approach_miss_details
  FOR UPDATE
  TO authenticated
  USING (public.owns_golf_shot(shot_id))
  WITH CHECK (public.owns_golf_shot(shot_id));

DROP POLICY IF EXISTS "approach_miss_details_delete_own" ON public.approach_miss_details;

CREATE POLICY "approach_miss_details_delete_own" ON public.approach_miss_details
  FOR DELETE
  TO authenticated
  USING (public.owns_golf_shot(shot_id));
