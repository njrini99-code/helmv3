-- STATUS: WRITTEN, NOT APPLIED. Written 2026-10-17; the owner applies it after
-- review (supabase/migrations/HELD.md row).
-- Apply: npm run db:apply -- <this file>
-- Risk: LOW. One function body changes (CREATE OR REPLACE keeps its owner, ACL
-- and the golf_holes trigger that calls it). No table, policy, grant or stored
-- row changes here; the next golf_holes write of a round recomputes it.
--
-- WHY (Fairway rounds audit, 2026-10-17): public.recompute_golf_round_totals,
-- run by the golf_holes trigger golf_holes_recompute_round_totals_fn on every
-- hole write, treats a hole with no putt count as a hole holed in zero putts.
-- Live body (read 2026-10-17 with pg_get_functiondef, same computation as
-- 20260606190000_fix_fairway_denominator.sql):
--   * total_putts = COALESCE(SUM(putts), 0): a round with no putt recorded
--     gets 0 putts, not "not recorded".
--   * GIR credits a hole when score - COALESCE(putts, 0) <= par - 2: a hole
--     with no putt count is judged on its whole score (a 3 on a par 5 with
--     unknown putts counts as a green in regulation).
--   * total_gir_possible = COUNT(*): every hole row, scored or not, so a hole
--     whose GIR cannot be known still lowers the GIR rate.
--
-- WHAT CHANGES:
--   * total_putts = SUM(putts): the sum of the putts recorded, NULL when no
--     hole has one. update_round_stats_cache already falls back to the holes'
--     own sum (COALESCE(NEW.total_putts, ...)), so its cache row is unchanged.
--   * GIR is credited only on a scored hole with a recorded putt count.
--   * total_gir_possible counts the holes whose GIR can be known (score > 0
--     and putts recorded), the same rule as the fairway denominator (par-4/5
--     holes with a recorded fairway result), mirrored in
--     src/lib/golf/stat-formulas.ts.
--   * Fairways, SECURITY DEFINER and SET search_path TO 'public' are kept as
--     live.
--
-- IMPACT (read-only SELECT on production, 2026-10-17): of 757 completed rounds
-- none changes (every scored hole carries putts; submit requires them). Of 54
-- in-progress rounds, 27 move total_putts from 0 to NULL and 53 move
-- total_gir_possible from their hole-row count to their scored-hole count; no
-- GIR count changes.
--
-- ORDER: apply AFTER 20260708141000_gate_secdef_ownership_and_redemption.sql
-- (HELD), never before it. That file re-creates this same function with the
-- OLD computation plus an ownership guard; applied after this one it silently
-- restores COALESCE(putts, 0). This body does NOT carry that guard, because
-- the guard is not safe to ship yet (that file's own hold reason 1): it
-- RAISEs 'Forbidden' whenever auth.uid() is not the round's player or a
-- coach of its team, and live service_role writes fire this function through
-- the golf_holes trigger with no user (the admin round-repair tool,
-- src/app/golf/actions/admin-tracer-data.ts, updates golf_holes through
-- createAdminClient). So applying this file after 20260708141000 also drops
-- its guard from this function; the guard's fixed version (with a
-- service_role allowance) belongs in a new migration built on this body.
-- The local stack applies both in timestamp order, which is that order.
--
-- ROLLBACK: re-create the live body:
--   CREATE OR REPLACE FUNCTION public.recompute_golf_round_totals(
--     p_round_id uuid)
--    RETURNS void LANGUAGE plpgsql SECURITY DEFINER
--    SET search_path TO 'public' AS $f$
--   BEGIN
--     UPDATE golf_rounds r
--     SET
--       total_putts = COALESCE(t.sum_putts, 0),
--       total_gir = COALESCE(t.sum_gir, 0),
--       total_gir_possible = COALESCE(t.cnt, 0),
--       total_fairways_hit = COALESCE(t.sum_fwy_hit, 0),
--       total_fairways = COALESCE(t.cnt_par4plus, 0)
--     FROM (
--       SELECT
--         SUM(putts) AS sum_putts,
--         SUM(CASE
--               WHEN par >= 3
--                AND score > 0
--                AND (score - COALESCE(putts, 0)) > 0
--                AND (score - COALESCE(putts, 0)) <= (par - 2)
--               THEN 1 ELSE 0
--             END) AS sum_gir,
--         COUNT(*) AS cnt,
--         SUM(CASE WHEN par >= 4 AND fairway_hit = true THEN 1 ELSE 0 END)
--           AS sum_fwy_hit,
--         SUM(CASE WHEN par >= 4 AND fairway_hit IS NOT NULL THEN 1 ELSE 0
--           END) AS cnt_par4plus
--       FROM golf_holes
--       WHERE round_id = p_round_id
--     ) t
--     WHERE r.id = p_round_id;
--   END $f$;
-- Rounds then read 0 putts again on their next hole write.
--
-- VERIFY: select 1 where (select count(*) from pg_proc p where p.pronamespace
-- VERIFY: = 'public'::regnamespace and p.proname =
-- VERIFY: 'recompute_golf_round_totals' and p.prosecdef and p.proconfig =
-- VERIFY: array['search_path=public'] and p.prosrc like
-- VERIFY: '%putts IS NOT NULL%' and p.prosrc not like '%t.sum_putts, 0%') = 1;
-- VERIFY: select 1 where (select count(*) from pg_trigger t where t.tgrelid =
-- VERIFY: 'public.golf_holes'::regclass and t.tgname =
-- VERIFY: 'golf_holes_recompute_round_totals' and t.tgenabled = 'O') = 1;

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.recompute_golf_round_totals(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE golf_rounds r
  SET
    -- NULL when no hole has a putt count: "not recorded", never 0 putts.
    total_putts = t.sum_putts,
    total_gir = COALESCE(t.sum_gir, 0),
    total_gir_possible = COALESCE(t.cnt_gir_known, 0),
    total_fairways_hit = COALESCE(t.sum_fwy_hit, 0),
    total_fairways = COALESCE(t.cnt_par4plus, 0)
  FROM (
    SELECT
      SUM(putts) AS sum_putts,
      -- GIR needs the putt count: a hole without one is never credited.
      SUM(CASE
            WHEN par >= 3
             AND score > 0
             AND putts IS NOT NULL
             AND (score - putts) > 0
             AND (score - putts) <= (par - 2)
            THEN 1 ELSE 0
          END) AS sum_gir,
      -- denominator: scored holes with a recorded putt count (was: every hole row)
      SUM(CASE WHEN score > 0 AND putts IS NOT NULL THEN 1 ELSE 0 END) AS cnt_gir_known,
      SUM(CASE WHEN par >= 4 AND fairway_hit = true THEN 1 ELSE 0 END) AS sum_fwy_hit,
      -- denominator: par-4/5 holes with a recorded fairway result (was: all par-4/5)
      SUM(CASE WHEN par >= 4 AND fairway_hit IS NOT NULL THEN 1 ELSE 0 END) AS cnt_par4plus
    FROM golf_holes
    WHERE round_id = p_round_id
  ) t
  WHERE r.id = p_round_id;
END
$function$;
