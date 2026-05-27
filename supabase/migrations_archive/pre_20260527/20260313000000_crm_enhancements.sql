-- Migration: CRM Enhancements
-- Simplify coach_status enum, add indexes, bounce/archive fields, audit log, RPC functions, email templates

-- ============================================================================
-- A. Simplify coach_status enum from 15 → 7 statuses
-- ============================================================================

-- Drop functions that depend on old coach_status enum
DROP FUNCTION IF EXISTS get_crm_pipeline_summary();
DROP FUNCTION IF EXISTS log_coach_contact(uuid, contact_type, text, text, timestamptz, coach_status);

-- Create new enum
CREATE TYPE coach_status_v2 AS ENUM ('new_lead', 'contacted', 'engaged', 'proposal', 'won', 'lost', 'nurture');

-- Add temp column, migrate data, swap
ALTER TABLE crm_coaches ADD COLUMN status_new coach_status_v2 DEFAULT 'new_lead';
UPDATE crm_coaches SET status_new = CASE status::text
  WHEN 'new_lead' THEN 'new_lead'::coach_status_v2
  WHEN 'researching' THEN 'contacted'::coach_status_v2
  WHEN 'outreach_pending' THEN 'contacted'::coach_status_v2
  WHEN 'initial_contact' THEN 'contacted'::coach_status_v2
  WHEN 'follow_up' THEN 'contacted'::coach_status_v2
  WHEN 'engaged' THEN 'engaged'::coach_status_v2
  WHEN 'demo_scheduled' THEN 'engaged'::coach_status_v2
  WHEN 'demo_completed' THEN 'engaged'::coach_status_v2
  WHEN 'proposal_sent' THEN 'proposal'::coach_status_v2
  WHEN 'negotiating' THEN 'proposal'::coach_status_v2
  WHEN 'closed_won' THEN 'won'::coach_status_v2
  WHEN 'closed_lost' THEN 'lost'::coach_status_v2
  WHEN 'not_interested' THEN 'lost'::coach_status_v2
  WHEN 'bad_timing' THEN 'nurture'::coach_status_v2
  WHEN 'nurture' THEN 'nurture'::coach_status_v2
  ELSE 'new_lead'::coach_status_v2
END;
ALTER TABLE crm_coaches ALTER COLUMN status_new SET NOT NULL;
ALTER TABLE crm_coaches DROP COLUMN status;
ALTER TABLE crm_coaches RENAME COLUMN status_new TO status;
ALTER TABLE crm_coaches ALTER COLUMN status SET DEFAULT 'new_lead'::coach_status_v2;
DROP TYPE IF EXISTS coach_status;
ALTER TYPE coach_status_v2 RENAME TO coach_status;

-- ============================================================================
-- B. Missing indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_crm_contact_log_type ON crm_contact_log(contact_type);
CREATE INDEX IF NOT EXISTS idx_crm_contact_log_created_by ON crm_contact_log(created_by);
CREATE INDEX IF NOT EXISTS idx_crm_email_events_created_at ON crm_email_events(created_at);
CREATE INDEX IF NOT EXISTS idx_crm_coaches_created_at ON crm_coaches(created_at);
CREATE INDEX IF NOT EXISTS idx_crm_coaches_email ON crm_coaches(email) WHERE email IS NOT NULL;

-- ============================================================================
-- C. Bounce suppression + source + soft delete fields
-- ============================================================================

ALTER TABLE crm_coaches ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'valid' CHECK (email_status IN ('valid', 'bounced', 'complained', 'unknown'));
ALTER TABLE crm_coaches ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE crm_coaches ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE crm_coaches ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE crm_coaches ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_crm_coaches_email_status ON crm_coaches(email_status);
CREATE INDEX IF NOT EXISTS idx_crm_coaches_archived ON crm_coaches(is_archived) WHERE is_archived = TRUE;

-- ============================================================================
-- D. Audit log table
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create','update','delete','status_change','email_sent','contact_logged')),
  changed_by UUID REFERENCES users(id),
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_activity_log_record ON crm_activity_log(record_id);
CREATE INDEX IF NOT EXISTS idx_crm_activity_log_action ON crm_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_crm_activity_log_created ON crm_activity_log(created_at DESC);
ALTER TABLE crm_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view activity log" ON crm_activity_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));
CREATE POLICY "Admins can insert activity log" ON crm_activity_log FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- ============================================================================
-- E. New RPC functions
-- ============================================================================

-- Per-coach email event details (joins through contact_log to get subject and coach linkage)
CREATE OR REPLACE FUNCTION get_crm_coach_email_events(p_coach_id UUID)
RETURNS TABLE (
  id UUID,
  event_type TEXT,
  subject TEXT,
  occurred_at TIMESTAMPTZ,
  recipient_email TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ee.id,
    ee.event_type::text,
    cl.subject,
    ee.occurred_at,
    ee.recipient_email
  FROM crm_email_events ee
  JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
  WHERE cl.coach_id = p_coach_id
  ORDER BY ee.occurred_at DESC;
$$;

-- Detailed email stats: totals + recent events + bounced coaches
CREATE OR REPLACE FUNCTION get_crm_email_stats_detailed()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'totals', (
      SELECT json_build_object(
        'sent', COUNT(*) FILTER (WHERE event_type = 'email.sent'),
        'delivered', COUNT(*) FILTER (WHERE event_type = 'email.delivered'),
        'opened', COUNT(*) FILTER (WHERE event_type = 'email.opened'),
        'clicked', COUNT(*) FILTER (WHERE event_type = 'email.clicked'),
        'bounced', COUNT(*) FILTER (WHERE event_type = 'email.bounced'),
        'complained', COUNT(*) FILTER (WHERE event_type = 'email.complained')
      )
      FROM crm_email_events
    ),
    'recent_events', (
      SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
      FROM (
        SELECT ee.id, ee.event_type, cl.subject, ee.occurred_at, ee.recipient_email,
               c.name AS coach_name, c.school
        FROM crm_email_events ee
        LEFT JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
        LEFT JOIN crm_coaches c ON c.id = cl.coach_id
        ORDER BY ee.occurred_at DESC
        LIMIT 50
      ) r
    ),
    'bounced_coaches', (
      SELECT COALESCE(json_agg(row_to_json(b)), '[]'::json)
      FROM (
        SELECT c.id, c.name, c.email, c.school, c.email_status
        FROM crm_coaches c
        WHERE c.email_status IN ('bounced', 'complained')
        ORDER BY c.updated_at DESC
      ) b
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- ============================================================================
-- F. Email templates table
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('intro','follow_up','demo_invite','proposal','check_in','general')),
  merge_tags TEXT[] DEFAULT '{}',
  is_default BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE crm_email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage templates" ON crm_email_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Seed default templates
INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default) VALUES
(
  'Introduction',
  'Helm Sports Labs — Elevate {school} Golf',
  E'Hi {name},\n\nI hope this message finds you well. I''m reaching out because we''ve been working with college golf programs like {school} to streamline team management and unlock data-driven coaching insights.\n\nHelm Sports Labs is an all-in-one platform built specifically for college golf — covering round tracking, stats analytics, roster management, and AI-powered coaching intelligence.\n\nWould you be open to a quick 15-minute call to see if it might be a fit for {conference}?\n\nBest,\nHelm Sports Labs',
  'intro',
  ARRAY['{name}', '{school}', '{conference}'],
  TRUE
),
(
  'Follow Up',
  'Following up — {school} Golf + Helm',
  E'Hi {name},\n\nJust wanted to follow up on my previous message. I know things get busy during the season, so I''ll keep this brief.\n\nWe''ve been helping programs in the {conference} save hours each week on stats tracking and player development planning. I''d love to show you how it works in a quick demo.\n\nWould any time this week or next work for a 15-minute call?\n\nBest,\nHelm Sports Labs',
  'follow_up',
  ARRAY['{name}', '{school}', '{conference}'],
  TRUE
),
(
  'Demo Invite',
  'Your personalized Helm demo — {school} Golf',
  E'Hi {name},\n\nThanks for your interest in Helm Sports Labs! I''d love to walk you through the platform and show you how it can specifically help the {school} program.\n\nIn the demo, we''ll cover:\n- Round tracking & real-time stats dashboards\n- CoachHelm AI — automated coaching insights and player development\n- Team management: calendar, travel, tasks, messaging\n\nPlease let me know what times work best for you, and I''ll send over a calendar invite.\n\nLooking forward to connecting!\n\nBest,\nHelm Sports Labs',
  'demo_invite',
  ARRAY['{name}', '{school}', '{conference}'],
  TRUE
),
(
  'Check In',
  'Checking in — {school} Golf',
  E'Hi {name},\n\nI hope the season is going well for {school}! I wanted to check in and see if there''s anything on the team management or analytics side where we might be able to help.\n\nWe''ve recently added some great new features that {conference} programs have been loving. Happy to give you a quick update whenever it''s convenient.\n\nBest,\nHelm Sports Labs',
  'check_in',
  ARRAY['{name}', '{school}', '{conference}'],
  TRUE
);
