-- APPROVED — db-migration-reviewer pass 2026-09-23. Repairs the gap
-- `20260905091000_baseball_timeline_event_acks_user_id_columns.sql`
-- describes WITHOUT applying that file — see supabase/migrations/HELD.md:
-- `20260905091000` stays HELD exactly as written (superseded by this file)
-- because it adds `user_id` with `REFERENCES auth.users (id)`, which this
-- migration deliberately avoids (see "WHY NOT A SECOND auth.users FK" below).
--
-- PRODUCTION IMPACT THIS CLOSES
-- ------------------------------
-- `src/app/baseball/actions/timeline-acks.ts` (`acknowledgeTimelineEvent`)
-- dual-writes BOTH column shapes on every acknowledgement: `team_id` /
-- `player_id` / `acked_by` / `acked_at` (production's real, pre-existing
-- shape) AND `user_id` / `acknowledged_at` (the shape a fresh local replay
-- produces and `src/lib/types/baseball-acknowledgements.ts` documents as
-- canonical), then reads back `.select('acknowledged_at')`. Confirmed live
-- 2026-09-23 (`information_schema.columns`): `public.baseball_timeline_event_acks`
-- has exactly `id, team_id, timeline_event_id, player_id, acked_by, acked_at,
-- reaction, note` — no `user_id`, no `acknowledged_at`. Every acknowledgement
-- write has therefore been raising `column
-- baseball_timeline_event_acks.user_id does not exist` (36 occurrences in the
-- 24h immediately preceding this review) instead of persisting. The table
-- has 0 rows in production (confirmed live 2026-09-23) — every acknowledge
-- attempt to date has failed outright, not merely lost half its payload.
--
-- The table's live RLS also has no DELETE policy at all: `withdrawTimeline-
-- Acknowledgement`'s `.delete().eq('timeline_event_id', ...).eq('user_id',
-- ...)` has been denied by RLS's default-deny for every caller, on top of
-- there never having been a row to delete. This migration adds that policy
-- too.
--
-- Because production has 0 rows, this migration is purely additive with no
-- backfill risk. The guard immediately below still RAISEs rather than
-- proceeding if that has changed since — SET NOT NULL on a table this
-- migration has not itself re-verified as empty is the one step here that
-- is not independently idempotent-safe.
--
-- WHY NOT A SECOND auth.users FK
-- --------------------------------
-- `20260905091000` (still HELD, content untouched) adds `user_id uuid
-- REFERENCES auth.users (id)`. `auth.users` is shared with Golf signups —
-- an `ADD COLUMN ... REFERENCES` against it takes a lock that queues behind
-- concurrent Golf auth traffic this reconciliation has no visibility into
-- the volume of, for a table (`baseball_timeline_event_acks`) that has zero
-- rows and therefore zero need for Postgres to re-validate anything against
-- it. `acked_by` already carries `REFERENCES auth.users(id) ON DELETE
-- CASCADE` (confirmed live via `pg_constraint`
-- 2026-09-23:
-- `baseball_timeline_event_acks_acked_by_fkey`), and the application always
-- writes `user_id = acked_by = ctx.user.id` on every insert (see
-- `timeline-acks.ts` and the new INSERT policy below, which requires both to
-- equal the caller). `user_id` gets referential integrity transitively
-- through `acked_by` without a second lock on `auth.users`.
--
-- POLICY NAMING — READ BEFORE EDITING
-- --------------------------------------
-- Two different naming conventions exist for this table's policies across
-- environments, confirmed by a live `pg_policies` read 2026-09-23:
--   PRODUCTION (live):  baseball_timeline_event_acks_select / _insert / _update
--     (no live DELETE policy — see above)
--   LOCAL REPLAY (this repo's own migrations): baseball_timeline_acks_select /
--     _insert / _update / _delete — created by
--     `20260624000430_baseball_timeline_event_acks.sql`, re-created
--     idempotently (same names) by
--     `20260825222432_reconcile_baseball_timeline_ack_contract.sql`. That
--     file's HELD.md row is corrected in this same change: it is LOCAL-ONLY
--     and never ran live — its policy names and its `user_id`/`acknowledged_at`
--     columns are exactly the two things this migration proves are absent
--     from production.
-- This migration converges on the PRODUCTION names
-- (`baseball_timeline_event_acks_*`) for the policies it touches, since that
-- is where the 36-errors/24h are happening. It drops both spellings
-- (`IF EXISTS`, so whichever one a given environment doesn't have is a
-- no-op) before creating each one under the production name. `..._select` is
-- deliberately NOT touched — its live predicate (`is_baseball_team_coach_v2(
-- team_id) OR acked_by = auth.uid()`) already covers "my own rows" for a
-- caller who always writes `user_id = acked_by`, so no second predicate or
-- rename is needed there; renaming it would be scope this migration does not
-- need to carry. `supabase/tests/rls/baseball_timeline_ack_contract.sql` is
-- updated in this same change to assert the production names for `_insert`
-- and the new `_delete`.
--
-- GUARANTEES
-- ----------
--   * SET LOCAL lock_timeout: refuses to queue indefinitely behind an
--     unrelated long transaction on this table.
--   * Additive only: ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS +
--     CREATE POLICY, a definition-guarded ADD CONSTRAINT. No DROP TABLE,
--     no DROP COLUMN, no destructive UPDATE/DELETE.
--   * Idempotent against a fresh local replay, where `user_id` /
--     `acknowledged_at` / the `(timeline_event_id, user_id)` unique key
--     already exist (NOT NULL, from `20260624000430`) before this file ever
--     runs: every ALTER/ADD CONSTRAINT below is a guarded no-op in that
--     case, and the policy DROP+CREATE converges the local names onto the
--     production ones either way.

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.baseball_timeline_event_acks LIMIT 1) THEN
    RAISE EXCEPTION 'baseball_timeline_event_acks is no longer empty (expected 0 rows at review time, 2026-09-23) — re-review the user_id backfill and NOT NULL step before applying this migration';
  END IF;
END
$$;

ALTER TABLE public.baseball_timeline_event_acks
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz DEFAULT now();

-- Both are safe to tighten to NOT NULL immediately: the guard above already
-- confirmed 0 rows, `acknowledged_at` already carries `DEFAULT now()`, and
-- every insert call site sets both explicitly (`timeline-acks.ts`) — this
-- also converges production onto the same NOT NULL shape
-- `src/lib/types/baseball-acknowledgements.ts` already documents as
-- canonical and a fresh local replay already carries (from `20260624000430`).
ALTER TABLE public.baseball_timeline_event_acks
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN acknowledged_at SET NOT NULL;

-- Guarded on the constraint's DEFINITION, not its name — a fresh local
-- replay already carries `UNIQUE (timeline_event_id, user_id)` under the
-- name `baseball_timeline_event_acks_event_user_key` (from
-- `20260624000430`), so this checks by shape to avoid adding a redundant
-- second unique index locally while still creating a clean, canonically
-- named one on production, which has neither.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.baseball_timeline_event_acks'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (timeline_event_id, user_id)'
  ) THEN
    ALTER TABLE public.baseball_timeline_event_acks
      ADD CONSTRAINT baseball_timeline_event_acks_timeline_event_id_user_id_key
      UNIQUE (timeline_event_id, user_id);
  END IF;
END
$$;

COMMENT ON COLUMN public.baseball_timeline_event_acks.user_id IS
'Canonical self-service actor key — always written equal to acked_by. No FK '
'to auth.users: acked_by already carries one, and a second FK on this shared '
'table is avoided deliberately (see this file''s header).';
COMMENT ON COLUMN public.baseball_timeline_event_acks.acknowledged_at IS
'Canonical timestamp key — always written equal to acked_at.';

DROP POLICY IF EXISTS baseball_timeline_acks_insert ON public.baseball_timeline_event_acks;
DROP POLICY IF EXISTS baseball_timeline_acks_update ON public.baseball_timeline_event_acks;
DROP POLICY IF EXISTS baseball_timeline_acks_delete ON public.baseball_timeline_event_acks;
DROP POLICY IF EXISTS baseball_timeline_event_acks_insert ON public.baseball_timeline_event_acks;
DROP POLICY IF EXISTS baseball_timeline_event_acks_update ON public.baseball_timeline_event_acks;
DROP POLICY IF EXISTS baseball_timeline_event_acks_delete ON public.baseball_timeline_event_acks;

-- INSERT: same live predicate (acked_by = caller) plus the new binding
-- (user_id = caller), so a row can never be written with the two actor
-- aliases pointing at different people.
CREATE POLICY baseball_timeline_event_acks_insert
  ON public.baseball_timeline_event_acks FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND acked_by = (select auth.uid())
  );

-- UPDATE: same shape, both as the row-visibility USING clause and the
-- post-update WITH CHECK.
CREATE POLICY baseball_timeline_event_acks_update
  ON public.baseball_timeline_event_acks FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid())
    AND acked_by = (select auth.uid())
  )
  WITH CHECK (
    user_id = (select auth.uid())
    AND acked_by = (select auth.uid())
  );

-- DELETE: did not exist live at all before this migration — withdrawing an
-- acknowledgement has been RLS-denied for every caller. Scoped to a caller's
-- own row under both actor aliases, matching withdrawTimelineAcknowledgement's
-- `.eq('timeline_event_id', ...).eq('user_id', ctx.user.id)` delete.
CREATE POLICY baseball_timeline_event_acks_delete
  ON public.baseball_timeline_event_acks FOR DELETE
  TO authenticated
  USING (
    acked_by = (select auth.uid())
    AND user_id = (select auth.uid())
  );

-- VERIFY: select 1 from information_schema.columns where table_schema = 'public' and table_name = 'baseball_timeline_event_acks' and column_name = 'user_id' and is_nullable = 'NO';
-- VERIFY: select 1 from information_schema.columns where table_schema = 'public' and table_name = 'baseball_timeline_event_acks' and column_name = 'acknowledged_at' and is_nullable = 'NO';
-- VERIFY: select 1 from pg_constraint where conrelid = 'public.baseball_timeline_event_acks'::regclass and contype = 'u' and pg_get_constraintdef(oid) = 'UNIQUE (timeline_event_id, user_id)';
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'baseball_timeline_event_acks' and policyname = 'baseball_timeline_event_acks_insert' and with_check ilike '%user_id%' and with_check ilike '%acked_by%';
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'baseball_timeline_event_acks' and policyname = 'baseball_timeline_event_acks_update';
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'baseball_timeline_event_acks' and policyname = 'baseball_timeline_event_acks_delete';
-- VERIFY: select 1 where not exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'baseball_timeline_event_acks' and p.polroles @> ARRAY['anon'::regrole]::oid[]);
--
-- ROLLBACK: ALTER TABLE public.baseball_timeline_event_acks ALTER COLUMN
-- ROLLBACK: user_id DROP NOT NULL, ALTER COLUMN acknowledged_at DROP NOT
-- ROLLBACK: NULL; then re-run the DROP POLICY / CREATE
-- ROLLBACK: POLICY statements above substituting the pre-migration live
-- ROLLBACK: predicates: INSERT WITH CHECK (acked_by = auth.uid()) only,
-- ROLLBACK: UPDATE USING/WITH CHECK (acked_by = auth.uid()) only, and DROP
-- ROLLBACK: POLICY baseball_timeline_event_acks_delete with nothing to
-- ROLLBACK: replace it (production had no DELETE policy before this file).
-- ROLLBACK: DROP COLUMN is deliberately NOT offered — the columns are
-- ROLLBACK: additive and dropping them reopens the exact production error
-- ROLLBACK: this migration exists to close.
