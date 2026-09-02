-- Reconcile the resettable local schema with the production NCAA division
-- contract. Production already contains these labels; this migration is
-- idempotent so it can safely be reviewed for a later production ledger repair.
--
-- The baseline captured only D2/D3, while live CRM/UI/import code accepts all
-- nine labels below. Preserve the live ordering because enum ordering is part
-- of PostgreSQL comparison semantics.
ALTER TYPE public.ncaa_division ADD VALUE IF NOT EXISTS 'D1' AFTER 'D3';
ALTER TYPE public.ncaa_division ADD VALUE IF NOT EXISTS 'NAIA' AFTER 'D1';
ALTER TYPE public.ncaa_division ADD VALUE IF NOT EXISTS 'JUCO' AFTER 'NAIA';
ALTER TYPE public.ncaa_division ADD VALUE IF NOT EXISTS 'JUCO_D1' AFTER 'JUCO';
ALTER TYPE public.ncaa_division
ADD VALUE IF NOT EXISTS 'JUCO_D2' AFTER 'JUCO_D1';
ALTER TYPE public.ncaa_division
ADD VALUE IF NOT EXISTS 'JUCO_D3' AFTER 'JUCO_D2';
ALTER TYPE public.ncaa_division ADD VALUE IF NOT EXISTS 'CCCAA' AFTER 'JUCO_D3';
