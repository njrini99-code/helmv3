-- HELD — see supabase/migrations/HELD.md. Do NOT apply without reading that
-- entry first; this row is added there in the same change as this file.
--
-- `20260825224803_reconcile_baseball_active_read_contracts.sql`'s first block
-- claims production already carries `baseball_camp_registrations.registered_at`
-- and `.attended_at`. It does not: the Supabase audit's per-block live-column
-- check (2026-09-05, `list_tables` verbose, project qmnssrrolpinvwjjnufo)
-- confirms both columns are absent from the live catalog, even though that
-- file's own header says the client already selects and writes both. This is
-- the one genuinely open schema gap the audit found (its other five blocks
-- all verified as already-live, correctly local-only reconciliation).
--
-- Before applying: confirm whether `baseball_camp_registrations` UI/actions
-- are actually reading/writing these column names today — if so, either they
-- are failing silently against a nonexistent column (PostgREST/postgres would
-- raise `42703`, not fail silently, so more likely a fallback path or a dead
-- code branch is masking it) or a different column name is doing this job
-- live and this file is solving an already-solved problem. Grep
-- `registered_at\|attended_at` under `src/app/baseball` and `src/lib/baseball`
-- before applying, and re-check the live catalog immediately before, in case
-- something has changed since 2026-09-05.

ALTER TABLE public.baseball_camp_registrations
  ADD COLUMN IF NOT EXISTS registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS attended_at timestamptz;

COMMENT ON COLUMN public.baseball_camp_registrations.registered_at IS
'When the player registered for the camp. HELD — not yet applied to '
'production; see supabase/migrations/HELD.md.';
COMMENT ON COLUMN public.baseball_camp_registrations.attended_at IS
'When the player was marked as attended. HELD — not yet applied to '
'production; see supabase/migrations/HELD.md.';
