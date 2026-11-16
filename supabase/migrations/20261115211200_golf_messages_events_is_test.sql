-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 15 Nov 2026 for launch readiness DD-13: the is_test hide flag on
--   golf_messages and golf_events, the two tables QA writes to most that have
--   none (same shape as 20260924130000 and 20260927120000). Not applied
--   anywhere, not run against any database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261115211200_golf_messages_events_is_test.sql
--   then npm run db:types.
--
-- Risk: LOW. Additive only: one NOT NULL boolean, default false, on each
--   table. Every existing row reads false, so nothing changes until rows are
--   flagged and the reads filter on the column (the read filters belong to
--   the figures and test-isolation work, DD-14, not to this file). ADD
--   COLUMN with a constant default is catalog-only (no table rewrite). No
--   policy, grant, index or trigger changes; no policy reads the column.
--
-- ORDER: independent of the other two demo migrations. Apply before any code
--   that filters on the column is deployed: a filter on a missing column
--   fails the query.
--
-- ROLLBACK (supabase/rollbacks/
--   20261115211200_golf_messages_events_is_test.rollback.sql):
-- ROLLBACK:   ALTER TABLE public.golf_messages DROP COLUMN is_test;
-- ROLLBACK:   ALTER TABLE public.golf_events DROP COLUMN is_test;
--   Cost of rolling back: the flags set since are lost.
--
-- VERIFY: select 1 from information_schema.columns
-- VERIFY:  where table_schema = 'public' and column_name = 'is_test'
-- VERIFY:    and table_name in ('golf_messages', 'golf_events')
-- VERIFY:    and is_nullable = 'NO'
-- VERIFY: having count(*) = 2;

-- No BEGIN or COMMIT in this file: db:apply runs the whole file and its ledger
-- row in one transaction, and a COMMIT here would close that transaction
-- before the ledger row is written.
SET lock_timeout = '3s';

ALTER TABLE public.golf_messages
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.golf_events
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.golf_messages.is_test IS
'QA row: hidden from team reads once the reads filter on it (DD-13).';
COMMENT ON COLUMN public.golf_events.is_test IS
'QA row: hidden from team reads once the reads filter on it (DD-13).';
