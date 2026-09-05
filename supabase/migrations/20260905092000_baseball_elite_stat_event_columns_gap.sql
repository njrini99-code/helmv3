-- HELD — see supabase/migrations/HELD.md. Do NOT apply without reading that
-- entry first; this row is added there in the same change as this file.
--
-- Found by db-drift.yml's daily production-drift check (failing 5 runs
-- straight, 2026-08-31 -> 2026-09-04): the check requires
-- `baseball_pitch_events.batter_id`/`.pitch_type_classified`/`.is_called_strike`/
-- `.count_state` and `baseball_workload_events.count`/`.high_intent_count`,
-- naming them as columns real application code selects (CoachHelm telemetry,
-- the workload view). Confirmed live 2026-09-05 (`list_tables`, verbose):
-- none of those six columns exist on either table.
--
-- ROOT CAUSE, not just a missing column: `20260624000080_baseball_elite_stat_event_model.sql`
-- DOES have a ledger row (`list_migrations` confirms version `20260624000080`,
-- name `baseball_elite_stat_event_model` — it "ran" and committed), but it
-- used `CREATE TABLE IF NOT EXISTS baseball_pitch_events (...)` and `CREATE
-- TABLE IF NOT EXISTS baseball_workload_events (...)` defining the RICHER
-- elite-model shape. Both tables already existed in production under an
-- OLDER, incompatible shape at that point — live `baseball_pitch_events`
-- today carries `pitch_type`/`called_strike`/`pitcher_id` (no `batter_id`),
-- and live `baseball_workload_events` carries `pitch_count`/`throw_count`/
-- `max_velocity`/`avg_velocity`/`innings_pitched` (no `count`/
-- `high_intent_count`) — the pre-elite-model column names.
-- `CREATE TABLE IF NOT EXISTS` does not merge column sets: when the table
-- name already exists, the whole statement is a silent no-op. The migration
-- ledger recorded success because the statement itself did not error — it
-- simply did nothing to these two tables. Nothing else in that file's other
-- ~15 tables is known to have hit this same collision (not independently
-- re-verified here; this reconciliation checked only the two tables the
-- db-drift finding named).
--
-- THIS FILE IS DELIBERATELY NARROW AND ADDITIVE ONLY — it adds the four/two
-- missing columns as pure additions, matching the elite-model file's own
-- "ADDITIVE ONLY" safety contract, and does NOT touch, rename, or backfill
-- the pre-existing `pitch_type`/`called_strike`/`pitch_count`/`throw_count`
-- columns. It does not resolve whether those old and new columns are meant
-- to coexist permanently, be reconciled into one, or have the old ones
-- retired — that is a product/schema-design decision for whoever owns the
-- elite stat event model, not something to guess at in a reconciliation
-- pass. Held for that reason, not because the columns themselves are risky
-- to add.

ALTER TABLE public.baseball_pitch_events
  ADD COLUMN IF NOT EXISTS batter_id uuid,
  ADD COLUMN IF NOT EXISTS pitch_type_classified text,
  ADD COLUMN IF NOT EXISTS is_called_strike boolean,
  ADD COLUMN IF NOT EXISTS count_state text;

COMMENT ON COLUMN public.baseball_pitch_events.batter_id IS
'Elite stat event model column, never landed live (see this file''s header — '
'the CREATE TABLE IF NOT EXISTS in 20260624000080 no-op''d against this '
'pre-existing table). HELD — see supabase/migrations/HELD.md.';

ALTER TABLE public.baseball_workload_events
  ADD COLUMN IF NOT EXISTS count integer,
  ADD COLUMN IF NOT EXISTS high_intent_count integer;

COMMENT ON COLUMN public.baseball_workload_events.count IS
'Elite stat event model column, never landed live (see this file''s header — '
'the CREATE TABLE IF NOT EXISTS in 20260624000080 no-op''d against this '
'pre-existing table). HELD — see supabase/migrations/HELD.md.';
