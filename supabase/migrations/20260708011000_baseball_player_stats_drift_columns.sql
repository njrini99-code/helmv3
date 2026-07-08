-- Schema drift repair: BaseballPlayerStats TS type (and computeCareerSlashLine's row Pick)
-- declare hit_by_pitch / sacrifice_flies, but the live table never got them — an explicit
-- PostgREST select naming them 400s. Additive, default 0, matches app fallback behavior.
-- Applied to prod 2026-07-08 via MCP apply_migration (same content).
ALTER TABLE public.baseball_player_stats ADD COLUMN IF NOT EXISTS hit_by_pitch integer NOT NULL DEFAULT 0;
ALTER TABLE public.baseball_player_stats ADD COLUMN IF NOT EXISTS sacrifice_flies integer NOT NULL DEFAULT 0;
