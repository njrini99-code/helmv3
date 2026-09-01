-- ============================================================================
-- DRY RUN companion to remove-qa-fixtures-2026-08-31.sql.
--
-- Run this first against project qmnssrrolpinvwjjnufo. It modifies nothing,
-- and its OUTPUT IS THE EXPORT — save it before running the apply script.
--
-- What this covers: the QA fixture set seeded directly into production on
-- 2026-08-31, on demo team 6ecdd1a6-63fe-4beb-b094-00118f334163. The qualifier
-- names itself ("QA — Round Type Verification 2026-08-31"), the round ids are
-- sequential literals, and three of the five share created_at to the
-- microsecond. Nothing here was written by application code.
--
-- Blast radius, measured 2026-09-01: every other team has ZERO fixture-shaped
-- rows — Guilford 184 rounds, Shenandoah 63, UNC Wilmington 50, Lynchburg 37,
-- Demo University Golf (Pat) 90, all clean.
-- ============================================================================

-- 1) The rounds, with proof they carry nothing real.
SELECT r.id, r.round_type, r.status, r.round_date, r.total_score,
       r.player_id, r.team_id, r.qualifier_id, r.created_at, r.updated_at,
       (SELECT count(*) FROM golf_holes h WHERE h.round_id = r.id) AS hole_rows,
       (SELECT count(*) FROM golf_holes h WHERE h.round_id = r.id AND h.score IS NOT NULL) AS scored_holes,
       (SELECT count(*) FROM golf_shots s WHERE s.round_id = r.id) AS shot_rows
FROM golf_rounds r
WHERE r.id IN (
  '0b000000-0000-4000-b000-000000000001','0b000000-0000-4000-b000-000000000002',
  '0b000000-0000-4000-b000-000000000003','0b000000-0000-4000-b000-000000000004',
  '0b000000-0000-4000-b000-000000000005'
)
ORDER BY r.id;

-- 2) The qualifier and its entries.
SELECT 'qualifier' AS kind, q.id::text, q.name, q.team_id::text, q.created_at
FROM golf_qualifiers q WHERE q.id = '0a000000-0000-4000-a000-000000000001'
UNION ALL
SELECT 'entry', e.id::text, e.player_id::text, e.qualifier_id::text, e.created_at
FROM golf_qualifier_entries e WHERE e.qualifier_id = '0a000000-0000-4000-a000-000000000001'
ORDER BY kind, id;

-- 3) THE SAFETY ASSERTION. Must return 0. If it returns anything, STOP —
--    a row in the delete set carries real scoring data and the apply script
--    will refuse anyway.
SELECT count(*) AS rounds_with_real_data_MUST_BE_ZERO
FROM golf_rounds r
WHERE r.id IN (
  '0b000000-0000-4000-b000-000000000001','0b000000-0000-4000-b000-000000000002',
  '0b000000-0000-4000-b000-000000000003','0b000000-0000-4000-b000-000000000004',
  '0b000000-0000-4000-b000-000000000005'
)
AND (
  EXISTS (SELECT 1 FROM golf_holes h WHERE h.round_id = r.id AND h.score IS NOT NULL)
  OR EXISTS (SELECT 1 FROM golf_shots s WHERE s.round_id = r.id)
);

-- 4) What integrity check 6 reports right now (expect 4 before, 0 after).
SELECT count(*) AS completed_rounds_with_zero_scored_holes
FROM golf_rounds r
WHERE r.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM golf_holes h WHERE h.round_id = r.id AND h.score IS NOT NULL);
