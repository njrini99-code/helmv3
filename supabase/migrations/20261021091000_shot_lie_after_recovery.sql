-- CoachHelm supercharge Slice 8b: the recovery tap (flag
-- coachhelm_data_prompts_v2, OFF). WRITTEN, NOT APPLIED: held in
-- supabase/migrations/HELD.md until the owner applies it.
--
-- Today a tee miss carries its lie (rough, or 'other' for trees, hazard
-- edges and waste) but not whether the next shot was a recovery, so the
-- tee-miss-cost read prices a blocked punch-out like an open shot from the
-- rough (01-input-integrity.md row 7). Fairway shot entry asks one question
-- after a rough/'other' tee shot ("Clear shot" / "Blocked or punch out") and
-- sends the answer in the round payload as shots[].lie_after_recovery.
--
-- Stored beside the lie, not as a new lie value: a 'recovery' lie through the
-- lie_before/lie_after CHECKs would change every strokes-gained lookup
-- (sg_normalize_lie) and lie-keyed stat that reads those columns today.
-- Costing a recovery is a separate engine change that reads this column.
--
-- 1. One nullable column. Null = not asked (every existing row); true = the
--    next shot was a recovery; false = a clear shot. No backfill, no CHECK,
--    covered by golf_shots' existing RLS policies and table grants.
-- 2. The two round RPCs that rewrite a round's shots from the payload
--    (save_partial_round_atomic, submit_round_atomic) write the key, by a
--    guarded text patch of their LIVE definitions (the pattern of
--    20260823000000_preserve_started_round_identity.sql), so this file does
--    not freeze an older copy of either function. Each patch must apply at
--    exactly the one golf_shots INSERT, or the migration aborts. A payload
--    without the key (every client before the flag, and every shot nobody
--    was asked about) inserts NULL, as now. The app sends the key only when
--    answered, and the RPCs before this migration ignore it, so app and
--    migration can ship in either order.
--
-- Order: independent of 20261001000000_submit_round_expected_updated_at.sql
-- (that one patches the UPDATE of golf_rounds; this one the golf_shots
-- INSERT). Re-running is a no-op (ADD COLUMN IF NOT EXISTS; a function that
-- already writes the column is skipped).
--
-- ROLLBACK: functions first, then the column (the patched INSERTs name the
-- ROLLBACK: column, so dropping it first breaks every round save). For each of
-- ROLLBACK: save_partial_round_atomic and submit_round_atomic, re-run its
-- ROLLBACK: pg_get_functiondef with the two patches reversed (remove
-- ROLLBACK: ", lie_after_recovery" from the golf_shots column list and the
-- ROLLBACK: ", CASE WHEN jsonb_typeof(v_shot->'lie_after_recovery') ... END"
-- ROLLBACK: value), then ALTER TABLE public.golf_shots DROP COLUMN IF EXISTS
-- ROLLBACK: lie_after_recovery. Clients keep working throughout: the RPCs
-- ROLLBACK: before this migration ignore the payload key.

ALTER TABLE public.golf_shots
ADD COLUMN IF NOT EXISTS lie_after_recovery boolean;

COMMENT ON COLUMN public.golf_shots.lie_after_recovery IS
'CoachHelm Slice 8b recovery tap, on a tee shot that finished in the rough '
'or an other lie: true when the next shot was a recovery (blocked, punch '
'out), false when it was a clear shot, null when nobody was asked.';

DO $$
DECLARE
  fn record;
  fn_definition text;
  patched text;
  marker constant text := 'lie_after_recovery';
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

    -- The column list: "..., is_penalty, penalty_type ) VALUES (".
    patched := regexp_replace(
      fn_definition,
      '(is_penalty,\s*penalty_type)(\s*\)\s*VALUES\s*\()',
      '\1, lie_after_recovery\2'
    );
    -- The value list: "..., v_shot->>'penalty_type' ) RETURNING".
    patched := regexp_replace(
      patched,
      '(v_shot->>''penalty_type'')(\s*\)\s*RETURNING)',
      '\1, CASE WHEN jsonb_typeof(v_shot->''lie_after_recovery'') = ''boolean'' '
      || 'THEN (v_shot->>''lie_after_recovery'')::BOOLEAN END\2'
    );

    -- Exactly three mentions: the column and the two key reads.
    IF (length(patched) - length(replace(patched, marker, ''))) / length(marker) <> 3 THEN
      RAISE EXCEPTION '%(%) golf_shots INSERT shape changed; refusing the lie_after_recovery patch',
        fn.proname, fn.args;
    END IF;

    EXECUTE patched;
  END LOOP;

  IF found_count = 0 THEN
    RAISE EXCEPTION 'save_partial_round_atomic / submit_round_atomic not found';
  END IF;
END;
$$;

-- VERIFY: select 1 where exists (select 1 from information_schema.columns
-- VERIFY: where table_schema = 'public' and table_name = 'golf_shots'
-- VERIFY: and column_name = 'lie_after_recovery' and data_type = 'boolean');
-- VERIFY: select 1 where not exists (select 1 from pg_proc p
-- VERIFY: join pg_namespace n on n.oid = p.pronamespace
-- VERIFY: where n.nspname = 'public'
-- VERIFY: and p.proname in ('save_partial_round_atomic', 'submit_round_atomic')
-- VERIFY: and position('lie_after_recovery' in pg_get_functiondef(p.oid)) = 0);
