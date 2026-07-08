-- Schema drift repair (2026-07-08 audit): the BaseballPlayerStats TS type
-- declares 7 real baseball stats that were never added to the live table, so
-- the UI renders them as always-null and any write naming them 400s. These are
-- all legitimate stats the app already surfaces (launch_angle/spin_rate on
-- metrics cards, caught_stealing etc. on box scores). Additive + nullable =
-- safe (no rewrite, no default). Makes the table match the type. The 8th
-- phantom field, upload_batch_id, is a legacy dup of the existing import_run_id
-- and is NOT added — its write is removed in the same PR. Applied to prod
-- via MCP apply_migration on 2026-07-08.
ALTER TABLE public.baseball_player_stats
  ADD COLUMN IF NOT EXISTS caught_stealing  integer,
  ADD COLUMN IF NOT EXISTS sacrifice_bunts  integer,
  ADD COLUMN IF NOT EXISTS runs_allowed     integer,
  ADD COLUMN IF NOT EXISTS pitches_thrown   integer,
  ADD COLUMN IF NOT EXISTS strikes_thrown   integer,
  ADD COLUMN IF NOT EXISTS launch_angle     numeric,
  ADD COLUMN IF NOT EXISTS spin_rate        numeric;
