-- DECLARATIVE: exempt helm_jobs is not mirrored under supabase/schemas
-- (pgmq-backed, from 20260906140000, predates D2); RLS flag only.
-- Enable row level security on helm_jobs.dedupe_keys in production.
--
-- 20260906140000_helm_jobs_pgmq_queues.sql (APPLIED, ledger-verified
-- 2026-09-22) created helm_jobs.dedupe_keys without RLS; only
-- helm_jobs.dead_letters got `enable row level security`. A read-only catalog
-- check on 2026-09-23 confirmed it: pg_class.relrowsecurity is true for
-- dead_letters and false for dedupe_keys. PR #1969 tried to close the gap by
-- adding the line to the already-applied file, which would have made the repo
-- claim a state production never had. That edit is reverted, and the change
-- ships here as a forward migration instead.
--
-- Same isolation pattern as dead_letters: RLS on, zero policies. The only
-- readers and writers are service_role and the SECURITY DEFINER
-- public.helm_jobs_* facades, and both bypass RLS, so behavior is unchanged.
-- The point is that an accidental future grant to anon/authenticated still
-- reads nothing.

SET lock_timeout = '5s';

ALTER TABLE IF EXISTS helm_jobs.dedupe_keys ENABLE ROW LEVEL SECURITY;

-- ROLLBACK: ALTER TABLE helm_jobs.dedupe_keys DISABLE ROW LEVEL SECURITY;

-- VERIFY: select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'helm_jobs' and c.relname = 'dedupe_keys' and c.relrowsecurity; -- noqa: LT05
