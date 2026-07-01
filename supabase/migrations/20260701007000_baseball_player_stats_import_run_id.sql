-- Net-new fix: src/lib/baseball/read-models/player-today.ts selects
-- baseball_player_stats.import_run_id (and joins it to baseball_import_runs)
-- but the column has never existed, so the Player Today "recent stats"
-- query fails silently at the PostgREST layer.
--
-- Additive, re-runnable: adds the missing column only if absent. No grants
-- are touched (RLS/anon posture on baseball_player_stats is unaffected).
ALTER TABLE public.baseball_player_stats
  ADD COLUMN IF NOT EXISTS import_run_id uuid REFERENCES public.baseball_import_runs(id) ON DELETE SET NULL;
