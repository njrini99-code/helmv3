-- Migration: 20260305100000_review_system_fixes.sql
-- Purpose: Fix review system bugs
-- - Add shared_with_player column for coach-to-player sharing (#10)
-- - Add unique constraint on round_id to prevent duplicate reviews (#9)

-- Add shared_with_player boolean column for when coach shares review with player
ALTER TABLE golf_round_reviews
ADD COLUMN IF NOT EXISTS shared_with_player BOOLEAN DEFAULT false;

-- Prevent duplicate reviews per round (race condition guard)
CREATE UNIQUE INDEX IF NOT EXISTS idx_golf_round_reviews_round_id_unique
ON golf_round_reviews(round_id);
