-- Migration: Fix pipeline_stage enum to match spec
-- Changes 'priority' to 'high_priority' and adds 'uninterested'

-- Step 1: Create new enum with correct values
CREATE TYPE pipeline_stage_new AS ENUM (
  'watchlist',
  'high_priority',  -- Changed from 'priority'
  'offer_extended',
  'committed',
  'uninterested'    -- Added
);

-- Step 2: Alter watchlists table to use new enum
-- First add a temporary column
ALTER TABLE watchlists ADD COLUMN pipeline_stage_new pipeline_stage_new;

-- Step 3: Migrate data from old to new enum
UPDATE watchlists
SET pipeline_stage_new = CASE
  WHEN pipeline_stage = 'priority' THEN 'high_priority'::pipeline_stage_new
  WHEN pipeline_stage = 'watchlist' THEN 'watchlist'::pipeline_stage_new
  WHEN pipeline_stage = 'offer_extended' THEN 'offer_extended'::pipeline_stage_new
  WHEN pipeline_stage = 'committed' THEN 'committed'::pipeline_stage_new
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

-- Verification comment
COMMENT ON TYPE pipeline_stage IS 'Pipeline stage enum: watchlist, high_priority, offer_extended, committed, uninterested';
