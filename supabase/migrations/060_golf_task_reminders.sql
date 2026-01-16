-- Migration: 060_golf_task_reminders
-- Description: Create golf_task_reminders table for task reminder queue
-- This table stores scheduled reminders that are processed by the edge function

-- Create reminder type enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE reminder_type AS ENUM ('in_app', 'email', 'push', 'all');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create the golf_task_reminders table
CREATE TABLE IF NOT EXISTS golf_task_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES golf_tasks(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMPTZ NOT NULL,
    reminder_type reminder_type NOT NULL DEFAULT 'in_app',
    sent BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add reminder columns to golf_tasks if they don't exist
DO $$ BEGIN
    ALTER TABLE golf_tasks ADD COLUMN reminder_at TIMESTAMPTZ;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE golf_tasks ADD COLUMN reminder_type reminder_type;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE golf_tasks ADD COLUMN reminder_sent BOOLEAN DEFAULT FALSE;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_golf_task_reminders_task_id
    ON golf_task_reminders(task_id);

CREATE INDEX IF NOT EXISTS idx_golf_task_reminders_scheduled_for
    ON golf_task_reminders(scheduled_for)
    WHERE sent = FALSE;

CREATE INDEX IF NOT EXISTS idx_golf_task_reminders_pending
    ON golf_task_reminders(sent, scheduled_for)
    WHERE sent = FALSE;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_golf_task_reminders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS golf_task_reminders_updated_at ON golf_task_reminders;
CREATE TRIGGER golf_task_reminders_updated_at
    BEFORE UPDATE ON golf_task_reminders
    FOR EACH ROW
    EXECUTE FUNCTION update_golf_task_reminders_updated_at();

-- RLS Policies
ALTER TABLE golf_task_reminders ENABLE ROW LEVEL SECURITY;

-- Coaches can view reminders for their team's tasks
CREATE POLICY "Coaches can view team task reminders" ON golf_task_reminders
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM golf_tasks t
            JOIN golf_coaches c ON c.team_id = t.team_id
            WHERE t.id = golf_task_reminders.task_id
            AND c.user_id = auth.uid()
        )
    );

-- Coaches can create reminders for their team's tasks
CREATE POLICY "Coaches can create team task reminders" ON golf_task_reminders
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM golf_tasks t
            JOIN golf_coaches c ON c.team_id = t.team_id
            WHERE t.id = golf_task_reminders.task_id
            AND c.user_id = auth.uid()
        )
    );

-- Coaches can update reminders for their team's tasks
CREATE POLICY "Coaches can update team task reminders" ON golf_task_reminders
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM golf_tasks t
            JOIN golf_coaches c ON c.team_id = t.team_id
            WHERE t.id = golf_task_reminders.task_id
            AND c.user_id = auth.uid()
        )
    );

-- Coaches can delete reminders for their team's tasks
CREATE POLICY "Coaches can delete team task reminders" ON golf_task_reminders
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM golf_tasks t
            JOIN golf_coaches c ON c.team_id = t.team_id
            WHERE t.id = golf_task_reminders.task_id
            AND c.user_id = auth.uid()
        )
    );

-- Service role can do everything (for edge function processing)
CREATE POLICY "Service role full access" ON golf_task_reminders
    FOR ALL
    USING (auth.role() = 'service_role');

-- Add comment for documentation
COMMENT ON TABLE golf_task_reminders IS 'Queue for scheduled task reminders processed by edge function';
COMMENT ON COLUMN golf_task_reminders.scheduled_for IS 'When the reminder should be sent';
COMMENT ON COLUMN golf_task_reminders.reminder_type IS 'How to send: in_app, email, push, or all';
COMMENT ON COLUMN golf_task_reminders.sent IS 'Whether the reminder has been processed';
COMMENT ON COLUMN golf_task_reminders.sent_at IS 'When the reminder was actually sent';
COMMENT ON COLUMN golf_task_reminders.error IS 'Error message if sending failed';
