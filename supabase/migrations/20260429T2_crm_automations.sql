-- ============================================================================
-- Migration: 20260429T2_crm_automations.sql
-- Phase 4 (delivered alongside Phase 3): Configurable Automations
--
-- Purpose: Replace the hardcoded webhook side-effects in
--   src/app/api/webhooks/resend/route.ts:103-140 (open/click → status='engaged'
--   when status='contacted') with a database-driven rules engine. The webhook
--   continues to do its event ingestion job; an evaluator step (added by the
--   orchestrator) reads active rules from this table and applies their
--   actions when conditions match.
--
-- The conditions/actions JSONB shapes are documented in
--   src/lib/crm/automations-engine.ts (the pure evaluator) and rendered by the
--   AutomationEditor builder UI at /golf/admin/crm/settings/automations.
--
-- The seed at the bottom mirrors the two existing hardcoded behaviors so the
-- webhook can switch over without behavior change. New rules go through the
-- admin UI.
-- ============================================================================

CREATE TABLE crm_automations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description   text,
  trigger_event text NOT NULL CHECK (trigger_event IN (
    'email.opened',
    'email.clicked',
    'email.bounced',
    'email.complained',
    'email.unsubscribed',
    'email.replied',
    'status_change.engaged',
    'status_change.contacted',
    'no_contact_30d'
  )),
  conditions    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- list of {field, op, value}
  actions       jsonb NOT NULL,                      -- list of {kind, params}
  is_active     boolean NOT NULL DEFAULT true,
  priority      smallint NOT NULL DEFAULT 100,
  created_by    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_automations_event
  ON crm_automations (trigger_event, is_active, priority);

-- ============================================================================
-- updated_at trigger (mirrors crm_notes pattern from 20260428T2)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_crm_automations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_automations_updated_at
  BEFORE UPDATE ON crm_automations
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_automations_updated_at();

-- ============================================================================
-- RLS — admin-only (mirrors crm_email_suppressions pattern from 20260428T1)
-- ============================================================================
ALTER TABLE crm_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all automations"
  ON crm_automations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert automations"
  ON crm_automations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update automations"
  ON crm_automations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete automations"
  ON crm_automations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- ============================================================================
-- SEED — mirror current hardcoded webhook side-effects from
--   src/app/api/webhooks/resend/route.ts:123-140
-- so the orchestrator's webhook refactor is a behavior-preserving swap.
--
-- We only seed if there is at least one admin user. Otherwise the FK on
-- created_by would fail — the rules can be created via the UI later.
-- ============================================================================
INSERT INTO crm_automations (
  name, description, trigger_event, conditions, actions, is_active, priority, created_by
)
SELECT
  'Auto-engage on email open',
  'Move coach from contacted → engaged when they open an email.',
  'email.opened',
  '[{"field":"coach.status","op":"eq","value":"contacted"}]'::jsonb,
  '[{"kind":"set_coach_status","params":{"value":"engaged"}}]'::jsonb,
  true,
  100,
  (SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1)
WHERE EXISTS (SELECT 1 FROM users WHERE role = 'admin');

INSERT INTO crm_automations (
  name, description, trigger_event, conditions, actions, is_active, priority, created_by
)
SELECT
  'Auto-engage on email click',
  'Move coach from contacted → engaged when they click any link.',
  'email.clicked',
  '[{"field":"coach.status","op":"eq","value":"contacted"}]'::jsonb,
  '[{"kind":"set_coach_status","params":{"value":"engaged"}}]'::jsonb,
  true,
  100,
  (SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1)
WHERE EXISTS (SELECT 1 FROM users WHERE role = 'admin');
