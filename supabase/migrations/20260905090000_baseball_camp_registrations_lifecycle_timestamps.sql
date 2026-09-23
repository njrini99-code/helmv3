-- APPROVED — see supabase/migrations/HELD.md (row updated 2026-09-23,
-- db-migration-reviewer pass). No longer HELD: the open question the hold
-- existed for — does the camp-registration UI actually read/write these
-- column names today — is answered below with call-site evidence, and the
-- migration was widened past a bare ADD COLUMN to also backfill and default
-- the read/sort column so it satisfies today's live callers, not just a
-- future one.
--
-- `20260825224803_reconcile_baseball_active_read_contracts.sql`'s first block
-- claims production already carries `baseball_camp_registrations.registered_at`
-- and `.attended_at`. It does not: the Supabase audit's per-block live-column
-- check (2026-09-05, `list_tables` verbose, project qmnssrrolpinvwjjnufo)
-- confirms both columns are absent from the live catalog, even though that
-- file's own header says the client already selects and writes both. This is
-- the one genuinely open schema gap the audit found (its other five blocks
-- all verified as already-live, correctly local-only reconciliation).
-- Re-confirmed still absent from the live catalog 2026-09-23.
--
-- CALL-SITE EVIDENCE (the open question this file's hold existed for):
--   * `src/app/baseball/(dashboard)/dashboard/camps/[id]/CampDetailClient.tsx`
--     selects both columns and `.order('registered_at', { ascending: false })`
--     to render the roster (~lines 231-255) — an ORDER BY on a column that
--     does not exist live means this fetch is broken today, not merely
--     unused.
--   * `src/app/baseball/actions/camps.ts`'s `checkInCampPlayer` UPDATEs
--     `attended_at = new Date().toISOString()` on check-in (~lines 353-358)
--     — that write currently raises `42703` in production.
-- Both are live, shipped code paths, not dead branches — the gap is real and
-- applying this file is the fix, not a decision to defer further.
--
-- WHY registered_at ALSO GETS A BACKFILL + DEFAULT (beyond the original
-- bare ADD COLUMN): a nullable, unbackfilled `registered_at` would sort every
-- EXISTING registration to the bottom of `CampDetailClient`'s
-- `.order('registered_at', { ascending: false })` (Postgres sorts NULLs last
-- in a descending order) the moment this column starts existing, and every
-- NEW registration would insert it NULL forever since no INSERT call site
-- sets it explicitly. `created_at` is the only trustworthy historic proxy
-- for "when the player registered" — the table has no other lifecycle
-- timestamp, and a registration row's creation IS the registration event.
-- `attended_at` gets no backfill/default — it is correctly NULL until
-- `checkInCampPlayer` sets it, and no existing row can retroactively be
-- known to have attended. Ported from
-- `20260825224803_reconcile_baseball_active_read_contracts.sql:23-31`, the
-- LOCAL-ONLY file that already carries this exact backfill+default shape for
-- a from-scratch build — this migration converges production onto the same
-- contract instead of leaving it the one environment without one.
--
-- SET LOCAL lock_timeout: this table is small and low-traffic (camp
-- rosters), but the ALTER/UPDATE/ALTER sequence below should still queue
-- behind, then give up on, a concurrent long-held lock rather than stall the
-- apply indefinitely.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.baseball_camp_registrations
ADD COLUMN IF NOT EXISTS registered_at timestamptz,
ADD COLUMN IF NOT EXISTS attended_at timestamptz;

-- Backfill from the only safe historic source. Idempotent: only touches rows
-- the column-add just created as NULL, so re-running after a partial apply
-- (or against an environment that already backfilled) changes nothing.
UPDATE public.baseball_camp_registrations
SET registered_at = created_at
WHERE registered_at IS NULL;

-- Every future INSERT gets a registration timestamp even though no
-- application call site sets one explicitly.
ALTER TABLE public.baseball_camp_registrations
ALTER COLUMN registered_at SET DEFAULT now();

COMMENT ON COLUMN public.baseball_camp_registrations.registered_at IS
'When the player registered for the camp. Backfilled from created_at for '
'pre-existing rows; defaults to now() going forward.';
COMMENT ON COLUMN public.baseball_camp_registrations.attended_at IS
'When the player was marked as attended by the camp''s owning coach '
'(checkInCampPlayer). NULL until check-in; no default.';

-- VERIFY: select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'baseball_camp_registrations' and
-- VERIFY: column_name = 'registered_at' and data_type = 'timestamp with time
-- VERIFY: zone';
-- VERIFY: select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'baseball_camp_registrations' and
-- VERIFY: column_name = 'attended_at' and data_type = 'timestamp with time
-- VERIFY: zone';
-- VERIFY: select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'baseball_camp_registrations' and
-- VERIFY: column_name = 'registered_at' and column_default = 'now()';
-- VERIFY: select 1 where not exists (select 1 from
-- VERIFY: public.baseball_camp_registrations where registered_at is null);
--
-- ROLLBACK: ALTER TABLE public.baseball_camp_registrations ALTER COLUMN
-- ROLLBACK: registered_at DROP DEFAULT, DROP COLUMN registered_at, DROP
-- ROLLBACK: COLUMN attended_at; — destructive (drops the backfilled
-- ROLLBACK: registration history and any recorded attendance), so only
-- ROLLBACK: correct as an emergency reversal, not a routine undo. If the
-- ROLLBACK: columns turn out unwanted rather than broken, the safer path is
-- ROLLBACK: to leave them in place (nothing reads them destructively) and
-- ROLLBACK: revert the two call sites instead.
