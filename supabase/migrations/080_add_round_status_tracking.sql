-- ============================================================================
-- Add Round Status Tracking for Save for Later Feature
-- ============================================================================
-- This migration adds status tracking to golf_rounds to support:
-- 1. Saving incomplete rounds
-- 2. Resuming rounds where player left off
-- 3. Only calculating stats for completed rounds
-- ============================================================================

-- Add status enum type
CREATE TYPE golf_round_status AS ENUM ('in_progress', 'completed', 'abandoned');

-- Add status and current_hole columns to golf_rounds
ALTER TABLE golf_rounds
ADD COLUMN status golf_round_status NOT NULL DEFAULT 'completed',
ADD COLUMN current_hole INTEGER CHECK (current_hole >= 1 AND current_hole <= 18),
ADD COLUMN holes_to_play INTEGER CHECK (holes_to_play IN (9, 18)) DEFAULT 18;

-- Update existing rounds to be 'completed'
UPDATE golf_rounds SET status = 'completed' WHERE status IS NULL;

-- Create index for querying in-progress rounds
CREATE INDEX idx_golf_rounds_status ON golf_rounds(player_id, status) WHERE status = 'in_progress';

-- Add comment for documentation
COMMENT ON COLUMN golf_rounds.status IS 'Track round completion: in_progress (saved for later), completed (finished), abandoned (deleted)';
COMMENT ON COLUMN golf_rounds.current_hole IS 'Last hole player was on when saving round for later';
COMMENT ON COLUMN golf_rounds.holes_to_play IS 'Number of holes player intends to play (9 or 18)';

-- Modify stats calculation to only include completed rounds
-- Update any views or functions that calculate stats to filter by status = 'completed'
COMMENT ON TABLE golf_rounds IS 'IMPORTANT: Stats should only be calculated for rounds where status = ''completed''';
