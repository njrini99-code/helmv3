-- v3 Wave 20 — golf_player_focus_areas → golf_goals one-shot backfill
--
-- Per master plan Part VI.6 + Part XXI Backfill Strategy. Inserts one
-- golf_goals row per non-archived focus_area whose target_metric maps
-- cleanly to a canonical v3 metric_id. Rows that don't map (e.g.
-- "Bounce-back %", "Fairways hit %") are deliberately skipped — better
-- to omit than to mint a goal pointing at the wrong metric.
--
-- DEVIATION FROM PLAN: the master plan's Part VI.6 SQL also includes
-- `ALTER TABLE golf_player_focus_areas RENAME TO _deprecated_...`. That
-- would break /dashboard/my-development which still reads from
-- golf_player_focus_areas. The rename is deferred to a future wave that
-- ships after my-development is migrated to read goals.
--
-- Idempotent: wrapped in a DO block that no-ops when golf_goals already
-- has rows. Safe to re-run.
--
-- VERIFIED 2026-05-25 against prod project qmnssrrolpinvwjjnufo:
--
--   SELECT count(*), count(DISTINCT target_metric)
--   FROM golf_player_focus_areas;
--   -> 7 rows, 7 distinct target_metric values:
--      "3-6ft make %", "Avg proximity 80-120y", "Bounce-back %",
--      "Fairways hit %", "avg_proximity_ft", "make_pct_5_10",
--      "scrambling_pct"
--
--   Mapping (5 of 7 — Bounce-back and Fairways hit have no v3 metric):
--     "3-6ft make %"        → putts_made_3_5ft_pct
--     "Avg proximity 80-120y" → approach_proximity_50_125ft
--     "avg_proximity_ft"    → approach_proximity_50_125ft
--     "make_pct_5_10"       → putts_made_5_10ft_pct
--     "scrambling_pct"      → scrambling_pct_rough
--
-- ROLLBACK:
--   DELETE FROM golf_goals
--   WHERE origin = 'manual'
--     AND category IN ('putting','approach','short_game')
--     AND created_by_user_id IN (
--       SELECT user_id FROM golf_coaches
--       WHERE id IN (SELECT DISTINCT coach_id FROM golf_player_focus_areas)
--     );
--   (Targets the rows this migration writes; spare any subsequent
--   coach-created goals.)

DO $$
DECLARE
  v_existing_goals int;
  v_inserted int;
BEGIN
  SELECT count(*) INTO v_existing_goals FROM public.golf_goals;
  IF v_existing_goals > 0 THEN
    RAISE NOTICE 'W20 backfill skipped: golf_goals already has % rows. Re-run is a no-op.', v_existing_goals;
    RETURN;
  END IF;

  WITH metric_mapping AS (
    SELECT
      fa.id AS source_id,
      fa.player_id,
      fa.team_id,
      fa.coach_id,
      fa.title,
      fa.area_type,
      fa.status,
      fa.started_at,
      fa.completed_at,
      fa.current_value,
      fa.target_value,
      fa.from_insight_id,
      fa.progress_notes,
      CASE fa.target_metric
        WHEN '3-6ft make %'         THEN 'putts_made_3_5ft_pct'
        WHEN 'Avg proximity 80-120y' THEN 'approach_proximity_50_125ft'
        WHEN 'avg_proximity_ft'      THEN 'approach_proximity_50_125ft'
        WHEN 'make_pct_5_10'         THEN 'putts_made_5_10ft_pct'
        WHEN 'scrambling_pct'        THEN 'scrambling_pct_rough'
        ELSE NULL
      END AS v3_metric_id,
      -- coach_id (golf_coaches.id) → user_id translation
      (SELECT c.user_id FROM public.golf_coaches c WHERE c.id = fa.coach_id) AS coach_user_id,
      -- Resolve effective started_at + ends_at, clamped to 7-365 window
      COALESCE(fa.started_at, fa.created_at, now()) AS effective_started_at,
      LEAST(
        COALESCE(fa.started_at, fa.created_at, now()) + INTERVAL '365 days',
        GREATEST(
          COALESCE(fa.started_at, fa.created_at, now()) + INTERVAL '7 days',
          COALESCE(
            fa.completed_at,
            COALESCE(fa.started_at, fa.created_at, now()) + INTERVAL '90 days'
          )
        )
      ) AS effective_ends_at
    FROM public.golf_player_focus_areas fa
    WHERE fa.status IS NULL OR fa.status != 'archived'
  ),
  inserted AS (
    INSERT INTO public.golf_goals (
      player_id, team_id,
      created_by_user_id, creator_role, coach_id_if_assigned,
      metric_id, title, category,
      started_at, ends_at,
      baseline_value, current_value, target_value, target_source,
      state,
      shared_with_coach, shared_at,
      coach_assignment_mode, player_accepted_at,
      origin, origin_insight_id,
      snapshots
    )
    SELECT
      mm.player_id,
      mm.team_id,
      -- created_by_user_id: prefer coach's user_id; fall back to player's user_id
      COALESCE(
        mm.coach_user_id,
        (SELECT p.user_id FROM public.golf_players p WHERE p.id = mm.player_id)
      ),
      -- creator_role: 'coach' if a coach assigned it AND we resolved their user_id
      CASE WHEN mm.coach_user_id IS NOT NULL THEN 'coach' ELSE 'player' END,
      -- coach_id_if_assigned: only when creator is coach
      CASE WHEN mm.coach_user_id IS NOT NULL THEN mm.coach_id ELSE NULL END,
      mm.v3_metric_id,
      mm.title,
      mm.area_type,
      mm.effective_started_at,
      mm.effective_ends_at,
      mm.current_value, -- baseline_value: same as current at migration time
      mm.current_value,
      mm.target_value,
      'manual'::text,
      CASE mm.status
        WHEN 'completed' THEN 'achieved'
        WHEN 'active'    THEN 'active'
        ELSE 'abandoned'
      END,
      -- shared_with_coach: true for coach-assigned focus areas (continuity)
      mm.coach_user_id IS NOT NULL,
      CASE WHEN mm.coach_user_id IS NOT NULL THEN now() ELSE NULL END,
      -- coach_assignment_mode: pre-existing focus areas were effectively mandatory
      CASE WHEN mm.coach_user_id IS NOT NULL THEN 'mandatory'::text ELSE NULL END,
      CASE WHEN mm.coach_user_id IS NOT NULL THEN now() ELSE NULL END,
      'manual'::text,
      mm.from_insight_id,
      COALESCE(mm.progress_notes, '[]'::jsonb)
    FROM metric_mapping mm
    WHERE mm.v3_metric_id IS NOT NULL
      -- Defend against the resolved created_by_user_id being null (orphaned coach)
      AND COALESCE(
        mm.coach_user_id,
        (SELECT p.user_id FROM public.golf_players p WHERE p.id = mm.player_id)
      ) IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  RAISE NOTICE 'W20 backfill complete: % goals inserted from focus_areas.', v_inserted;
END $$;
