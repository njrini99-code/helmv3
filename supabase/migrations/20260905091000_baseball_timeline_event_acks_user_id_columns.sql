-- HELD — see supabase/migrations/HELD.md. Do NOT apply without reading that
-- entry first; this row is added there in the same change as this file.
--
-- Found by db-drift.yml's daily production-drift check (failing 5 runs
-- straight, 2026-08-31 -> 2026-09-04):
-- `src/app/baseball/actions/timeline-acks.ts`
-- deliberately dual-writes BOTH column shapes on every acknowledgement —
-- `team_id`/`player_id`/`acked_by`/`acked_at` (production's real, pre-existing
-- shape, per `20260825222432_reconcile_baseball_timeline_ack_contract.sql`)
-- AND `user_id`/`acknowledged_at` (the shape a fresh local replay produces,
-- and the shape `src/lib/types/baseball-acknowledgements.ts` documents as
-- canonical) — then reads back `.select('acknowledged_at')`. Confirmed live
-- 2026-09-05 (`list_tables`, verbose): `public.baseball_timeline_event_acks`
-- has exactly `id, team_id, timeline_event_id, player_id, acked_by, acked_at,
-- reaction, note` — no `user_id`, no `acknowledged_at`. This is a real,
-- currently-live gap: the dual-write's second half writes columns that do
-- not exist, and PostgREST rejects an unknown column rather than ignoring it.
--
-- Held rather than applied because whether the second write half is actually
-- failing the whole upsert (versus PostgREST accepting a payload with extra
-- unknown keys in some configuration this reconciliation did not verify) was
-- not confirmed against production — only the schema gap itself was. Before
-- applying, confirm from Sentry/logs whether
-- `src/app/baseball/actions/timeline-acks.ts`'s acknowledgement writes are
-- actually erroring in production, or succeeding today for a reason this
-- reconciliation did not find (e.g. Supabase's PostgREST tolerating unknown
-- keys under this project's specific config).

-- VERIFY: select 1 from pg_attribute where attrelid=to_regclass('public.baseball_timeline_event_acks') and attname='user_id' and not attisdropped -- noqa: LT05
-- VERIFY: select 1 from pg_attribute where attrelid=to_regclass('public.baseball_timeline_event_acks') and attname='acknowledged_at' and not attisdropped -- noqa: LT05
-- VERIFY: select 1 from pg_indexes where indexname='baseball_timeline_event_acks_user_id_idx' -- noqa: LT05

-- FK on a small table; the validation scan is milliseconds.
ALTER TABLE public.baseball_timeline_event_acks
-- squawk-ignore adding-foreign-key-constraint
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id),
ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

-- user_id is a foreign key to auth.users; an unindexed FK column makes
-- every auth.users delete scan this table and trips the Supabase
-- performance advisor (unindexed_foreign_keys). Small table, plain
-- CREATE INDEX (not CONCURRENTLY, which cannot run inside the
-- transaction db push wraps each file in).
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS baseball_timeline_event_acks_user_id_idx
ON public.baseball_timeline_event_acks (user_id);

COMMENT ON COLUMN public.baseball_timeline_event_acks.user_id IS
'Duplicate of acked_by under the newer naming the read path/type file uses. '
'HELD — see supabase/migrations/HELD.md. Nullable here (unlike the type '
'file''s documented NOT NULL) because production already holds rows that '
'predate this column; a NOT NULL tightening needs a backfill first.';
COMMENT ON COLUMN public.baseball_timeline_event_acks.acknowledged_at IS
'Duplicate of acked_at under the newer naming the read path/type file uses. '
'HELD — see supabase/migrations/HELD.md.';
