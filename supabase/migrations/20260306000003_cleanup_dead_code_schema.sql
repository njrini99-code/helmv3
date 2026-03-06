-- ============================================================================
-- Clean up dead code and schema inconsistencies
-- ============================================================================

-- 1. Drop the DB cleanup function that references is_draft
DROP FUNCTION IF EXISTS cleanup_old_golf_drafts();

-- 2. Drop the RLS policy that references is_draft
DROP POLICY IF EXISTS "Players can view own drafts" ON golf_rounds;

-- 3. Drop partial indexes on is_draft
DROP INDEX IF EXISTS idx_golf_rounds_player_draft;
DROP INDEX IF EXISTS idx_golf_rounds_draft_autosave;

-- 4. Drop the is_draft column (no longer used — status='in_progress' identifies drafts)
ALTER TABLE golf_rounds DROP COLUMN IF EXISTS is_draft;

-- 5. Fix broken qualifier leaderboard function (uses round_status instead of status)
CREATE OR REPLACE FUNCTION get_qualifier_leaderboard(qualifier_uuid UUID)
RETURNS TABLE (
  player_id UUID,
  first_name TEXT,
  last_name TEXT,
  rounds_played BIGINT,
  total_score BIGINT,
  avg_score NUMERIC,
  best_score INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gqe.player_id,
    gp.first_name,
    gp.last_name,
    COUNT(gr.id) AS rounds_played,
    COALESCE(SUM(gr.total_score), 0)::BIGINT AS total_score,
    CASE WHEN COUNT(gr.id) > 0 THEN ROUND(AVG(gr.total_score)::NUMERIC, 1) ELSE NULL END AS avg_score,
    MIN(gr.total_score) AS best_score
  FROM golf_qualifier_entries gqe
  JOIN golf_players gp ON gp.id = gqe.player_id
  LEFT JOIN golf_rounds gr ON gr.qualifier_id = qualifier_uuid
    AND gr.player_id = gqe.player_id
    AND gr.status = 'completed'
  WHERE gqe.qualifier_id = qualifier_uuid
  GROUP BY gqe.player_id, gp.first_name, gp.last_name
  ORDER BY
    CASE WHEN COUNT(gr.id) > 0 THEN 0 ELSE 1 END,
    COALESCE(SUM(gr.total_score), 0) ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_qualifier_leaderboard(UUID) TO authenticated;
