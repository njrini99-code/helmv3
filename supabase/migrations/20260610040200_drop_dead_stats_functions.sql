-- Stats accuracy audit 2026-06-09: five stats writer functions exist in prod
-- but are bound to NO trigger (verified via pg_trigger join at audit time) and
-- are called by no TS code. They are stale generations of the current writers
-- and only mislead future readers/audits. Drop them.
--
-- KEPT deliberately:
--   - update_player_stats_strokes_gained(p_player_id uuid) — called by
--     invalidateOnRoundComplete (golf-stats-calculator.ts). Only the no-arg
--     trigger-form overload is dropped.
--   - calculate_round_strokes_gained(uuid) — referenced by submit_round_atomic
--     and recompute_team_sg.
--
-- Note on calculate_strokes_gained_on_round_complete: migration
-- 20260606200000 asserts a BEFORE-UPDATE trigger binds it in prod; the live
-- trigger list shows no such trigger (only trg_update_round_stats_cache binds
-- to golf_rounds). SG is computed by submit_round_atomic (in-transaction
-- PERFORM recalculate_round_strokes_gained) and the invalidate pipeline, and
-- all 173 completed prod rounds carry SG — the function is dead drift.
--
-- APPLY: via MCP apply_migration (apply-time version stamp, NOT this filename).
-- ROLLBACK: restore the definitions from the 20260527000000 baseline.

DROP FUNCTION IF EXISTS public.update_player_stats_cache();
DROP FUNCTION IF EXISTS public.update_player_stats_cache_enhanced();
DROP FUNCTION IF EXISTS public.update_round_stats_cache_with_sg();
DROP FUNCTION IF EXISTS public.calculate_strokes_gained_on_round_complete();
DROP FUNCTION IF EXISTS public.update_player_stats_strokes_gained();
