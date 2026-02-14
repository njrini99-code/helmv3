-- ============================================================================
-- Migration: 20260214000000_create_crm_coaches.sql
-- Purpose: CRM system for tracking college golf coach prospects
-- ============================================================================

-- Create enum for coach status (sales pipeline stages)
CREATE TYPE coach_status AS ENUM (
  'new_lead',
  'researching',
  'outreach_pending',
  'initial_contact',
  'follow_up',
  'engaged',
  'demo_scheduled',
  'demo_completed',
  'proposal_sent',
  'negotiating',
  'closed_won',
  'closed_lost',
  'not_interested',
  'bad_timing',
  'nurture'
);

-- Create enum for contact type
CREATE TYPE contact_type AS ENUM (
  'email',
  'call',
  'demo',
  'meeting',
  'note'
);

-- Create enum for division
CREATE TYPE ncaa_division AS ENUM ('D2', 'D3');

-- Create enum for program type
CREATE TYPE program_type AS ENUM ('mens', 'womens', 'both');

-- ============================================================================
-- COACHES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS crm_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic info
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  
  -- School info
  school TEXT NOT NULL,
  conference TEXT NOT NULL,
  division ncaa_division NOT NULL,
  program program_type NOT NULL DEFAULT 'both',
  
  -- CRM status
  status coach_status NOT NULL DEFAULT 'new_lead',
  priority INTEGER DEFAULT 0, -- 0=normal, 1=high, 2=urgent, 3=hot
  highlight_color TEXT, -- hex color for row highlighting
  is_starred BOOLEAN DEFAULT FALSE,
  
  -- Notes and context
  notes TEXT,
  internal_comments TEXT, -- private team comments
  tags TEXT[], -- e.g., ['warm-lead', 'referred', 'competitor-user']
  
  -- Qualification info
  team_size INTEGER, -- number of players
  current_software TEXT, -- what they're using now
  budget_range TEXT,
  decision_timeline TEXT, -- e.g., 'Q1 2026', 'Next season'
  pain_points TEXT[],
  
  -- Contact preferences
  best_contact_method TEXT, -- 'email', 'phone', 'text'
  best_contact_time TEXT, -- 'morning', 'afternoon', etc.
  timezone TEXT,
  
  -- Tracking
  last_contacted_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT valid_email CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- ============================================================================
-- CONTACT LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS crm_contact_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES crm_coaches(id) ON DELETE CASCADE,
  
  -- Contact details
  contact_type contact_type NOT NULL,
  contact_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Content
  subject TEXT,
  notes TEXT,
  
  -- Follow-up
  next_action TEXT,
  next_action_date TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_crm_coaches_status ON crm_coaches(status);
CREATE INDEX idx_crm_coaches_division ON crm_coaches(division);
CREATE INDEX idx_crm_coaches_conference ON crm_coaches(conference);
CREATE INDEX idx_crm_coaches_school ON crm_coaches(school);
CREATE INDEX idx_crm_coaches_next_follow_up ON crm_coaches(next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;
CREATE INDEX idx_crm_coaches_priority ON crm_coaches(priority DESC, status);
CREATE INDEX idx_crm_contact_log_coach ON crm_contact_log(coach_id);
CREATE INDEX idx_crm_contact_log_date ON crm_contact_log(contact_date DESC);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION update_crm_coaches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_coaches_updated_at
  BEFORE UPDATE ON crm_coaches
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_coaches_updated_at();

-- ============================================================================
-- RLS POLICIES (Admin only access)
-- ============================================================================
ALTER TABLE crm_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contact_log ENABLE ROW LEVEL SECURITY;

-- Only admins can access CRM data
CREATE POLICY "Admins can view all coaches"
  ON crm_coaches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert coaches"
  ON crm_coaches FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update coaches"
  ON crm_coaches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete coaches"
  ON crm_coaches FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Contact log policies
CREATE POLICY "Admins can view all contact logs"
  ON crm_contact_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert contact logs"
  ON crm_contact_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update contact logs"
  ON crm_contact_log FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete contact logs"
  ON crm_contact_log FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get coach pipeline summary
CREATE OR REPLACE FUNCTION get_crm_pipeline_summary()
RETURNS TABLE (
  status coach_status,
  coach_count BIGINT,
  division ncaa_division
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.status,
    COUNT(*)::BIGINT as coach_count,
    c.division
  FROM crm_coaches c
  GROUP BY c.status, c.division
  ORDER BY c.division, c.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_crm_pipeline_summary() TO authenticated;

-- Log a contact and update coach
CREATE OR REPLACE FUNCTION log_coach_contact(
  p_coach_id UUID,
  p_contact_type contact_type,
  p_notes TEXT DEFAULT NULL,
  p_next_action TEXT DEFAULT NULL,
  p_next_action_date TIMESTAMPTZ DEFAULT NULL,
  p_new_status coach_status DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Insert contact log
  INSERT INTO crm_contact_log (coach_id, contact_type, notes, next_action, next_action_date, created_by)
  VALUES (p_coach_id, p_contact_type, p_notes, p_next_action, p_next_action_date, auth.uid())
  RETURNING id INTO v_log_id;
  
  -- Update coach record
  UPDATE crm_coaches
  SET 
    last_contacted_at = NOW(),
    next_follow_up_at = COALESCE(p_next_action_date, next_follow_up_at),
    status = COALESCE(p_new_status, status)
  WHERE id = p_coach_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION log_coach_contact(UUID, contact_type, TEXT, TEXT, TIMESTAMPTZ, coach_status) TO authenticated;
