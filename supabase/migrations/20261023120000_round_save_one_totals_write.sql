-- One round-totals write per round save, not one per hole row.
-- WRITTEN, NOT APPLIED: held in supabase/migrations/HELD.md until the owner
-- applies it.
--
-- WHY (read-only production stats, 2026-10-23): 140 new golf_rounds rows took
-- 154,311 row updates, about 1,100 per round. The app is not writing that
-- often. The trigger golf_holes_recompute_round_totals (AFTER INSERT, UPDATE
-- or DELETE on golf_holes, FOR EACH ROW) runs recompute_golf_round_totals,
-- which UPDATEs golf_rounds, once per hole row. Both round RPCs replace the
-- whole snapshot: DELETE every hole, then INSERT every hole, one statement per
-- hole. An 18-hole round therefore costs 1 direct UPDATE + 18 + 18 trigger
-- UPDATEs = 37 golf_rounds writes per auto-save. save_partial_round_atomic ran
-- ~4,000 times since 2026-10-03 (pg_stat_statements): 4,000 x 37 plus 140
-- submits x 37 is ~153k, the whole count.
--
-- It costs twice. golf_rounds is in the supabase_realtime publication, and
-- Realtime decodes and RLS-checks every change on every published table
-- (realtime.list_changes is the database's largest consumer of exec time).
-- golf_rounds was ~96% of all published changes. And at submit the round is
-- already status = 'completed' when the holes are rewritten, so each of those
-- 36 trigger writes also fires trg_update_round_stats_cache: golf_round_stats_cache
-- took 4,865 updates for 140 rounds.
--
-- WHAT. While the RPC rewrites the holes, the trigger only notes that the
-- totals are stale (a transaction-local setting, helm.defer_round_totals);
-- after the last hole INSERT the RPC runs recompute_golf_round_totals once.
-- The recompute runs exactly when the trigger would have fired at least once,
-- and at the same point (after the last hole write, before the shots), so the
-- round row, the stats cache and every later step see the same values as
-- today. Per auto-save: 37 golf_rounds writes become 2. Per submit: 37 become
-- 2, and ~36 stats-cache recomputes become 2.
--
-- 1. golf_holes_recompute_round_totals_fn: CREATE OR REPLACE, same body plus
--    the defer check. SECURITY DEFINER, search_path, owner and ACL unchanged
--    (CREATE OR REPLACE keeps the owner and the revoked EXECUTE grants of
--    20260905100000). Every other hole writer (Fairway edits, the admin
--    tracer repair, service-role scripts) never sets the setting and keeps
--    the per-row recompute.
-- 2. save_partial_round_atomic and submit_round_atomic: a guarded text patch
--    of their LIVE definitions (the pattern of 20261021091000), so this file
--    does not freeze an older copy of either function. Two anchors per
--    function, each must match exactly once, or the migration aborts.
--
-- Not touched: recompute_golf_round_totals itself, so this is order
-- independent of HELD 20261017110000_golf_round_totals_null_putts.sql (it
-- replaces that body) and 20260708141000 (same). Independent of HELD
-- 20261001000000_submit_round_expected_updated_at.sql: that patch anchors on
-- the submit UPDATE of golf_rounds, these anchors are the snapshot DELETE and
-- the insert_shots checkpoint. No client change is needed and none is
-- required first: the RPC signatures and results are unchanged.
--
-- A client can not use the setting to skip totals: it is set and cleared
-- inside the SECURITY DEFINER RPCs, is transaction-local, and PostgREST runs
-- one statement per request. A forged value would only leave the caller's own
-- in-progress round with stale totals until its next hole write.
--
-- Re-running is a no-op (a function that already carries the marker is
-- skipped; the trigger function is a plain CREATE OR REPLACE).
--
-- ROLLBACK: for each of save_partial_round_atomic and submit_round_atomic,
-- ROLLBACK: re-run its pg_get_functiondef with the two inserted blocks
-- ROLLBACK: removed (every line mentioning helm.defer_round_totals and the
-- ROLLBACK: one recompute_golf_round_totals call between them), then restore
-- ROLLBACK: golf_holes_recompute_round_totals_fn from
-- ROLLBACK: 20260527000000_prod_public_baseline.sql (the body below without
-- ROLLBACK: the IF block). Either half alone is safe: the trigger without the
-- ROLLBACK: RPC patch never sees the setting, and the RPC patch without the
-- ROLLBACK: trigger change only adds one redundant recompute.

CREATE OR REPLACE FUNCTION public.golf_holes_recompute_round_totals_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_round uuid;
BEGIN
  -- A round RPC is rewriting this round's holes and recomputes the totals
  -- once after its last hole write. Note that a hole changed and skip the
  -- per-row write. See 20261023120000_round_save_one_totals_write.sql.
  IF current_setting('helm.defer_round_totals', true) IN ('on', 'dirty') THEN
    PERFORM set_config('helm.defer_round_totals', 'dirty', true);
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_round := OLD.round_id;
  ELSE
    v_round := NEW.round_id;
  END IF;

  PERFORM public.recompute_golf_round_totals(v_round);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END
$function$;

DO $$
DECLARE
  fn record;
  fn_definition text;
  patched text;
  marker constant text := 'helm.defer_round_totals';
  delete_anchor constant text := '(\n)([ \t]*)(DELETE FROM golf_shots WHERE round_id = p_round_id;)';
  shots_anchor text;
  found_count int := 0;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('save_partial_round_atomic', 'submit_round_atomic')
  LOOP
    found_count := found_count + 1;
    fn_definition := pg_get_functiondef(fn.oid);
    IF position(marker IN fn_definition) > 0 THEN
      CONTINUE;
    END IF;

    -- Each anchor must occur exactly once, or the body changed shape.
    IF (SELECT count(*) FROM regexp_matches(fn_definition, delete_anchor, 'g')) <> 1 THEN
      RAISE EXCEPTION '%(%) snapshot DELETE anchor not found exactly once; refusing the defer_round_totals patch',
        fn.proname, fn.args;
    END IF;
    shots_anchor := '(\n)([ \t]*)(PERFORM helm_private\.trace_checkpoint\(''db\.'
      || fn.proname || '\.insert_shots'')';
    IF (SELECT count(*) FROM regexp_matches(fn_definition, shots_anchor, 'g')) <> 1 THEN
      RAISE EXCEPTION '%(%) insert_shots checkpoint anchor not found exactly once; refusing the defer_round_totals patch',
        fn.proname, fn.args;
    END IF;

    -- Before the snapshot DELETEs: hole writes only mark the totals stale.
    patched := regexp_replace(
      fn_definition,
      delete_anchor,
      '\1\2-- One totals write after the hole rewrite, not one per hole row\1'
      || '\2-- (20261023120000_round_save_one_totals_write.sql).\1'
      || '\2PERFORM set_config(''helm.defer_round_totals'', ''on'', true);\1\2\3'
    );
    -- After the last hole INSERT, where the last per-row trigger ran: one
    -- recompute, only if a hole row was written (the trigger's own rule).
    patched := regexp_replace(
      patched,
      shots_anchor,
      '\1\2IF current_setting(''helm.defer_round_totals'', true) = ''dirty'' THEN\1'
      || '\2  PERFORM set_config(''helm.defer_round_totals'', ''off'', true);\1'
      || '\2  PERFORM public.recompute_golf_round_totals(p_round_id);\1'
      || '\2ELSE\1'
      || '\2  PERFORM set_config(''helm.defer_round_totals'', ''off'', true);\1'
      || '\2END IF;\1\1\2\3'
    );

    -- Exactly four mentions: on, the dirty check, and the two offs.
    IF (length(patched) - length(replace(patched, marker, ''))) / length(marker) <> 4 THEN
      RAISE EXCEPTION '%(%) defer_round_totals patch did not apply cleanly', fn.proname, fn.args;
    END IF;

    EXECUTE patched;
  END LOOP;

  IF found_count = 0 THEN
    RAISE EXCEPTION 'save_partial_round_atomic / submit_round_atomic not found';
  END IF;
END;
$$;

-- VERIFY: select 1 where position('helm.defer_round_totals' in
-- VERIFY: pg_get_functiondef('public.golf_holes_recompute_round_totals_fn()'::regprocedure)) > 0;
-- VERIFY: select 1 where not exists (select 1 from pg_proc p
-- VERIFY: join pg_namespace n on n.oid = p.pronamespace
-- VERIFY: where n.nspname = 'public'
-- VERIFY: and p.proname in ('save_partial_round_atomic', 'submit_round_atomic')
-- VERIFY: and position('helm.defer_round_totals' in pg_get_functiondef(p.oid)) = 0);
