-- CoachHelm deep audit row 47 (2026-09-28): the player stats cache, which
-- Ask CoachHelm's tools read, still counts test rounds. WRITTEN, NOT APPLIED.
--
-- Apply only AFTER 20260924120000 (OD-01), 20260924140000 and 20260925120000.
-- OD-01 routes every cache and standing aggregate through
-- public.golf_round_is_countable(r.status, ...), which has no is_test input,
-- and 20260924140000's DO block checks the md5 of OD-01's
-- refresh_player_standing_round_metrics body, so this file must come last.
--
-- Change. In the four OD-01 functions, every
--   public.golf_round_is_countable(r.status
-- becomes
--   (NOT r.is_test) AND public.golf_round_is_countable(r.status
-- Nothing else in any body changes. The rewrite reads the LIVE definition
-- (pg_get_functiondef), so it applies to whatever OD-01 installed, and it
-- refuses to run if OD-01 is absent or a body has no countable call.
-- Idempotent: a body that already carries the guard is skipped.
--
-- After apply (service role):
--   SELECT public.refresh_player_stats_cache(p.id) FROM public.golf_players p;
-- Sizing (read-only, 2026-09-28): 6 test rounds, 5 completed, 3 players.
--
-- ROLLBACK: re-apply the four bodies from 20260924120000 (and 20260924140000 /
-- 20260925120000 for refresh_player_standing_round_metrics).

DO $$
DECLARE
  fn text;
  fn_oid oid;
  def text;
  new_def text;
  needle constant text := 'public.golf_round_is_countable(r.status';
  guarded constant text := '(NOT r.is_test) AND public.golf_round_is_countable(r.status';
BEGIN
  IF to_regproc('public.golf_round_is_countable') IS NULL
     AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = 'golf_round_is_countable') THEN
    RAISE EXCEPTION 'golf_round_is_countable missing: apply 20260924120000 (OD-01) first';
  END IF;

  FOREACH fn IN ARRAY ARRAY[
    'update_player_stats_complete',
    'update_player_stats_strokes_gained',
    'refresh_player_stats_cache',
    'refresh_player_standing_round_metrics'
  ] LOOP
    SELECT p.oid INTO fn_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn;
    IF fn_oid IS NULL THEN
      RAISE EXCEPTION 'function public.% not found', fn;
    END IF;
    def := pg_get_functiondef(fn_oid);
    IF position(guarded IN def) > 0 THEN
      CONTINUE; -- already guarded
    END IF;
    IF position(needle IN def) = 0 THEN
      RAISE EXCEPTION 'public.% has no countable-round call; is OD-01 applied?', fn;
    END IF;
    new_def := replace(def, needle, guarded);
    EXECUTE new_def;
  END LOOP;
END
$$;
