-- Migration: Fix data integrity issues found in database audit
-- Date: 2026-02-12
-- Fixes 3 issues: score mismatches, GIR miscalculations, and missing course_id references

BEGIN;

ALTER TABLE golf_rounds ADD COLUMN IF NOT EXISTS score_to_par INTEGER;

-- =============================================================================
-- Issue 1: Score Mismatch (40 of 61 rounds)
--
-- The seed data generator computed total_score = score_to_par + 72 (hardcoded
-- par-72), but the actual hole scores sum differently when courses are not
-- exactly par-72. Recompute total_score and score_to_par from golf_holes data.
-- =============================================================================

UPDATE golf_rounds gr SET
  total_score = (SELECT SUM(score) FROM golf_holes WHERE round_id = gr.id),
  score_to_par = (SELECT SUM(score) - SUM(par) FROM golf_holes WHERE round_id = gr.id)
WHERE status = 'completed'
  AND total_score != (SELECT SUM(score) FROM golf_holes WHERE round_id = gr.id);

-- =============================================================================
-- Issue 2: GIR Miscalculated (271 of 1,116 holes)
--
-- Seed data set gir randomly instead of computing the correct formula:
--   GIR = true when (score - putts) <= (par - 2)
-- This means the player reached the green in regulation (2 strokes or fewer
-- to reach the green). Fix both false negatives and false positives.
-- =============================================================================

-- Fix false negatives: holes marked gir = false that actually were GIR
UPDATE golf_holes
SET gir = true
WHERE gir = false
  AND score - putts <= par - 2;

-- Fix false positives: holes marked gir = true that actually were NOT GIR
UPDATE golf_holes
SET gir = false
WHERE gir = true
  AND score - putts > par - 2;

-- =============================================================================
-- Issue 3: All 61 completed rounds have NULL course_id
--
-- Round creation never set course_id. The golf_courses table has data but no
-- round references it. Backfill by matching golf_rounds.course_name to
-- golf_courses.name.
-- =============================================================================

UPDATE golf_rounds gr
SET course_id = gc.id
FROM golf_courses gc
WHERE gr.course_name = gc.name
  AND gr.course_id IS NULL;

COMMIT;
