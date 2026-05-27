-- =============================================================================
-- Tier-1 evidence-backed insights (par-scoring, putt-distance, etc.) were
-- being inserted into golf_coach_insights with coach_id = NULL AND team_id =
-- NULL because lib/coachhelm/v2/insights/upsert.ts:insertNew never populated
-- those columns. The existing "Coaches can view their own insights" RLS
-- policy requires one of those columns to match the caller's coach/team, so
-- every Tier-1 insight was effectively invisible to the coach UI even
-- though the engine had written it. End result: the player insight page
-- and the team Deep Analysis tab consistently showed "0 insights".
--
-- Two fixes here:
--   1. Backfill coach_id + team_id on existing orphaned rows from the
--      player's active team membership (player → team → org → coach).
--   2. Add a defense-in-depth RLS policy that lets a coach read any
--      insight for a player they staff via golf_team_coach_staff —
--      regardless of whether coach_id/team_id are set on the row. The
--      writer fix in upsert.ts will populate them going forward.
-- =============================================================================

-- 1. Backfill coach_id + team_id on rows missing them.
WITH player_team AS (
  SELECT DISTINCT ON (tm.player_id)
    tm.player_id,
    tm.team_id,
    c.id AS coach_id
  FROM public.golf_team_members tm
  JOIN public.golf_teams t ON t.id = tm.team_id
  JOIN public.golf_coaches c ON c.organization_id = t.organization_id
  WHERE tm.status = 'active'
  ORDER BY tm.player_id, tm.created_at ASC NULLS LAST
)
UPDATE public.golf_coach_insights gci
SET
  coach_id = COALESCE(gci.coach_id, pt.coach_id),
  team_id  = COALESCE(gci.team_id,  pt.team_id)
FROM player_team pt
WHERE gci.player_id = pt.player_id
  AND (gci.coach_id IS NULL OR gci.team_id IS NULL);

-- 2. New RLS policy: coach who staffs the player's active team can read
--    insights regardless of whether coach_id/team_id are set. This makes
--    future orphans recoverable without a re-backfill.
DROP POLICY IF EXISTS coach_insights_select_via_player_team ON public.golf_coach_insights;
CREATE POLICY coach_insights_select_via_player_team
  ON public.golf_coach_insights
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.golf_team_members tm
      JOIN public.golf_team_coach_staff tcs ON tcs.team_id = tm.team_id
      JOIN public.golf_coaches c ON c.id = tcs.coach_id
      WHERE tm.player_id = golf_coach_insights.player_id
        AND tm.status = 'active'
        AND c.user_id = auth.uid()
    )
  );
