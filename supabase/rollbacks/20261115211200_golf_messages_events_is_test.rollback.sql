-- Rollback for 20261115211200_golf_messages_events_is_test.sql (DD-13 is_test flag).
--
-- Both columns are new: there is no prior definition to restore. Run as
-- postgres, in one transaction (db query --linked does that).
--
-- What rolling back costs: the flags set since are lost, and any deployed read
-- that filters on is_test fails until it is reverted too. Check first:
--
--   select 'golf_messages', count(*) from public.golf_messages where is_test
--   union all
--   select 'golf_events', count(*) from public.golf_events where is_test;

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.golf_messages DROP COLUMN IF EXISTS is_test;
ALTER TABLE public.golf_events DROP COLUMN IF EXISTS is_test;

-- VERIFY: neither column is left.
--   select count(*) = 0 from information_schema.columns
--    where table_schema = 'public' and column_name = 'is_test'
--      and table_name in ('golf_messages', 'golf_events');
