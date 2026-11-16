-- DECLARATIVE: exempt data backfill of golf_round_stats_cache and its archive
--   table (functions mirrored in supabase/schemas/functions/public.sql and
--   supabase/schemas/functions/helm_private.sql)
--
-- Scrambling counts sand saves (coach request 2026-11-16).
-- STATUS: WRITTEN — HOLD — NOT APPLIED. Awaits the owner's approval to apply
-- (supabase/migrations/HELD.md).
--
-- WHAT IS WRONG: a coach asked for sand saves to count toward Scrambling as
--   well as staying their own stat. Today a scramble chance is only a missed
--   green (gir = false) and a scramble is par or better after it. A sand save
--   (Tour rule since 20261115200000: first greenside-bunker shot holed in two
--   strokes or fewer, any score) counts only when it also happens to be a
--   missed green made in par or better.
--
-- WHAT CHANGES: one rule, per hole, in both cache writers
--   (update_round_stats_cache, refresh_player_stats_cache) and in the app
--   (holeScramble, src/lib/golf/stat-formulas.ts):
--     chance = missed green OR a greenside-bunker visit (sand_save not null)
--     made   = (missed green AND par or better) OR sand_save = true
--   A hole counts once, so a sand save that was already a scramble is not
--   counted twice. Sand saves (sand_saves / sand_attempts) do not change.
--   Then every completed round whose cached scramble counts differ from the
--   new rule is refreshed, with its old counts archived first.
--
-- WHAT MOVES (production, read-only, 2026-11-16, completed rounds, scored
--   holes): 1,544 sand chances and 464 saves. 296 of the saves were already
--   counted as scrambles; 168 are new made scrambles (39 bogey-or-worse saves
--   on missed greens, 129 saves on holes that hit the green in regulation,
--   such as a par 5 bunkered in two). 200 sand misses on GIR holes become new
--   failed chances. Squad scrambling moves about 0 to +2 points; a few
--   players dip slightly where GIR-hole bunker misses outweigh saves.
--   Scrambling's Tour comparison now counts bunker chances the Tour's
--   scrambling stat does not; the Tour line stays as the benchmark.
--
-- ORDER: deploy the app change in the same PR first (the app reads the same
--   rule), then apply this file. Both functions are patched in place: the
--   file reads each live definition (pg_get_functiondef), replaces the
--   scramble lines, and refuses unless the old lines occur exactly once and
--   the new ones are absent, so a second apply is refused. In place rather
--   than a whole body because production's refresh_player_stats_cache (prosrc
--   md5 da0ba53873b7c8ac519b9541f0b5f2eb) differs from a from-scratch replay,
--   where the held 20260924120000_golf_countable_round_stats_cache.sql has
--   already rewritten it; that held file carries the new rule in its own copy
--   too, so applying it later does not undo this one.
--
-- ROLLBACK:
--   supabase/rollbacks/20261116200000_golf_scrambling_counts_sand_saves.rollback.sql -- noqa: LT05
--   puts the old scramble lines back in both functions (the same in-place
--   patch, reversed), refreshes each archived round on the old rule, and
--   drops the backfill function.
--   The archive table is kept.
--
-- pgTAP: supabase/tests/rls/golf_scrambling_counts_sand_saves.sql
--
-- noqa: disable=LT05
-- VERIFY: select 1 from pg_proc where oid = to_regprocedure('public.update_round_stats_cache()') and position('OR sand_save=true' in prosrc) > 0;
-- VERIFY: select 1 from pg_proc where oid = to_regprocedure('public.refresh_player_stats_cache(uuid)') and position('OR h.sand_save = true' in prosrc) > 0;
-- VERIFY: select 1 from pg_proc where oid = to_regprocedure('helm_private.golf_backfill_scrambling_sand_saves()');
-- VERIFY: select 1 where not has_table_privilege('authenticated',
-- VERIFY:   'helm_private.golf_round_cache_scrambling_fix_20261116', 'SELECT')
-- VERIFY:   and not has_table_privilege('anon',
-- VERIFY:   'helm_private.golf_round_cache_scrambling_fix_20261116', 'SELECT');
-- noqa: enable=LT05

-- db:apply runs the file in one transaction, so SET LOCAL holds for exactly
-- this apply. The backfill row-locks the rounds it touches.
SET LOCAL lock_timeout = '3s';

-- (1) and (2): both cache writers, patched in place ---------------------------

DO $patch$
DECLARE
  v_fn regprocedure;
  v_def text;
  v_old text;
  v_new text;
  v_hits integer;
BEGIN
  -- (1) update_round_stats_cache: the round cache trigger.
  v_fn := to_regprocedure('public.update_round_stats_cache()');
  v_old := $old1$
  SELECT COALESCE(SUM(CASE WHEN gir=false AND (score-par)<=0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN gir=false THEN 1 ELSE 0 END),0)
  INTO v_scrambles_converted, v_scramble_attempts
  FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;
$old1$;
  v_new := $new1$
  -- Scrambling counts sand saves (20261116200000): a chance is a missed green
  -- or a greenside-bunker visit, one per hole; made is par or better after the
  -- miss, or a sand save (any score). Mirrors holeScramble in
  -- src/lib/golf/stat-formulas.ts.
  SELECT COALESCE(SUM(CASE WHEN (gir=false AND (score-par)<=0) OR sand_save=true THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN gir=false OR sand_save IS NOT NULL THEN 1 ELSE 0 END),0)
  INTO v_scrambles_converted, v_scramble_attempts
  FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;
$new1$;
  v_def := pg_get_functiondef(v_fn);
  SELECT count(*) INTO v_hits FROM regexp_matches(v_def, 'OR sand_save=true', 'g');
  IF v_hits > 0 THEN
    RAISE EXCEPTION 'scrambling counts sand saves: update_round_stats_cache() already counts sand saves; this file was applied before.';
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'scrambling counts sand saves: the scramble lines of update_round_stats_cache() are not the ones this file was written on. Rebase this file on the live body.';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);

  -- (2) refresh_player_stats_cache: the player cache rebuild.
  v_fn := to_regprocedure('public.refresh_player_stats_cache(uuid)');
  v_old := $old2$
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND (h.score - h.par) <= 0 AND h.score IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND h.score IS NOT NULL), 0),
$old2$;
  v_new := $new2$
    -- Scrambling counts sand saves (20261116200000), as update_round_stats_cache does.
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND ((h.gir = false AND (h.score - h.par) <= 0) OR h.sand_save = true)), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.gir = false OR h.sand_save IS NOT NULL)), 0),
$new2$;
  v_def := pg_get_functiondef(v_fn);
  SELECT count(*) INTO v_hits FROM regexp_matches(v_def, 'OR h\.sand_save = true', 'g');
  IF v_hits > 0 THEN
    RAISE EXCEPTION 'scrambling counts sand saves: refresh_player_stats_cache(uuid) already counts sand saves; this file was applied before.';
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'scrambling counts sand saves: the scramble lines of refresh_player_stats_cache(uuid) are not the ones this file was written on. Rebase this file on the live body.';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$patch$;

-- (3) The archive and the backfill -------------------------------------------

CREATE TABLE IF NOT EXISTS helm_private.golf_round_cache_scrambling_fix_20261116 (
    round_id uuid PRIMARY KEY,
    old_scrambles_converted integer,
    old_scramble_attempts integer,
    new_scrambles_converted integer NOT NULL,
    new_scramble_attempts integer NOT NULL,
    archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE helm_private.golf_round_cache_scrambling_fix_20261116
ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON helm_private.golf_round_cache_scrambling_fix_20261116
FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION helm_private.golf_backfill_scrambling_sand_saves()
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_changed integer;
  v_off integer;
BEGIN
  -- Archive every completed round whose cached scramble counts differ from
  -- the rule update_round_stats_cache now writes.
  INSERT INTO helm_private.golf_round_cache_scrambling_fix_20261116 (
    round_id, old_scrambles_converted, old_scramble_attempts,
    new_scrambles_converted, new_scramble_attempts
  )
  SELECT c.round_id, c.scrambles_converted, c.scramble_attempts, k.made, k.chances
  FROM public.golf_round_stats_cache AS c
  INNER JOIN public.golf_rounds AS r ON r.id = c.round_id
  CROSS JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE (h.gir = false AND (h.score - h.par) <= 0) OR h.sand_save = true)::integer AS made,
      count(*) FILTER (WHERE h.gir = false OR h.sand_save IS NOT NULL)::integer AS chances
    FROM public.golf_holes AS h
    WHERE h.round_id = c.round_id AND h.score IS NOT NULL
  ) AS k
  WHERE r.status = 'completed'
    AND (c.scrambles_converted IS DISTINCT FROM k.made
      OR c.scramble_attempts IS DISTINCT FROM k.chances)
  ON CONFLICT (round_id) DO UPDATE SET
    old_scrambles_converted = excluded.old_scrambles_converted,
    old_scramble_attempts = excluded.old_scramble_attempts,
    new_scrambles_converted = excluded.new_scrambles_converted,
    new_scramble_attempts = excluded.new_scramble_attempts,
    archived_at = excluded.archived_at;

  -- Refresh each archived round's cache: trg_update_round_stats_cache fires
  -- on UPDATE OF status, and the cache row's own trigger refreshes the
  -- player's. The lifecycle guard lets postgres touch a completed round under
  -- the transaction-local 'atomic' mark.
  PERFORM set_config('helm.golf_lifecycle_write', 'atomic', true);

  UPDATE public.golf_rounds AS r
  SET status = r.status
  WHERE r.id IN (
    SELECT a.round_id
    FROM helm_private.golf_round_cache_scrambling_fix_20261116 AS a
    WHERE a.archived_at = now()
  );
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  PERFORM set_config('helm.golf_lifecycle_write', '', true);

  SELECT count(*) INTO v_off
  FROM helm_private.golf_round_cache_scrambling_fix_20261116 AS a
  INNER JOIN public.golf_round_stats_cache AS c ON c.round_id = a.round_id
  WHERE a.archived_at = now()
    AND (c.scrambles_converted IS DISTINCT FROM a.new_scrambles_converted
      OR c.scramble_attempts IS DISTINCT FROM a.new_scramble_attempts);
  IF v_off > 0 THEN
    RAISE EXCEPTION 'scrambling backfill: % round stats caches disagree with the new rule; rolling back', v_off;
  END IF;

  RETURN v_changed;
END
$$;

ALTER FUNCTION helm_private.golf_backfill_scrambling_sand_saves() OWNER TO postgres;
REVOKE ALL ON FUNCTION helm_private.golf_backfill_scrambling_sand_saves()
FROM public, anon, authenticated;

-- (4) Run it once ------------------------------------------------------------

SELECT helm_private.golf_backfill_scrambling_sand_saves();
