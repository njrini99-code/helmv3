-- ============================================================================
-- Migration: 026_golf_tasks.sql
-- Purpose: Golf tasks assigned to players
-- Consolidated from: 016_create_golf_schema.sql (tasks section)
-- ============================================================================

-- Golf Tasks
CREATE TABLE IF NOT EXISTS golf_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES golf_players(id) ON DELETE CASCADE, -- NULL = all players
  due_date DATE,
  urgency golf_urgency_level DEFAULT 'normal',
  requires_upload BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_tasks_team ON golf_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_tasks_due ON golf_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_golf_tasks_assigned ON golf_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_golf_tasks_urgency ON golf_tasks(urgency);

-- Golf Task Completions
CREATE TABLE IF NOT EXISTS golf_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES golf_tasks(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  upload_url TEXT,
  notes TEXT,
  UNIQUE(task_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_completions_task ON golf_task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_golf_completions_player ON golf_task_completions(player_id);

-- Triggers
CREATE TRIGGER update_golf_tasks_updated_at
  BEFORE UPDATE ON golf_tasks
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Helper function: Get task status for a player
CREATE OR REPLACE FUNCTION get_player_task_status(p_player_id UUID)
RETURNS TABLE (
  task_id UUID,
  title TEXT,
  due_date DATE,
  urgency golf_urgency_level,
  status golf_task_status,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as task_id,
    t.title,
    t.due_date,
    t.urgency,
    CASE
      WHEN tc.completed_at IS NOT NULL THEN 'completed'::golf_task_status
      WHEN t.due_date < CURRENT_DATE THEN 'overdue'::golf_task_status
      ELSE 'pending'::golf_task_status
    END as status,
    tc.completed_at
  FROM golf_tasks t
  LEFT JOIN golf_task_completions tc ON tc.task_id = t.id AND tc.player_id = p_player_id
  WHERE t.assigned_to IS NULL OR t.assigned_to = p_player_id
  ORDER BY
    CASE WHEN tc.completed_at IS NOT NULL THEN 1 ELSE 0 END,
    t.due_date ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Documentation
COMMENT ON TABLE golf_tasks IS 'Tasks assigned to players by coaches';
COMMENT ON TABLE golf_task_completions IS 'Player task completion records';
