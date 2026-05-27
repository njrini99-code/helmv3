-- Set statement timeout for web-facing Postgres roles
-- Prevents runaway queries from hanging dashboard loads
-- Applied: 2026-02-21
--
-- Timeline:
--   8s  → Postgres kills the query (statement_timeout)
--   10s → HTTP fetch abort (AbortSignal in server.ts)
--  120s → Previous default (caused 30s Vercel timeouts via retry exhaustion)

ALTER ROLE authenticated SET statement_timeout = '8s';
ALTER ROLE anon SET statement_timeout = '8s';

-- service_role keeps longer timeout for migrations, backfills, bulk ops
-- (service_role = 60s, which is the Supabase platform default)
