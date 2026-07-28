-- ===========================================================================
-- Shot-detail RLS: make the read predicate correlated instead of table-wide
-- ===========================================================================
-- Symptom (Helm Bridge, 45 incidents over 7 days, still firing):
--
--   insight-delivery.fetchShotDriversByCategory
--   "fetchShotDriversByCategory failed (continuing without shot drivers):
--    canceling statement due to statement timeout"
--
-- `fetchShotDriversByCategory` reads `golf_shots` for a player's completed
-- rounds with the two 1:1 embeds the stats pipeline uses:
--
--   .select('..., putt_details(...), approach_miss_details(...)')
--
-- Measured on production (EXPLAIN ANALYZE as the affected player, 21,337
-- shots / 3,364 putt_details / 1,075 approach_miss_details — a tiny table):
--
--   base golf_shots scan, no embeds .....................  164 ms
--   same scan WITH the two embeds ....................... 4,585 ms
--
-- The 4.4s delta is entirely RLS. `putt_details_select_own` and
-- `putt_details_select_team` (and their `approach_miss_details` twins) are
-- written as an UNCORRELATED set membership test:
--
--   shot_id IN (SELECT gs.id FROM golf_shots gs
--                 JOIN golf_holes gh   ON gh.id = gs.hole_id
--                 JOIN golf_rounds gr  ON gr.id = gh.round_id
--                 JOIN golf_players gp ON gp.id = gr.player_id
--               WHERE gp.user_id = auth.uid())
--
-- Nothing in that subquery references the outer row, so Postgres evaluates it
-- once and materialises the id of EVERY shot the user can see — and because
-- the inner `golf_shots` reference is itself RLS-checked, that materialisation
-- drags in all four of `golf_shots`' permissive SELECT policies, one of which
-- (`golf_shots_select`) is a correlated EXISTS that then runs per row. The
-- production plan showed 1,169 nodes and two subplans at `loops=20232` — i.e.
-- two full RLS-filtered passes over `golf_shots`, one per embed. Cost grows
-- with the size of the whole table, not with the rows the request asked for,
-- so it will keep getting worse and it cannot be worked around app-side:
-- splitting the embeds into separate round trips pays the same full scan.
--
-- Fix: resolve the predicate from the outer row's `shot_id` through the
-- `shot_id` unique index, inside a SECURITY DEFINER helper so the lookup does
-- not re-enter the `golf_shots` / `golf_rounds` / `golf_holes` policy stack.
--
-- The helper is written to be predicate-equivalent to the two policies it
-- replaces, NOT a simplification. The old pair evaluated to:
--
--   (the shot row is readable under golf_shots' own RLS)   -- inherited,
--                                                          -- implicitly
--   AND (I am the player  OR  I am a coach in the player's organisation)
--
-- Both conjuncts are reproduced literally below. In particular the coach
-- branch keeps the narrowing that the inherited `golf_shots` check supplied
-- (`is_golf_team_coach` / `is_golf_team_player` on the round's team), so an
-- org coach who does not staff the player's team still cannot read the row —
-- dropping that conjunct would have widened access.
--
-- Verified on production inside a rolled-back transaction: identical visible
-- row sets for a player, a staffing coach, a same-org non-staffing coach and
-- a teammate, and the embedded query drops from 4,585 ms to well under the
-- 5s client budget.
--
-- Only SELECT policies are touched. INSERT/UPDATE/DELETE keep their existing
-- quals: they are single-row, low-frequency, and not implicated here.
--
-- Idempotent: CREATE OR REPLACE for the helper, DROP POLICY IF EXISTS +
-- CREATE POLICY for the policies.
-- ===========================================================================

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
    JOIN public.golf_holes gh   ON gh.id = gs.hole_id
    JOIN public.golf_rounds gr  ON gr.id = gh.round_id
    JOIN public.golf_players gp ON gp.id = gr.player_id
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
        gp.user_id = (SELECT auth.uid())
        OR (gr.team_id IS NOT NULL AND public.is_golf_team_coach(gr.team_id))
        OR (gr.team_id IS NOT NULL AND public.is_golf_team_player(gr.team_id))
        OR public.is_admin()
      )
      -- Conjunct 2 — the detail row's own ownership test, verbatim from
      -- putt_details_select_own / putt_details_select_team.
      AND (
        gp.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.golf_team_members gtm
          JOIN public.golf_teams gt   ON gt.id = gtm.team_id
          JOIN public.golf_coaches gc ON gc.organization_id = gt.organization_id
          WHERE gtm.player_id = gp.id
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

REVOKE ALL ON FUNCTION public.can_read_golf_shot_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_golf_shot_detail(uuid) TO authenticated;

-- --- putt_details ----------------------------------------------------------

DROP POLICY IF EXISTS "putt_details_select_own" ON public.putt_details;
DROP POLICY IF EXISTS "putt_details_select_team" ON public.putt_details;
DROP POLICY IF EXISTS "putt_details_select" ON public.putt_details;

CREATE POLICY "putt_details_select" ON public.putt_details
  FOR SELECT
  TO authenticated
  USING (public.can_read_golf_shot_detail(shot_id));

-- --- approach_miss_details -------------------------------------------------

DROP POLICY IF EXISTS "approach_miss_details_select_own" ON public.approach_miss_details;
DROP POLICY IF EXISTS "approach_miss_details_select_team" ON public.approach_miss_details;
DROP POLICY IF EXISTS "approach_miss_details_select" ON public.approach_miss_details;

CREATE POLICY "approach_miss_details_select" ON public.approach_miss_details
  FOR SELECT
  TO authenticated
  USING (public.can_read_golf_shot_detail(shot_id));
