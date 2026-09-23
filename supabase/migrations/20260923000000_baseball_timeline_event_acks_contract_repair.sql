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
-- reaction, note` — no `user_id`, no `acknowledged_at`.
--
-- CORRECTED 2026-09-23 (independent db-migration-reviewer pass) — the error
-- evidence is real but was mischaracterized in an earlier draft of this
-- header. Read live via the Supabase MCP `query_logs` against `edge_logs`
-- (24h window): exactly 40 requests to
-- `/rest/v1/baseball_timeline_event_acks` in the preceding 24h, EVERY one a
-- `GET` returning `400` with `proxy_status: PostgREST; error=42703`, and
-- ZERO `POST`/`PATCH`/`DELETE` requests to the table at all in that window.
-- The failing requests are `getMyTimelineAcknowledgements`'s
-- `.select('timeline_event_id').eq('user_id', ...)` READ path
-- (`src/app/baseball/actions/timeline-acks.ts`), not
-- `acknowledgeTimelineEvent`'s write/upsert — the write path was not
-- exercised at all in this window (consistent with the table's 0 rows). Had
-- a write been attempted against the current schema, it would fail
-- differently: PostgREST rejects an INSERT/UPSERT payload naming an unknown
-- column with `PGRST204` ("Could not find the '<column>' column"), not
-- `42703` (`42703` is a raw Postgres "column does not exist" error, which
-- only a query PostgREST itself constructs — like this `.eq('user_id', ...)`
-- filter — can surface). Both paths are broken by the same missing columns;
-- this migration closes both. The table has 0 rows in production (confirmed
-- live 2026-09-23) — every write attempt to date, whenever it last ran, has
-- failed outright, not merely lost half its payload.
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
-- is the environment carrying the 40-errors/24h read-path evidence above.
-- It drops both spellings
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
-- SECURITY — WHY THE INSERT/UPDATE WITH CHECK GAINS A THIRD CLAUSE
-- -------------------------------------------------------------------
-- An earlier draft of this migration tightened INSERT/UPDATE to require
-- `user_id = auth.uid() AND acked_by = auth.uid()` and stopped there,
-- reasoning that binding both actor columns to the caller was enough.
-- Independent review (db-migration-reviewer, 2026-09-23) simulated the
-- resulting policy and found that binding the ACTOR columns says nothing
-- about which EVENT or TEAM the row claims to belong to — `team_id` and
-- `player_id` on `baseball_timeline_event_acks` are plain columns the
-- caller supplies, unchecked against the `timeline_event_id` they claim to
-- ack. Concretely, with only the actor-binding WITH CHECK: (1) any
-- authenticated user — including one with no relationship to baseball at
-- all — could INSERT a row acking another team's `timeline_event_id` by
-- supplying that team's `team_id`/`player_id` alongside their own
-- `user_id`/`acked_by`; (2) that forged `team_id` would then make the ack
-- visible to the FORGED team's coach via the untouched `_select` policy
-- (`is_baseball_team_coach_v2(team_id)`); (3) a player could ack a
-- `staff_only` timeline row they are not entitled to even see, since
-- nothing checked the underlying event's `visibility`; (4) an UPDATE could
-- repoint an existing row's `timeline_event_id`/`team_id` to a different
-- team's event entirely, since the actor-only WITH CHECK re-validates only
-- the caller, not the row's new target. All four require the same missing
-- piece: proof that the specific (`timeline_event_id`, `team_id`,
-- `player_id`) triple on the row is one the caller could legitimately see,
-- via the SAME predicate `20260624000430`'s original design used (mirror
-- the timeline SELECT visibility rule) and this repo's own pgTAP suite
-- already asserts (`supabase/tests/rls/baseball_timeline_event_acks.sql`,
-- assertion 3 — that suite is updated in this change to point at this
-- migration's policy names). Fixed below by adding, to BOTH policies'
-- `WITH CHECK`:
--   AND EXISTS (
--     SELECT 1 FROM public.baseball_player_timeline_events e
--     WHERE e.id = baseball_timeline_event_acks.timeline_event_id
--       AND e.team_id = baseball_timeline_event_acks.team_id
--       AND e.player_id = baseball_timeline_event_acks.player_id
--       AND (
--         public.is_baseball_team_staff(e.team_id)
--         OR (e.visibility <> 'staff_only'
--             AND e.player_id = public.get_my_baseball_player_id())
--       )
--   )
-- `is_baseball_team_staff(uuid) RETURNS boolean` (not `..._coach_v2`, per
-- reviewer direction — staff is the broader, correct grant for "may ack a
-- team event", matching `baseball_timeline_delete`/`_insert` on
-- `baseball_player_timeline_events` itself, which already use
-- `is_baseball_team_staff`, not the coach-only helper) and
-- `get_my_baseball_player_id() RETURNS uuid` both confirmed live 2026-09-23
-- via `pg_proc`; `baseball_player_timeline_events.team_id`/`.player_id`/
-- `.visibility` (text, NOT NULL) confirmed live via
-- `information_schema.columns` the same day. This is intentionally an
-- INSERT/UPDATE-only fix — SELECT and DELETE were not part of the finding
-- and are unchanged.
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
-- Table verified empty by the guard immediately above, in the same
-- transaction — squawk's generic warning about a blocking table rewrite /
-- full-table validation scan on a NOT NULL add does not apply to a table
-- this migration itself just proved has 0 rows. (Confirmed the ignore
-- comment must sit directly above each ALTER COLUMN sub-clause, not above
-- the outer ALTER TABLE, by running squawk-cli@2.64.0 locally with CI's
-- exact flags against both placements.)
ALTER TABLE public.baseball_timeline_event_acks
  -- squawk-ignore adding-not-nullable-field
  ALTER COLUMN user_id SET NOT NULL,
  -- squawk-ignore adding-not-nullable-field
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

-- INSERT: the live predicate (acked_by = caller) plus the new binding
-- (user_id = caller), so a row can never be written with the two actor
-- aliases pointing at different people, PLUS the visibility gate (see
-- "SECURITY" above) so the caller cannot forge a team_id/player_id/
-- timeline_event_id triple they have no right to ack.
CREATE POLICY baseball_timeline_event_acks_insert
  ON public.baseball_timeline_event_acks FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND acked_by = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.baseball_player_timeline_events e
      WHERE e.id = baseball_timeline_event_acks.timeline_event_id
        AND e.team_id = baseball_timeline_event_acks.team_id
        AND e.player_id = baseball_timeline_event_acks.player_id
        AND (
          public.is_baseball_team_staff(e.team_id)
          OR (
            e.visibility <> 'staff_only'
            AND e.player_id = public.get_my_baseball_player_id()
          )
        )
    )
  );

-- UPDATE: same shape, both as the row-visibility USING clause and the
-- post-update WITH CHECK — the WITH CHECK visibility gate also stops an
-- UPDATE from repointing a row at a different team's event (see
-- "SECURITY" above).
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
    AND EXISTS (
      SELECT 1 FROM public.baseball_player_timeline_events e
      WHERE e.id = baseball_timeline_event_acks.timeline_event_id
        AND e.team_id = baseball_timeline_event_acks.team_id
        AND e.player_id = baseball_timeline_event_acks.player_id
        AND (
          public.is_baseball_team_staff(e.team_id)
          OR (
            e.visibility <> 'staff_only'
            AND e.player_id = public.get_my_baseball_player_id()
          )
        )
    )
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
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'baseball_timeline_event_acks' and policyname = 'baseball_timeline_event_acks_insert' and with_check ilike '%user_id%' and with_check ilike '%acked_by%' and with_check ilike '%is_baseball_team_staff%';
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'baseball_timeline_event_acks' and policyname = 'baseball_timeline_event_acks_update' and qual ilike '%user_id%' and qual ilike '%acked_by%' and with_check ilike '%user_id%' and with_check ilike '%acked_by%' and with_check ilike '%is_baseball_team_staff%';
-- VERIFY: select 1 from pg_policies where schemaname = 'public' and tablename = 'baseball_timeline_event_acks' and policyname = 'baseball_timeline_event_acks_delete' and qual ilike '%user_id%' and qual ilike '%acked_by%';
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
