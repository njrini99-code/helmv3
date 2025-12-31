-- Add 'class' to golf_event_type enum and link events to classes
-- This allows calendar sync from golf_player_classes

-- Add 'class' to the event type enum
ALTER TYPE golf_event_type ADD VALUE IF NOT EXISTS 'class';

-- Add class_id foreign key to golf_events
-- This allows linking calendar events to specific classes
ALTER TABLE golf_events
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES golf_player_classes(id) ON DELETE CASCADE;

-- Create index for class-based event queries
CREATE INDEX IF NOT EXISTS idx_golf_events_class_id ON golf_events(class_id);

-- Comment to explain the relationship
COMMENT ON COLUMN golf_events.class_id IS 'Links calendar events to golf_player_classes for automatic sync';
