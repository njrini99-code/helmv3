-- Drop the redundant trg_sync_round_sg_to_cache trigger on golf_rounds.
--
-- This trigger fired AFTER UPDATE OF strokes_gained_* columns and called
-- update_round_stats_cache_with_sg(), which re-wrote the same SG values
-- that update_round_stats_cache() already writes in its own AFTER UPDATE path.
--
-- The redundant trigger doubled the downstream cascade:
--   golf_round_stats_cache → update_player_stats_cache
--   golf_round_stats_cache → update_player_stats_cache_enhanced
--   golf_round_stats_cache → update_player_stats_strokes_gained
-- firing 6x instead of 3x per round completion, causing PostgreSQL
-- "stack depth limit exceeded" errors on round submit.

DROP TRIGGER IF EXISTS trg_sync_round_sg_to_cache ON golf_rounds;
