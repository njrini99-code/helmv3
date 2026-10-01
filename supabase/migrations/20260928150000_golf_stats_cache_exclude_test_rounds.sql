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
--   public.golf_round_is_countable(<alias>.status
-- becomes
--   (NOT <alias>.is_test) AND public.golf_round_is_countable(<alias>.status
-- whatever the alias (update_player_stats_complete's trend subqueries use r2;
-- swap audit §16, 2026-10-01: a needle on "r." alone left last_5, last_10 and
-- prev_5 counting test rounds). Nothing else in any body changes. The rewrite
-- reads the LIVE definition (pg_get_functiondef), so it applies to whatever
-- OD-01 installed. It refuses to run if OD-01 is absent, a body has no
-- countable call, or any call is still unguarded after the rewrite.
-- Idempotent: existing guards are removed first, then every call is guarded.
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
  calls int;
  guarded_calls int;
  call_re constant text :=
    'public\.golf_round_is_countable\((\w+)\.status';
  guard_re constant text :=
    '\(NOT (\w+)\.is_test\) AND public\.golf_round_is_countable\(';
  plain constant text := 'public.golf_round_is_countable(';
  guarded constant text :=
    '(NOT \1.is_test) AND public.golf_round_is_countable(\1.status';
BEGIN
  IF to_regproc('public.golf_round_is_countable') IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'golf_round_is_countable'
     ) THEN
    RAISE EXCEPTION
      'golf_round_is_countable missing: apply 20260924120000 (OD-01) first';
  END IF;

  FOREACH fn IN ARRAY ARRAY[
    'update_player_stats_complete',
    'update_player_stats_strokes_gained',
    'refresh_player_stats_cache',
    'refresh_player_standing_round_metrics'
  ] LOOP
    SELECT p.oid INTO fn_oid FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn;
    IF fn_oid IS NULL THEN
      RAISE EXCEPTION 'function public.% not found', fn;
    END IF;
    def := pg_get_functiondef(fn_oid);
    -- Strip any guard already present, so a re-run never doubles one.
    def := regexp_replace(def, guard_re, plain, 'g');
    SELECT count(*) INTO calls FROM regexp_matches(def, call_re, 'g');
    IF calls = 0 THEN
      RAISE EXCEPTION
        'public.% has no countable-round call; is OD-01 applied?', fn;
    END IF;
    new_def := regexp_replace(def, call_re, guarded, 'g');
    SELECT count(*) INTO guarded_calls
      FROM regexp_matches(new_def, guard_re, 'g');
    IF guarded_calls <> calls THEN
      RAISE EXCEPTION 'public.%: % countable calls but % guarded',
        fn, calls, guarded_calls;
    END IF;
    EXECUTE new_def;
  END LOOP;
END
$$;

-- VERIFY (read-only, after apply): every countable call is guarded.
--   SELECT p.proname,
--     (SELECT count(*) FROM regexp_matches(pg_get_functiondef(p.oid),
--        'golf_round_is_countable\(', 'g')) AS calls,
--     (SELECT count(*) FROM regexp_matches(pg_get_functiondef(p.oid),
--        '\(NOT \w+\.is_test\) AND public\.golf_round_is_countable\(',
--        'g')) AS guarded
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname IN (
--     'update_player_stats_complete', 'update_player_stats_strokes_gained',
--     'refresh_player_stats_cache', 'refresh_player_standing_round_metrics');
--   -- expect calls = guarded on every row
