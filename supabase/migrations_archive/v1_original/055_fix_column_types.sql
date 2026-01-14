-- ============================================================================
-- FIX COLUMN TYPE MISMATCHES - Migration 055
-- Date: 2026-01-02
--
-- Fixes column type mismatches discovered after TypeScript type regeneration
-- ============================================================================

-- Fix golf_holes.first_putt_leave (should be integer, not text)
-- This represents distance left after first putt in inches
ALTER TABLE golf_holes
ALTER COLUMN first_putt_leave TYPE integer USING first_putt_leave::integer;

-- Summary: Fixed column type mismatch for first_putt_leave
