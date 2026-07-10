-- =============================================================================
-- 20260710031500_baseball_decision_log_kind_reconcile.sql
--
-- bb-performance-liftlab packet — Decision Room ledger writes (P0).
--
-- ROOT CAUSE: 20260624000310_baseball_decision_log.sql's
-- `CREATE TABLE IF NOT EXISTS public.baseball_decision_log` no-op'd in prod
-- because a table by that name already existed under an OLDER, unrelated
-- "decision log" schema (meeting_item_id/signal_id/rationale/decided_at/
-- participants/outcome_summary/tags/created_by — a general program/player/
-- staff/roster/travel/scheduling/administrative decision log, NOT the
-- Decision Room's agenda-ledger). Confirmed live via information_schema +
-- pg_constraint (read-only queries, 2026-07-10):
--
--   columns:  id, team_id, player_id, meeting_item_id, signal_id, action_id,
--             decision_kind, title, rationale, decided_by, decided_at,
--             participants, outcome_summary, source_refs, tags, created_by,
--             created_at, detail
--             -- NO subject_table / subject_id / source_signal_id (those only
--             -- ever existed in the 20260624000310 migration's intended
--             -- shape, never materialized against the pre-existing table).
--
--   decision_kind CHECK: baseball_decision_log_decision_kind_check ->
--     ANY (ARRAY['program','player','staff','roster','travel','scheduling',
--                'administrative'])
--     -- src/app/baseball/actions/decision-room.ts writes
--     -- 'discussed'/'resolved'/'converted_task'/'converted_note'/
--     -- 'converted_practice'/'raised'/'reopened'/'note' — NONE of which are
--     -- in the live allow-list, so every ledger insert throws a CHECK
--     -- violation even after the column-name fix (paired code change in the
--     -- same PR maps the 4 writers + convertSignalToPracticeBlock off the
--     -- nonexistent subject_table/subject_id/source_signal_id onto the real
--     -- meeting_item_id/signal_id columns above).
--
-- REPAIR ROUND (2026-07-10, same day): the first cut of this migration only
-- widened the CHECK constraint below and stopped there. That is sufficient
-- for prod's already-drifted table (which already carries meeting_item_id/
-- signal_id/decided_at/rationale/participants/outcome_summary/tags/
-- created_by from its pre-existing older schema) but NOT for a freshly
-- replayed chain: 20260624000310's `CREATE TABLE IF NOT EXISTS` only ever
-- declared id/team_id/decision_kind/title/detail/subject_table/subject_id/
-- source_signal_id/action_id/player_id/source_refs/decided_by/created_at —
-- it never declared meeting_item_id, signal_id, decided_at, rationale,
-- participants, outcome_summary, tags, or created_by. On a fresh CI shadow
-- DB (or any new environment where that CREATE TABLE runs for real instead
-- of no-op'ing), the code's `.insert({ meeting_item_id: ..., signal_id: ...
-- })` calls throw the identical 'column does not exist' error this whole
-- migration exists to fix — just against the migration-chain's schema
-- instead of prod's drifted one. Reconciling THE CHECK alone does not close
-- that gap. Fixed here by adding the same existence-guarded
-- `ADD COLUMN IF NOT EXISTS` treatment already used for the sibling drift in
-- 20260710020000_baseball_settings_audit_log_column_reconcile.sql: additive,
-- no-op against prod (columns already exist there), materializes the real
-- shape against a fresh replay (columns don't exist there yet).
--
-- FIX: (1) widen the CHECK constraint to the UNION of the legacy allow-list
-- (kept — no known writer today, but zero-risk to preserve) and the Decision
-- Room's allow-list, so both schemas' writers work against the one shared
-- table; (2) `ADD COLUMN IF NOT EXISTS` every column the paired code change
-- in src/app/baseball/actions/decision-room.ts depends on
-- (meeting_item_id/signal_id/decided_at/rationale/participants/
-- outcome_summary/tags/created_by), so the migration chain — not just
-- prod's drifted table — actually has the columns the app writes to.
-- Table is confirmed EMPTY (0 rows) in prod, so both the CHECK swap and the
-- new columns are backfill-free and carry no constraint-violation risk on
-- existing rows.
--
-- REPLAY-SAFE: `DROP CONSTRAINT IF EXISTS` + unconditional `ADD CONSTRAINT`
-- is idempotent under replay and applies cleanly to BOTH a freshly-replayed
-- CI shadow DB (where 20260624000310's CREATE TABLE ran for real, so the
-- constraint holds the narrow Decision-Room-only value list) and prod's
-- drifted table (narrow legacy-only value list) — either starting shape ends
-- at the same widened constraint. Every `ADD COLUMN IF NOT EXISTS` below is
-- likewise a no-op against prod's already-drifted table and additive
-- against a fresh replay — true bidirectional replay safety, matching the
-- settings_audit_log sibling. No backfill; no RLS change (RLS already
-- covers the whole row via `is_baseball_team_staff(team_id)` from
-- 20260624000310, independent of which columns exist). NOT applied to any
-- database by this agent — migration file only, for the lead to review and
-- apply.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Column-shape reconcile: materialize the columns the app's Decision Room
--    writers (src/app/baseball/actions/decision-room.ts) depend on but that
--    only exist on prod's pre-existing, differently-shaped table today.
--    FK columns mirror the same ON DELETE SET NULL treatment 20260624000310
--    used for source_signal_id/action_id/player_id (ledger entry survives
--    deletion of the thing it references). `decided_by` already exists from
--    20260624000310's CREATE TABLE (NOT NULL, no default there) — untouched.
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_decision_log
  ADD COLUMN IF NOT EXISTS meeting_item_id uuid
    REFERENCES public.baseball_meeting_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signal_id uuid
    REFERENCES public.baseball_signals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS rationale text,
  ADD COLUMN IF NOT EXISTS participants uuid[],
  ADD COLUMN IF NOT EXISTS outcome_summary text,
  ADD COLUMN IF NOT EXISTS tags text[],
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Covering indexes for the two new FK columns. `baseball_decision_log_
-- signal_id_idx` reuses the exact name 20260710004100_fk_covering_indexes_
-- batch1 already declared for this column (guarded there on column
-- existence, so it skipped signal_id in a fresh replay where 20260624000310
-- never created it — safe to `CREATE INDEX IF NOT EXISTS` under the same
-- name here now that the column is guaranteed to exist; a no-op on prod,
-- where batch1's index already exists). meeting_item_id has no prior
-- covering-index declaration anywhere in the chain, so it gets a new one.
CREATE INDEX IF NOT EXISTS baseball_decision_log_meeting_item_id_idx
  ON public.baseball_decision_log (meeting_item_id);
CREATE INDEX IF NOT EXISTS baseball_decision_log_signal_id_idx
  ON public.baseball_decision_log (signal_id);

-- -----------------------------------------------------------------------------
-- 2. decision_kind CHECK widening (unchanged from the first cut).
-- -----------------------------------------------------------------------------
ALTER TABLE public.baseball_decision_log
  DROP CONSTRAINT IF EXISTS baseball_decision_log_decision_kind_check;

ALTER TABLE public.baseball_decision_log
  ADD CONSTRAINT baseball_decision_log_decision_kind_check
  CHECK (decision_kind = ANY (ARRAY[
    -- Legacy allow-list (pre-existing prod schema; no known writer today —
    -- kept for backward compatibility, nothing here is removed).
    'program', 'player', 'staff', 'roster', 'travel', 'scheduling', 'administrative',
    -- Decision Room allow-list (src/app/baseball/actions/decision-room.ts +
    -- src/lib/baseball/read-models/decision-room/agenda-ledger.ts's
    -- VALID_LEDGER_KINDS, which this constraint must be a superset of).
    'discussed', 'resolved', 'converted_task', 'converted_note',
    'converted_practice', 'raised', 'reopened', 'note'
  ]::text[]));

-- =============================================================================
-- END — additive/widening only. NOT applied to any DB by this agent.
-- =============================================================================
