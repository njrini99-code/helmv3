-- ============================================================================
-- Migration: 20260610160000_program_onboarding_backfill.sql
-- Purpose  : Data-cleanliness backfill for multi-team program support.
-- Safe     : All statements are idempotent (ON CONFLICT DO NOTHING / NOT EXISTS
--            guards). No grants to anon.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Repair any golf_teams rows with NULL gender.
--    The CHECK constraint and DEFAULT were added in 20260607160000 so every NEW
--    row is safe. This covers legacy rows that may pre-date the constraint or
--    were inserted before the DEFAULT was applied.
-- ----------------------------------------------------------------------------
UPDATE golf_teams
SET    gender = 'mens'
WHERE  gender IS NULL;

-- ----------------------------------------------------------------------------
-- 2. Backfill missing golf_team_coach_staff rows.
--
--    Background: some coaches were created before the staff-row requirement was
--    enforced by onboarding. Their team linkage exists ONLY via the org-based
--    fallback (resolveCoachTeamId: org → "team with most active members, then
--    most-recently-created"). We mirror that exact heuristic here in SQL:
--
--      For each coach that has an organization_id but NO staff row at all,
--      find the team in their org with the most active golf_team_members
--      rows (tie-break: most recently created team) and insert a head_coach
--      staff row with is_primary = true.
--
--    We only create staff rows when ZERO rows exist for the coach — coaches
--    who already have at least one staff row on any team are intentionally
--    skipped to avoid creating duplicate is_primary=true rows.
-- ----------------------------------------------------------------------------

-- CTE: coaches that have an org but zero staff rows.
WITH coaches_without_staff AS (
  SELECT c.id   AS coach_id,
         c.organization_id
  FROM   golf_coaches c
  WHERE  c.organization_id IS NOT NULL
    AND  NOT EXISTS (
           SELECT 1
           FROM   golf_team_coach_staff s
           WHERE  s.coach_id = c.id
         )
),

-- CTE: for each such coach, rank all teams in their org by active-member count
-- then by creation date (mirrors resolveCoachTeamId).
ranked_teams AS (
  SELECT
    cws.coach_id,
    gt.id   AS team_id,
    ROW_NUMBER() OVER (
      PARTITION BY cws.coach_id
      ORDER BY
        COUNT(tm.player_id) FILTER (WHERE tm.status = 'active') DESC,
        gt.created_at DESC NULLS LAST
    ) AS rn
  FROM  coaches_without_staff cws
  JOIN  golf_teams gt ON gt.organization_id = cws.organization_id
  LEFT JOIN golf_team_members tm ON tm.team_id = gt.id
  GROUP BY cws.coach_id, gt.id, gt.created_at
)

-- Insert one head_coach / is_primary = true staff row per coach.
-- ON CONFLICT DO NOTHING guards against the (team_id, coach_id) unique
-- constraint if an identical row somehow already exists.
INSERT INTO golf_team_coach_staff (team_id, coach_id, role, is_primary)
SELECT r.team_id,
       r.coach_id,
       'head_coach',
       true
FROM   ranked_teams r
WHERE  r.rn = 1
ON CONFLICT (team_id, coach_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- End of migration.
-- No anon grants. No destructive operations.
-- ----------------------------------------------------------------------------
