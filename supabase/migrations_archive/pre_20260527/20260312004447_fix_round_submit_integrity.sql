-- ============================================================================
-- Historical production reconciliation migration
-- ============================================================================
-- Production recorded an out-of-band fix_round_submit_integrity migration at
-- 2026-03-12 00:44:47 UTC. The durable schema/function changes from that
-- emergency patch are already represented in repo migrations, primarily:
--   - 20260311223000_fix_round_submit_integrity.sql
--   - 20260312040122_fix_18_hole_stats_cache.sql
--
-- This placeholder keeps local migration history aligned with production
-- without replaying an emergency data repair against fresh environments.
-- ============================================================================

BEGIN;
COMMIT;
