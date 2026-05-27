-- ============================================================================
-- Migration: 056_task_enhancements.sql
-- Purpose: Add task reminders and task templates functionality
-- ============================================================================

-- ============================================================================
-- PART 1: ADD REMINDER COLUMNS TO golf_tasks
-- ============================================================================

-- Add reminder columns to existing golf_tasks table
ALTER TABLE golf_tasks ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE golf_tasks ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;
ALTER TABLE golf_tasks ADD COLUMN IF NOT EXISTS category TEXT;

-- Index for finding tasks with pending reminders
CREATE INDEX IF NOT EXISTS idx_golf_tasks_reminder_pending
  ON golf_tasks(reminder_at)
  WHERE reminder_at IS NOT NULL AND reminder_sent = false;

-- ============================================================================
-- PART 2: CREATE TASK TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS golf_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  default_assignee_type TEXT DEFAULT 'all_players', -- 'all_players', 'specific_role', 'coach', 'individual'
  category TEXT,
  default_priority TEXT DEFAULT 'normal',
  default_due_days INTEGER, -- Number of days from creation date for due date
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 3: INDEXES FOR TASK TEMPLATES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_golf_task_templates_team_id
  ON golf_task_templates(team_id);

CREATE INDEX IF NOT EXISTS idx_golf_task_templates_category
  ON golf_task_templates(team_id, category);

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY FOR TEMPLATES
-- ============================================================================

ALTER TABLE golf_task_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: RLS POLICIES FOR TASK TEMPLATES
-- ============================================================================

-- Coaches can view templates for their team
CREATE POLICY "golf_task_templates_select_coaches"
ON golf_task_templates FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT gt.id FROM golf_teams gt
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE gc.user_id = auth.uid()
  )
);

-- Players can view templates for their team (read-only for quick reference)
CREATE POLICY "golf_task_templates_select_players"
ON golf_task_templates FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT team_id FROM golf_team_members gtm
    JOIN golf_players gp ON gp.id = gtm.player_id
    WHERE gp.user_id = auth.uid()
  )
);

-- Coaches can create templates for their team
CREATE POLICY "golf_task_templates_insert_coaches"
ON golf_task_templates FOR INSERT TO authenticated
WITH CHECK (
  team_id IN (
    SELECT gt.id FROM golf_teams gt
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE gc.user_id = auth.uid()
  )
);

-- Coaches can update templates for their team
CREATE POLICY "golf_task_templates_update_coaches"
ON golf_task_templates FOR UPDATE TO authenticated
USING (
  team_id IN (
    SELECT gt.id FROM golf_teams gt
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE gc.user_id = auth.uid()
  )
)
WITH CHECK (
  team_id IN (
    SELECT gt.id FROM golf_teams gt
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE gc.user_id = auth.uid()
  )
);

-- Coaches can delete templates for their team
CREATE POLICY "golf_task_templates_delete_coaches"
ON golf_task_templates FOR DELETE TO authenticated
USING (
  team_id IN (
    SELECT gt.id FROM golf_teams gt
    JOIN golf_coaches gc ON gc.organization_id = gt.organization_id
    WHERE gc.user_id = auth.uid()
  )
);

-- ============================================================================
-- PART 6: HELPER FUNCTION - Get tasks needing reminder notifications
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_task_reminders()
RETURNS TABLE (
  task_id UUID,
  team_id UUID,
  title TEXT,
  due_date DATE,
  reminder_at TIMESTAMPTZ,
  assigned_to UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as task_id,
    t.team_id,
    t.title,
    t.due_date,
    t.reminder_at,
    t.assigned_to
  FROM golf_tasks t
  WHERE t.reminder_at IS NOT NULL
    AND t.reminder_at <= NOW()
    AND t.reminder_sent = false
    AND t.status != 'completed'
  ORDER BY t.reminder_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 7: FUNCTION TO MARK REMINDERS AS SENT
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_task_reminder_sent(p_task_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE golf_tasks
  SET reminder_sent = true
  WHERE id = p_task_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 8: UPDATE TIMESTAMP TRIGGER FOR TEMPLATES
-- ============================================================================

CREATE OR REPLACE FUNCTION update_golf_task_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_golf_task_templates_updated_at ON golf_task_templates;
CREATE TRIGGER trg_golf_task_templates_updated_at
  BEFORE UPDATE ON golf_task_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_golf_task_templates_updated_at();

-- ============================================================================
-- PART 9: SEED SOME DEFAULT TEMPLATES (Optional - can be removed)
-- ============================================================================

-- Note: These will only be inserted if there's a team_id to reference
-- This is a pattern for the application to use when creating templates

COMMENT ON TABLE golf_task_templates IS 'Reusable task templates for quick task creation';
COMMENT ON COLUMN golf_task_templates.default_assignee_type IS 'Who to assign by default: all_players, specific_role, coach, individual';
COMMENT ON COLUMN golf_task_templates.default_due_days IS 'Number of days from task creation for the default due date';
COMMENT ON COLUMN golf_tasks.reminder_at IS 'When to send a reminder notification for this task';
COMMENT ON COLUMN golf_tasks.reminder_sent IS 'Whether the reminder notification has been sent';
COMMENT ON COLUMN golf_tasks.category IS 'Task category for organization and filtering';
