-- BaseballHelm #436 — persist the slash line on player aggregates.
--
-- `recalculatePlayerAggregates` (src/app/baseball/actions/stats.ts) previously
-- only wrote `career_avg`, but My Stats `StatsOverviewCards` reads
-- `career_obp`, `career_slg`, and `career_ops`. Those columns never existed on
-- the live `baseball_player_aggregates` table, so OBP/SLG/OPS permanently
-- showed "---". Add them here (numeric, matching `career_avg`) so the recalc
-- can compute and upsert the full slash line.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. No data backfill — the columns fill in
-- on the next aggregate recalculation for each player.

ALTER TABLE "public"."baseball_player_aggregates"
    ADD COLUMN IF NOT EXISTS "career_obp" numeric;

ALTER TABLE "public"."baseball_player_aggregates"
    ADD COLUMN IF NOT EXISTS "career_slg" numeric;

ALTER TABLE "public"."baseball_player_aggregates"
    ADD COLUMN IF NOT EXISTS "career_ops" numeric;
