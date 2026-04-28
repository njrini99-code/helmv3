-- =============================================================================
-- Admin Perf Indexes — 2026-04-28
--
-- Adds composite indexes that back hot-path admin dashboard queries. Several
-- of the admin rollup paths filter+sort by the same column trios (e.g.
-- `event_type`/`severity`/`created_at DESC` on `admin_events`) and were doing
-- bitmap heap scans on tables that have grown into the hundreds of thousands
-- of rows. These indexes turn those into ordered index scans with a tight
-- LIMIT pushdown, cutting the dashboard rollup wall time on Overview / System
-- / Tracer significantly.
--
-- Indexes added:
--   * idx_admin_events_event_severity_created
--       admin_events (event_type, severity, created_at DESC)
--   * idx_golf_rounds_player_created_at
--       golf_rounds (player_id, created_at DESC)
--   * idx_golf_insight_generation_log_player_created
--       golf_insight_generation_log (player_id, created_at DESC)
--   * idx_background_job_logs_started_at
--       background_job_logs (started_at DESC)
--
-- IMPORTANT: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction
-- block. The Supabase MCP `apply_migration` tool runs each statement
-- individually (no implicit BEGIN/COMMIT wrapping the whole file), so all
-- four `CREATE INDEX CONCURRENTLY` statements below execute outside any
-- transaction. If a future runner tries to wrap this file in a transaction
-- it will fail with `25001 / CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block` — split the statements into separate `execute_sql`
-- calls in that case.
--
-- All four use `IF NOT EXISTS` so re-running the migration is a no-op.
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_events_event_severity_created
  ON admin_events (event_type, severity, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_golf_rounds_player_created_at
  ON golf_rounds (player_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_golf_insight_generation_log_player_created
  ON golf_insight_generation_log (player_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_background_job_logs_started_at
  ON background_job_logs (started_at DESC);
