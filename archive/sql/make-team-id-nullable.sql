-- Make team_id nullable in golf_events to support personal player events
-- Players without a team should be able to create personal calendar events

ALTER TABLE golf_events
ALTER COLUMN team_id DROP NOT NULL;

-- Make created_by nullable as well since players don't have coach IDs
ALTER TABLE golf_events
ALTER COLUMN created_by DROP NOT NULL;
