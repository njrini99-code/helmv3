-- ============================================================================
-- Cloud Course Library — Phase 3: persist golf_rounds.tee_id through the round
-- atomic RPCs (submit_round_atomic + save_partial_round_atomic).
-- ----------------------------------------------------------------------------
-- golf_rounds.tee_id already exists (Phase 1, 20260613160000). The two atomic
-- RPCs build the golf_rounds row from a jsonb p_round_data via an EXPLICIT
-- column list, so they silently ignore a new tee_id key unless taught to apply
-- it. This migration injects ONE line into each — right after the existing
-- `tees_played = p_round_data->>'tees_played',` assignment — so a tee selected
-- at round entry is recorded for provenance + new-round defaults.
--
-- SNAPSHOT SAFETY: this changes ONLY the golf_rounds.tee_id assignment. Par/
-- yardage still snapshot into golf_holes from the client hole payload, exactly
-- as before. Editing a tee later never rewrites historical rounds.
--
-- DRIFT-FREE: rather than re-transcribe the (large) function bodies, we read the
-- LIVE definition via pg_get_functiondef, string-inject the line, and recreate.
-- Idempotent (skips if already patched) and self-asserting (raises if the
-- anchor line is missing, so a silent no-op can't ship). CREATE OR REPLACE
-- preserves owner + grants.
-- ============================================================================

DO $do$
DECLARE
  v_def    text;
  v_fn     text;
  v_target text := 'tees_played = p_round_data->>''tees_played'',';
  v_inject text := ' tee_id = CASE WHEN p_round_data->>''tee_id'' IS NULL THEN NULL ELSE (p_round_data->>''tee_id'')::uuid END,';
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['submit_round_atomic', 'save_partial_round_atomic']
  LOOP
    SELECT pg_get_functiondef(p.oid)
    INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn
    ORDER BY p.oid
    LIMIT 1;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'tee_id patch: function public.% not found', v_fn;
    END IF;

    -- Already carries a tee_id assignment → idempotent skip.
    IF position('->>''tee_id''' IN v_def) > 0 THEN
      CONTINUE;
    END IF;

    -- Anchor must exist, else fail loudly rather than ship a silent no-op.
    IF position(v_target IN v_def) = 0 THEN
      RAISE EXCEPTION 'tee_id patch: anchor "tees_played = ..." not found in public.%', v_fn;
    END IF;

    v_def := replace(v_def, v_target, v_target || v_inject);
    EXECUTE v_def;
  END LOOP;
END
$do$;
