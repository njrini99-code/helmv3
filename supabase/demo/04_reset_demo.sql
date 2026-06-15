-- =============================================================================
-- Demo Reset Script — MANUAL USE ONLY
-- =============================================================================
-- WARNING: This script is DESTRUCTIVE within its defined scope.
-- DO NOT execute this automatically or from application code.
-- Run manually via Supabase MCP (service-role) or psql to reset the demo
-- environment after visitor sessions have left stale data.
--
-- What this script touches (and ONLY this):
--   1. golf_demo_sessions older than 30 days (keeps recent entries for analytics).
--   2. golf_rounds created during demo visitor exploration (those NOT having the
--      'demo-gapfill-passmore' sentinel and belonging to the demo team/player
--      that were created after the initial seed date).
--
-- What this script does NOT touch:
--   - The 11 Tyler Passmore gapfill rounds (sentinel: 'demo-gapfill-passmore').
--   - Nick Rini's rounds (separate player_id).
--   - The 5 Guilford-seeded dummy player rounds.
--   - The shared demo coach account (auth.users, public.users, golf_coaches, etc.).
--   - Any non-round data (events, insights, patterns, announcements, tasks, etc.).
--
-- Scope: ONLY data attributable to the shared demo team:
--   team_id = 6ecdd1a6-63fe-4beb-b094-00118f334163
--
-- Run frequency: as needed (e.g., weekly or after a demo event).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SAFETY: print a preamble so the operator knows what will happen.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_team_id    uuid := '6ecdd1a6-63fe-4beb-b094-00118f334163';
  v_sentinel   text := 'demo-gapfill-passmore';
  v_cutoff_sessions  timestamptz := now() - interval '30 days';
  v_seed_date  timestamptz := '2026-06-11 00:00:00+00';   -- date this script was first run

  v_sessions_to_delete  int;
  v_visitor_rounds      int;
BEGIN
  SELECT COUNT(*) INTO v_sessions_to_delete
    FROM public.golf_demo_sessions
   WHERE entered_at < v_cutoff_sessions;

  -- Visitor-created rounds: on the demo team, created after seed date, NOT the
  -- sentinel gapfill rows.
  SELECT COUNT(*) INTO v_visitor_rounds
    FROM public.golf_rounds
   WHERE team_id = v_team_id
     AND created_at > v_seed_date
     AND (notes IS NULL OR notes NOT LIKE '%' || v_sentinel || '%');

  RAISE NOTICE '=== DEMO RESET DRY PREVIEW ===';
  RAISE NOTICE 'golf_demo_sessions older than 30 days: % row(s) will be deleted', v_sessions_to_delete;
  RAISE NOTICE 'Visitor-created rounds (post-seed, non-sentinel): % row(s) will be deleted', v_visitor_rounds;
  RAISE NOTICE 'Comment out the RAISE EXCEPTION below and re-run to execute the deletes.';

  -- SAFETY GATE: prevents accidental execution.
  -- Remove/comment the line below to actually execute the deletes.
  RAISE EXCEPTION 'SAFETY GATE: remove this line to proceed with the reset.';
END $$;

-- ---------------------------------------------------------------------------
-- After removing the safety gate above, these statements execute:
-- ---------------------------------------------------------------------------

-- 1. Prune old demo session entries (keeps last 30 days for analytics).
-- DELETE FROM public.golf_demo_sessions
--  WHERE entered_at < now() - interval '30 days';

-- 2. Delete visitor-created rounds from the demo team (cascades to golf_holes
--    and golf_shots via FK ON DELETE CASCADE if configured; otherwise deletes
--    are ordered correctly below).
--    Only targets rounds created AFTER the seed date and NOT carrying the
--    gapfill sentinel. This preserves all seeded data.
-- DO $$
-- DECLARE
--   v_team_id   uuid := '6ecdd1a6-63fe-4beb-b094-00118f334163';
--   v_sentinel  text := 'demo-gapfill-passmore';
--   v_seed_date timestamptz := '2026-06-11 00:00:00+00';
--   v_round_ids uuid[];
-- BEGIN
--   SELECT ARRAY_AGG(id) INTO v_round_ids
--     FROM public.golf_rounds
--    WHERE team_id = v_team_id
--      AND created_at > v_seed_date
--      AND (notes IS NULL OR notes NOT LIKE '%' || v_sentinel || '%');
--
--   IF v_round_ids IS NOT NULL AND array_length(v_round_ids, 1) > 0 THEN
--     -- Delete child rows first if FK doesn't cascade.
--     DELETE FROM public.golf_round_stats_cache WHERE round_id = ANY(v_round_ids);
--     DELETE FROM public.golf_round_reviews      WHERE round_id = ANY(v_round_ids);
--     DELETE FROM public.golf_shots              WHERE round_id = ANY(v_round_ids);
--     DELETE FROM public.golf_holes              WHERE round_id = ANY(v_round_ids);
--     DELETE FROM public.golf_rounds             WHERE id       = ANY(v_round_ids);
--     RAISE NOTICE 'Deleted % visitor-created round(s) and their children.', array_length(v_round_ids, 1);
--   ELSE
--     RAISE NOTICE 'No visitor-created rounds found. Nothing to delete.';
--   END IF;
-- END $$;

-- ---------------------------------------------------------------------------
-- Verification queries (run after uncommenting and executing the deletes):
-- ---------------------------------------------------------------------------
-- SELECT COUNT(*) FROM public.golf_demo_sessions;
-- SELECT COUNT(*) FROM public.golf_rounds WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163';
-- SELECT player_id, COUNT(*) FROM public.golf_rounds
--   WHERE team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
--   GROUP BY player_id ORDER BY COUNT(*) DESC;
