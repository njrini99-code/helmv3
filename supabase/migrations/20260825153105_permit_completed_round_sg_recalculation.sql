-- `recalculate_round_strokes_gained` is the explicit derived-write capability
-- for completed score history. The lifecycle guard already has a narrowly
-- scoped `stats_cache` allowance for exactly the five SG columns, but this RPC
-- did not claim it before writing those columns. As a result, successful round
-- submissions emitted a false post-submit error during cache refresh.

DO $$
DECLARE
  v_definition text;
  v_anchor text := $anchor$
BEGIN
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
$anchor$;
  v_replacement text := $replacement$
BEGIN
  PERFORM set_config('helm.golf_lifecycle_write', 'stats_cache', true);
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.recalculate_round_strokes_gained(uuid)'::regprocedure
  ) INTO v_definition;

  IF position('helm.golf_lifecycle_write'', ''stats_cache''' IN v_definition) > 0 THEN
    -- Main already contains the older companion migration
    -- 20260823235000_allow_derived_stats_cache_updates.sql. The linked
    -- production ledger may not; when it is present, leave that proven
    -- capability untouched rather than making this repair block the release.
    RETURN;
  END IF;

  IF position(v_anchor IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot safely add SG lifecycle capability: function BEGIN anchor is absent.';
  END IF;

  v_definition := replace(v_definition, v_anchor, v_replacement);
  EXECUTE v_definition;
END
$$;
