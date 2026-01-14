-- ============================================================================
-- Migration: Drop Deprecated Tables and Columns
-- WARNING: Only run AFTER all app code uses new organization FKs
-- ============================================================================

-- Drop old FK columns from coaches
ALTER TABLE coaches DROP COLUMN IF EXISTS college_id;

-- Drop old FK columns from players
ALTER TABLE players DROP COLUMN IF EXISTS high_school_id;
ALTER TABLE players DROP COLUMN IF EXISTS committed_to;

-- Drop deprecated tables
DROP TABLE IF EXISTS colleges CASCADE;
DROP TABLE IF EXISTS high_schools CASCADE;

-- Drop video_views table (functionality duplicated by videos.view_count)
DROP TABLE IF EXISTS video_views CASCADE;
