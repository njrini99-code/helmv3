-- Regrade 2026-06-09 SEC-P1 + STATS-P3.
--
-- 1) golf_rounds_update WITH CHECK: the player self-update policy had
--    WITH CHECK = null, so Postgres reused the USING expression — which only
--    constrains player OWNERSHIP and never references team_id. Combined with
--    the table-wide UPDATE grant (20260607120000), an authenticated player
--    could PATCH their own round's team_id to ANY team uuid, injecting a
--    cross-team row into a victim coach's feed/aggregates. Pin team_id: a
--    player may only file a round under a team they are an active member of
--    (or no team). player_id stays pinned by the ownership EXISTS.
--    The coach policies (golf_rounds_update_coach / _team) are unchanged —
--    coach membership is already constrained by their own predicates.
--
-- 2) Backfill golf_rounds.total_penalties from the canonical per-hole sum.
--    Migration 20260608140000 declared the column drifted and routed the
--    cache around it, but 8 completed rounds still carried total_penalties=0
--    against a golf_holes sum of 1, and round-detail surfaces
--    (src/app/golf/actions/golf.ts) still read the round column.
--
-- VERIFIED 2026-06-09 against prod (qmnssrrolpinvwjjnufo): with_check
--   non-null on golf_rounds_update and references is_golf_team_player;
--   post-backfill drift query (total_penalties vs SUM(golf_holes.penalty_strokes)
--   over completed+scored rounds) returns 0 rows.
-- HISTORY: applied via MCP apply_migration (apply-time version stamp, NOT this
--   filename). Do not re-apply via db push.
-- ROLLBACK: ALTER POLICY "golf_rounds_update" ON public.golf_rounds
--   TO authenticated USING (<ownership EXISTS>) — dropping the WITH CHECK
--   restores the prior (vulnerable) behavior; the backfill needs no rollback
--   (it equals the canonical per-hole truth).

ALTER POLICY "golf_rounds_update" ON public.golf_rounds
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM public.golf_players
      WHERE golf_players.id = golf_rounds.player_id
        AND golf_players.user_id = auth.uid()
    ))
    AND (team_id IS NULL OR public.is_golf_team_player(team_id))
  );

UPDATE public.golf_rounds r
SET total_penalties = h.penalty_sum
FROM (
  SELECT round_id, COALESCE(SUM(penalty_strokes), 0) AS penalty_sum
  FROM public.golf_holes
  GROUP BY round_id
) h
WHERE r.id = h.round_id
  AND r.total_penalties IS DISTINCT FROM h.penalty_sum;
