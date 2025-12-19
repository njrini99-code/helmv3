-- Migration: Enhance watchlist table for Sprint 1 Task 2
-- Adds 'contacted' and 'campus_visit' pipeline stages
-- Adds 'last_contact' timestamp column

-- Step 1: Create new enum with additional stages
CREATE TYPE pipeline_stage_new AS ENUM (
  'watchlist',
  'high_priority',
  'contacted',        -- New
  'campus_visit',     -- New
  'offer_extended',
  'committed',
  'uninterested'
);

-- Step 2: Add temporary column with new enum
ALTER TABLE watchlists ADD COLUMN pipeline_stage_new pipeline_stage_new;

-- Step 3: Migrate existing data to new enum
UPDATE watchlists
SET pipeline_stage_new =
  CASE pipeline_stage::text
    WHEN 'watchlist' THEN 'watchlist'::pipeline_stage_new
    WHEN 'high_priority' THEN 'high_priority'::pipeline_stage_new
    WHEN 'offer_extended' THEN 'offer_extended'::pipeline_stage_new
    WHEN 'committed' THEN 'committed'::pipeline_stage_new
    WHEN 'uninterested' THEN 'uninterested'::pipeline_stage_new
    ELSE 'watchlist'::pipeline_stage_new
  END;

-- Step 4: Drop old column and rename new one
ALTER TABLE watchlists DROP COLUMN pipeline_stage;
ALTER TABLE watchlists RENAME COLUMN pipeline_stage_new TO pipeline_stage;

-- Step 5: Set NOT NULL constraint and default
ALTER TABLE watchlists ALTER COLUMN pipeline_stage SET NOT NULL;
ALTER TABLE watchlists ALTER COLUMN pipeline_stage SET DEFAULT 'watchlist';

-- Step 6: Drop old enum type
DROP TYPE pipeline_stage;

-- Step 7: Rename new enum to original name
ALTER TYPE pipeline_stage_new RENAME TO pipeline_stage;

-- Step 8: Add last_contact column
ALTER TABLE watchlists ADD COLUMN last_contact TIMESTAMP WITH TIME ZONE;

-- Add index on last_contact for better query performance
CREATE INDEX idx_watchlists_last_contact ON watchlists(last_contact);

-- Add comment for documentation
COMMENT ON COLUMN watchlists.last_contact IS 'Timestamp of last contact with the player';
COMMENT ON TYPE pipeline_stage IS 'Pipeline stage enum: watchlist, high_priority, contacted, campus_visit, offer_extended, committed, uninterested';
