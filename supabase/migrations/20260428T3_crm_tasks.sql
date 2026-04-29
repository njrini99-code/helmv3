-- ============================================================================
-- Migration: 20260428T3_crm_tasks.sql
-- Purpose: CRM-specific tasks (follow-ups, calls, demos, research). Mirrors
--          the shape of golf_tasks but scoped to coaches in crm_coaches.
--          Source field allows future automation/sequence/AI-suggestion entries
--          (Phase 2-4) to coexist with manual tasks.
-- ============================================================================

CREATE TABLE crm_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES crm_coaches(id) ON DELETE CASCADE,
  assignee_id     uuid REFERENCES auth.users(id),
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  title           text NOT NULL CHECK (length(title) <= 200),
  description     text CHECK (description IS NULL OR length(description) <= 2000),
  due_at          timestamptz,
  completed_at    timestamptz,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','canceled')),
  priority        text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  kind            text DEFAULT 'general' CHECK (kind IN ('general','follow_up','call','demo','email','research')),
  source          text DEFAULT 'manual' CHECK (source IN ('manual','automation','sequence','ai_suggestion')),
  reminder_at     timestamptz,
  reminder_sent   boolean NOT NULL DEFAULT false,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_tasks_coach ON crm_tasks (coach_id, status, due_at);
CREATE INDEX idx_crm_tasks_assignee ON crm_tasks (assignee_id, status, due_at) WHERE status IN ('pending','in_progress');
CREATE INDEX idx_crm_tasks_due ON crm_tasks (due_at) WHERE status IN ('pending','in_progress') AND due_at IS NOT NULL;

-- ============================================================================
-- updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_crm_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_tasks_updated_at
  BEFORE UPDATE ON crm_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_tasks_updated_at();

-- ============================================================================
-- RLS — admin-only (mirrors crm_coaches pattern)
-- ============================================================================
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all tasks"
  ON crm_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert tasks"
  ON crm_tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update tasks"
  ON crm_tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete tasks"
  ON crm_tasks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
