-- APPROVED — see supabase/migrations/HELD.md (row updated 2026-09-23,
-- db-migration-reviewer pass). No longer HELD.
--
-- Found by db-drift.yml's daily production-drift check (failing 5 runs
-- straight, 2026-08-31 -> 2026-09-04): the check requires
-- four `baseball_pitch_events` columns (`batter_id`, `pitch_type_classified`,
-- `is_called_strike`, `count_state`) and two `baseball_workload_events`
-- columns (`count`, `high_intent_count`),
-- naming them as columns real application code selects (CoachHelm telemetry,
-- the workload view). Confirmed live 2026-09-05 (`list_tables`, verbose):
-- none of those six columns exist on either table. Re-confirmed live via
-- `information_schema.columns` 2026-09-23.
--
-- ROOT CAUSE, not just a missing column:
-- `20260624000080_baseball_elite_stat_event_model.sql`
-- DOES have a ledger row (`list_migrations` confirms version `20260624000080`,
-- name `baseball_elite_stat_event_model` — it "ran" and committed), but it
-- used create-if-not-exists statements for both baseball_pitch_events and
-- baseball_workload_events, each defining the RICHER elite-model shape. Both
-- tables already existed in production under an
-- OLDER, incompatible shape at that point — live `baseball_pitch_events`
-- today carries `pitch_type`/`called_strike`/`pitcher_id` (no `batter_id`),
-- and live `baseball_workload_events` carries `pitch_count`/`throw_count`/
-- `max_velocity`/`avg_velocity`/`innings_pitched` (no `count`/
-- `high_intent_count`) — the pre-elite-model column names.
-- A create-if-not-exists statement does not merge column sets: when the table
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
-- pass.
--
-- CHANGE FROM THE ORIGINALLY HELD FILE: `batter_id` is now a proper FK —
-- `uuid REFERENCES public.baseball_players(id) ON DELETE SET NULL`, matching
-- every sibling player-identity column the elite-model migration itself
-- defines (`20260624000080_baseball_elite_stat_event_model.sql:189`:
-- `batter_id UUID REFERENCES baseball_players(id) ON DELETE SET NULL` on
-- this exact table) and the FK style `baseball_pitch_events.pitcher_id`
-- already carries live today. The originally held version added `batter_id`
-- as a bare `uuid` with no FK — leaving it referentially unenforced would
-- have been a second, permanent divergence from the elite-model contract on
-- top of the one this file exists to close. `count`/`high_intent_count`
-- (plain `integer`) and `pitch_type_classified`/`count_state` (plain `text`)
-- carry no FK in the elite-model source either, so those are unchanged.
--
-- SET LOCAL lock_timeout: both tables take live tracking-data writes
-- (pitch-by-pitch / workload logging can happen during a game), so the
-- ALTER should queue behind, then give up on, a concurrent long-held lock
-- rather than stall the apply indefinitely.

SET LOCAL lock_timeout = '5s';

-- VERIFY: select 1 from pg_attribute where attrelid=to_regclass('public.baseball_pitch_events') and attname='batter_id' and not attisdropped -- noqa: LT05
-- VERIFY: select 1 from pg_attribute where attrelid=to_regclass('public.baseball_pitch_events') and attname='pitch_type_classified' and not attisdropped -- noqa: LT05
-- VERIFY: select 1 from pg_attribute where attrelid=to_regclass('public.baseball_pitch_events') and attname='is_called_strike' and not attisdropped -- noqa: LT05
-- VERIFY: select 1 from pg_attribute where attrelid=to_regclass('public.baseball_pitch_events') and attname='count_state' and not attisdropped -- noqa: LT05
-- VERIFY: select 1 from pg_attribute where attrelid=to_regclass('public.baseball_workload_events') and attname='count' and not attisdropped -- noqa: LT05
-- VERIFY: select 1 from pg_attribute where attrelid=to_regclass('public.baseball_workload_events') and attname='high_intent_count' and not attisdropped -- noqa: LT05

ALTER TABLE public.baseball_pitch_events
ADD COLUMN IF NOT EXISTS batter_id uuid
REFERENCES public.baseball_players (id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS pitch_type_classified text,
ADD COLUMN IF NOT EXISTS is_called_strike boolean,
ADD COLUMN IF NOT EXISTS count_state text;

COMMENT ON COLUMN public.baseball_pitch_events.batter_id IS
'Elite stat event model column, never landed live (see this file''s header — '
'the create-if-not-exists in 20260624000080 no-op''d against this '
'pre-existing table). FK to baseball_players, matching the source '
'migration''s own definition of this column.';

ALTER TABLE public.baseball_workload_events
-- squawk-ignore prefer-bigint-over-int
ADD COLUMN IF NOT EXISTS count integer,
-- squawk-ignore prefer-bigint-over-int
ADD COLUMN IF NOT EXISTS high_intent_count integer;

COMMENT ON COLUMN public.baseball_workload_events.count IS
'Elite stat event model column, never landed live (see this file''s header — '
'the create-if-not-exists in 20260624000080 no-op''d against this '
'pre-existing table).';

-- VERIFY: select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'baseball_pitch_events' and column_name =
-- VERIFY: 'batter_id' and data_type = 'uuid';
-- VERIFY: select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'baseball_pitch_events' and column_name =
-- VERIFY: 'pitch_type_classified';
-- VERIFY: select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'baseball_pitch_events' and column_name =
-- VERIFY: 'is_called_strike' and data_type = 'boolean';
-- VERIFY: select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'baseball_pitch_events' and column_name =
-- VERIFY: 'count_state';
-- VERIFY: select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'baseball_workload_events' and column_name
-- VERIFY: = 'count' and data_type = 'integer';
-- VERIFY: select 1 from information_schema.columns where table_schema =
-- VERIFY: 'public' and table_name = 'baseball_workload_events' and column_name
-- VERIFY: = 'high_intent_count' and data_type = 'integer';
-- VERIFY: select 1 from pg_constraint con join pg_class rel on rel.oid =
-- VERIFY: con.conrelid where rel.relname = 'baseball_pitch_events' and
-- VERIFY: con.contype = 'f' and pg_get_constraintdef(con.oid) ilike
-- VERIFY: '%batter_id%baseball_players%on delete set null%';
--
-- ROLLBACK: ALTER TABLE public.baseball_pitch_events DROP COLUMN batter_id,
-- ROLLBACK: DROP COLUMN pitch_type_classified, DROP COLUMN is_called_strike,
-- ROLLBACK: DROP COLUMN count_state; ALTER TABLE
-- ROLLBACK: public.baseball_workload_events DROP COLUMN count, DROP COLUMN
-- ROLLBACK: high_intent_count; — safe: every column here is new, additive,
-- ROLLBACK: and (as of this migration's own guard reasoning above) not yet
-- ROLLBACK: read by any shipped call site, so dropping them cannot lose data
-- ROLLBACK: any application path depends on. Re-check
-- ROLLBACK: `grep -rn
-- ROLLBACK: "batter_id\|pitch_type_classified\|is_called_strike\|count_state"
-- ROLLBACK: src/app/baseball src/lib/baseball`
-- ROLLBACK: immediately before rolling back, in case a caller started
-- ROLLBACK: relying on these columns after this migration shipped.
