-- Feature-health heartbeat indexes.
--
-- get_feature_health(p_features jsonb) loops over ~86 feature descriptors and
-- runs one `max(<heartbeat column>)` per descriptor. Three of those columns had
-- NO index, so each was a full sequential scan. Measured on production
-- 2026-09-03 with explain (analyze):
--
--   golf_insight_exposure.created_at        2551 ms   (34 MB, 0 indexes)
--   golf_shots.updated_at                   1077 ms   (89 MB, 0 indexes)
--   golf_causal_relationships.updated_at     671 ms   (7.7 MB, 0 indexes)
--
-- 4.3 s for three of eighty-six descriptors, against a `statement_timeout=8s`
-- on the `authenticated` role. The result was
-- `canceling statement due to statement timeout` on GET /admin/health and
-- `feature_health_rpc_failed` on GET /admin/golf, both first seen minutes after
-- the 2026-09-03 production deploy made those surfaces reachable.
--
-- A btree on the column turns each `max()` into an index-only scan. CONCURRENTLY
-- so no write on golf_shots is blocked while the index builds — this runs
-- against a live database with users on it, and golf_shots is the round-tracking
-- hot path.
--
-- IF NOT EXISTS on every statement: re-running this migration must be a no-op,
-- and a CONCURRENTLY build that fails leaves an INVALID index behind that a
-- plain CREATE would then collide with.

create index concurrently if not exists golf_shots_updated_at_idx
  on public.golf_shots (updated_at desc);

create index concurrently if not exists golf_insight_exposure_created_at_idx
  on public.golf_insight_exposure (created_at desc);

create index concurrently if not exists golf_causal_relationships_updated_at_idx
  on public.golf_causal_relationships (updated_at desc);
