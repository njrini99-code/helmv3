-- ============================================================================
-- Migration: 045_golf_task_assignments.sql
-- Purpose: Task assignments table for tracking individual player task assignments
-- Required by: CreateTaskModal.tsx - inserts into golf_task_assignments
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE ENUM TYPE FOR TASK ASSIGNMENT STATUS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE golf_task_assignment_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'overdue'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PART 2: CREATE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES golf_tasks(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  status golf_task_assignment_status DEFAULT 'pending',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT,

  -- Ensure each player can only be assigned to a task once
  CONSTRAINT golf_task_assignments_unique_assignment UNIQUE(task_id, player_id)
);

-- ============================================================================
-- PART 3: INDEXES FOR PERFORMANCE
-- ============================================================================

-- Primary lookup patterns
CREATE INDEX IF NOT EXISTS idx_golf_task_assignments_task_id
  ON golf_task_assignments(task_id);

CREATE INDEX IF NOT EXISTS idx_golf_task_assignments_player_id
  ON golf_task_assignments(player_id);

-- Status filtering (for dashboards showing pending/overdue tasks)
CREATE INDEX IF NOT EXISTS idx_golf_task_assignments_status
  ON golf_task_assignments(status);

-- Combined index for player's pending tasks (common query)
CREATE INDEX IF NOT EXISTS idx_golf_task_assignments_player_status
  ON golf_task_assignments(player_id, status)
  WHERE status IN ('pending', 'in_progress');

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE golf_task_assignments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: RLS POLICIES
-- ============================================================================

-- Coaches can view all task assignments for their team's tasks
CREATE POLICY "golf_task_assignments_select_coaches"
ON golf_task_assignments FOR SELECT TO authenticated
USING (
  task_id IN (
    SELECT id FROM golf_tasks
    WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  )
);

-- Players can view their own task assignments
CREATE POLICY "golf_task_assignments_select_own"
ON golf_task_assignments FOR SELECT TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- Coaches can insert task assignments for their team's tasks
CREATE POLICY "golf_task_assignments_insert_coaches"
ON golf_task_assignments FOR INSERT TO authenticated
WITH CHECK (
  task_id IN (
    SELECT id FROM golf_tasks
    WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  )
);

-- Coaches can update any task assignment for their team
CREATE POLICY "golf_task_assignments_update_coaches"
ON golf_task_assignments FOR UPDATE TO authenticated
USING (
  task_id IN (
    SELECT id FROM golf_tasks
    WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  task_id IN (
    SELECT id FROM golf_tasks
    WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  )
);

-- Players can update their own task assignments (mark complete, add notes)
CREATE POLICY "golf_task_assignments_update_own"
ON golf_task_assignments FOR UPDATE TO authenticated
USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()))
WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- Coaches can delete task assignments for their team
CREATE POLICY "golf_task_assignments_delete_coaches"
ON golf_task_assignments FOR DELETE TO authenticated
USING (
  task_id IN (
    SELECT id FROM golf_tasks
    WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())
  )
);

-- ============================================================================
-- PART 6: HELPER FUNCTION - Get player's assigned tasks with status
-- ============================================================================

CREATE OR REPLACE FUNCTION get_player_assigned_tasks(p_player_id UUID)
RETURNS TABLE (
  assignment_id UUID,
  task_id UUID,
  title TEXT,
  description TEXT,
  due_date DATE,
  urgency golf_urgency_level,
  requires_upload BOOLEAN,
  assignment_status golf_task_assignment_status,
  assigned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ta.id as assignment_id,
    t.id as task_id,
    t.title,
    t.description,
    t.due_date,
    t.urgency,
    t.requires_upload,
    ta.status as assignment_status,
    ta.assigned_at,
    ta.completed_at,
    ta.notes
  FROM golf_task_assignments ta
  JOIN golf_tasks t ON t.id = ta.task_id
  WHERE ta.player_id = p_player_id
  ORDER BY
    CASE
      WHEN ta.status = 'overdue' THEN 0
      WHEN ta.status = 'in_progress' THEN 1
      WHEN ta.status = 'pending' THEN 2
      WHEN ta.status = 'completed' THEN 3
    END,
    t.due_date ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 7: TRIGGER - Auto-update status to overdue
-- ============================================================================

CREATE OR REPLACE FUNCTION update_overdue_task_assignments()
RETURNS TRIGGER AS $$
BEGIN
  -- When a task's due_date passes, mark pending assignments as overdue
  UPDATE golf_task_assignments
  SET status = 'overdue'
  WHERE task_id = NEW.id
    AND status = 'pending'
    AND NEW.due_date < CURRENT_DATE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on golf_tasks update (for when due_date changes)
DROP TRIGGER IF EXISTS trg_update_overdue_assignments ON golf_tasks;
CREATE TRIGGER trg_update_overdue_assignments
  AFTER UPDATE OF due_date ON golf_tasks
  FOR EACH ROW
  WHEN (NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE)
  EXECUTE FUNCTION update_overdue_task_assignments();

-- ============================================================================
-- PART 8: DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE golf_task_assignments IS 'Individual task assignments linking tasks to specific players with status tracking';
COMMENT ON COLUMN golf_task_assignments.task_id IS 'Reference to the parent task';
COMMENT ON COLUMN golf_task_assignments.player_id IS 'The player this task is assigned to';
COMMENT ON COLUMN golf_task_assignments.status IS 'Current status: pending, in_progress, completed, overdue';
COMMENT ON COLUMN golf_task_assignments.assigned_at IS 'When the task was assigned to this player';
COMMENT ON COLUMN golf_task_assignments.completed_at IS 'When the player completed the task (NULL if not completed)';
COMMENT ON COLUMN golf_task_assignments.notes IS 'Player notes or coach feedback on completion';

COMMENT ON FUNCTION get_player_assigned_tasks IS 'Returns all tasks assigned to a player with full task details';
