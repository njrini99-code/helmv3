-- Manual work-division label on coaches (one shared CRM login).
-- A plain text tag (Nick / Ben / Leah), NOT an auth user — lets the team split
-- the prospect book without separate accounts. Double-touch is prevented by the
-- server-side frequency cap, not by this column.
ALTER TABLE crm_coaches ADD COLUMN IF NOT EXISTS assigned_to text;

-- Filtered index: most rows are unassigned, so only index the assigned slice
-- (keeps "My coaches" / per-rep view filters fast without bloating the index).
CREATE INDEX IF NOT EXISTS idx_crm_coaches_assigned_to
  ON crm_coaches (assigned_to)
  WHERE assigned_to IS NOT NULL;
