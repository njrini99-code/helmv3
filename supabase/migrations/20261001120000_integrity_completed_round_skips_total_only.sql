-- Swap audit §18 / Q-132 (2026-10-01): the nightly integrity check
-- completed_round_zero_scored_holes has read 14 every night since
-- 28 Sep. All 14 are rounds posted as a total only (no nines, a
-- total), which count in score figures since Q-123 (owner, 2026-10-01)
-- and never have holes. The check was saturated by them, so a real lost
-- round (holes wiped by a save) would read 15 and look like the standing
-- alert. WRITTEN, NOT APPLIED (HELD.md).
--
-- Change. The check leaves out a round posted as a total only:
--   AND NOT (r.front_nine IS NULL AND r.back_nine IS NULL
--            AND r.total_score IS NOT NULL)
-- Nothing else in run_integrity_checks changes. The rewrite reads the
-- LIVE definition (pg_get_functiondef), refuses to run unless its body
-- is the one 20260901120000 installed (prosrc md5
-- 16c9eca333e04a920b0d7b1fb764c738 in production, read 2026-10-01;
-- c2307e0e28a63c4430506829c4851fa3 on a replay) or already carries
-- this change, and replaces one anchor that occurs exactly once.
--
-- Expected after apply: the check passes (0) on today's data (14 flagged,
-- 14 posted as a total, 0 without a total; read-only 2026-10-01).
-- VERIFY:
--   select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'run_integrity_checks'
--     and p.prosrc like '%r.front_nine IS NULL AND r.back_nine IS NULL%';
--
-- ROLLBACK: re-apply 20260901120000's function body.

DO $$
DECLARE
  fn_oid oid;
  src text;
  def text;
  anchor constant text :=
    'WHERE h.round_id = r.id AND h.score IS NOT NULL' || E'\n' || '      )';
  added constant text :=
    E'\n' || '      -- Q-123: a total-only round has no holes by design.'
    || E'\n' || '      AND NOT (r.front_nine IS NULL AND r.back_nine IS NULL'
    || ' AND r.total_score IS NOT NULL)';
BEGIN
  SELECT p.oid, p.prosrc INTO fn_oid, src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'run_integrity_checks';
  IF fn_oid IS NULL THEN
    RAISE EXCEPTION 'public.run_integrity_checks() not found';
  END IF;
  IF position('r.front_nine IS NULL AND r.back_nine IS NULL' IN src) > 0 THEN
    RETURN; -- already applied
  END IF;
  -- Production's body (applied from a reformatted text) and the body a
  -- replay of 20260901120000 installs (local reset, CI) are the same checks.
  IF md5(src) NOT IN (
    '16c9eca333e04a920b0d7b1fb764c738',
    'c2307e0e28a63c4430506829c4851fa3'
  ) THEN
    RAISE EXCEPTION
      'run_integrity_checks is not the 20260901120000 body (md5 %)',
      md5(src)
      USING HINT = 'Rebase this file on the live body.';
  END IF;
  def := pg_get_functiondef(fn_oid);
  IF (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1
  THEN
    RAISE EXCEPTION
      'run_integrity_checks: the anchor is not unique; rebase this file';
  END IF;
  EXECUTE replace(def, anchor, anchor || added);
END
$$;

-- CREATE OR REPLACE keeps the ACL; restated as the house convention.
REVOKE ALL ON FUNCTION public.run_integrity_checks()
FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_integrity_checks() TO service_role;
