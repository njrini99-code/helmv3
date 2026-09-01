-- ============================================================================
-- Remove the QA fixtures seeded directly into production on 2026-08-31.
--
-- Run on: project qmnssrrolpinvwjjnufo (Supabase). OWNER-EXECUTED.
-- Run remove-qa-fixtures-2026-08-31-dryrun.sql FIRST and keep its output —
-- that output is the export.
--
-- WHY THESE ARE FIXTURES, NOT DATA. The qualifier names itself: "QA — Round
-- Type Verification 2026-08-31". The five round ids are sequential literals
-- (0b000000-0000-4000-b000-00000000000{1..5}); three share created_at to the
-- microsecond (19:01:27.511173+00); every updated_at equals its created_at;
-- none carries a course_id; and current_hole=1 sits against holes_played=18.
-- No application path emits a patterned sequential uuid. They arrived through
-- a direct service-role insert.
--
-- SCOPE. Explicit id lists, never a LIKE pattern — a pattern that widens by
-- accident deletes production rows. Eight rows total, all on demo team
-- 6ecdd1a6-63fe-4beb-b094-00118f334163. Verified 2026-09-01: no other team
-- holds a single fixture-shaped row.
--
-- SELF-PROTECTING. The DO block below aborts the whole transaction if any
-- round in the set carries a scored hole or any shot. If a real round ever
-- acquires one of these ids, this script refuses rather than destroying it.
--
-- AFTER: integrity check 6 (completed_round_zero_scored_holes) goes from
-- fail/4 to pass/0. That is the verification.
-- ============================================================================

BEGIN;

-- 0) Refuse to run if anything in the delete set holds real data.
DO $$
DECLARE
  unsafe int;
BEGIN
  SELECT count(*) INTO unsafe
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

  IF unsafe > 0 THEN
    RAISE EXCEPTION
      'REFUSING: % round(s) in the fixture id set carry scored holes or shots. These are not fixtures. Nothing deleted.', unsafe;
  END IF;
END $$;

-- 1) Shots and holes first (expected 0 rows each — belt and braces, and the
--    FK order is correct if a future re-run finds any).
DELETE FROM golf_shots WHERE round_id IN (
  '0b000000-0000-4000-b000-000000000001','0b000000-0000-4000-b000-000000000002',
  '0b000000-0000-4000-b000-000000000003','0b000000-0000-4000-b000-000000000004',
  '0b000000-0000-4000-b000-000000000005'
);

DELETE FROM golf_holes WHERE round_id IN (
  '0b000000-0000-4000-b000-000000000001','0b000000-0000-4000-b000-000000000002',
  '0b000000-0000-4000-b000-000000000003','0b000000-0000-4000-b000-000000000004',
  '0b000000-0000-4000-b000-000000000005'
);

-- 2) The rounds. Must come before the qualifier they reference.
DELETE FROM golf_rounds WHERE id IN (
  '0b000000-0000-4000-b000-000000000001','0b000000-0000-4000-b000-000000000002',
  '0b000000-0000-4000-b000-000000000003','0b000000-0000-4000-b000-000000000004',
  '0b000000-0000-4000-b000-000000000005'
);

-- 3) Qualifier entries, then the qualifier itself.
DELETE FROM golf_qualifier_entries WHERE qualifier_id = '0a000000-0000-4000-a000-000000000001';
DELETE FROM golf_qualifiers        WHERE id           = '0a000000-0000-4000-a000-000000000001';

-- 4) Post-condition, inside the transaction. Must be 0, or roll back.
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM golf_rounds r
  WHERE r.status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM golf_holes h WHERE h.round_id = r.id AND h.score IS NOT NULL);

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'POST-CHECK: % completed round(s) still carry zero scored holes. Rolling back so the cause can be investigated before any deletion stands.', remaining;
  END IF;
END $$;

COMMIT;
