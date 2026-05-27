-- head_coach_id was incorrectly added to baseball_teams; the canonical team-coach
-- relationship is tracked via baseball_team_coach_staff (with is_primary flag).
ALTER TABLE baseball_teams DROP COLUMN IF EXISTS head_coach_id;
