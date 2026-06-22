-- Stale-data fix for CoachHelm causal relationships (the recurring "old stuff"
-- bug, same class as the golf_patterns_v2 / golf_coach_insights remediations).
--
-- CausalEngine.discoverCausalRelationships re-tests a fixed hypothesis set over
-- the player's last 100 completed rounds on every fire (round-submit + Analyze
-- Team). saveRelationships() is an idempotent natural-key upsert that ONLY
-- touches relationships present in the fresh run — a relationship that stops
-- passing (drops out of the shifted window) was simply absent from the batch,
-- so its prior row lingered forever with stale strength/confidence, and the
-- read path (fetchPlayerRowsDeduped) had no freshness/active filter to hide it.
--
-- The table had no flag to soft-supersede with. Add an is_active boolean so the
-- engine can retire stale rows WITHOUT a destructive delete (GolfHelm hard rule:
-- no delete-then-insert in a save/sync path) and the reader can default to
-- active-only. Additive and idempotent — no data loss, every existing row stays
-- active by default.

ALTER TABLE public.golf_causal_relationships
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Reader fetches the player's rows newest-first then filters is_active; this
-- partial index keeps that hot path fast as inactive rows accumulate.
CREATE INDEX IF NOT EXISTS idx_golf_causal_relationships_player_active
  ON public.golf_causal_relationships (player_id, created_at DESC)
  WHERE is_active;
