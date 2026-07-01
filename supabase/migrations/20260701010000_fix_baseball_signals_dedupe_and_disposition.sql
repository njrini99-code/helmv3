-- Fix baseball_signals write-path: the entire operational Signal Inbox pipeline
-- has been a 100% silent no-op in prod (table is empty) for two independent
-- reasons, both verified live on 2026-07-01:
--
--   1. uq_baseball_signal_dedupe was `UNIQUE (team_id, dedupe_key) DEFERRABLE
--      INITIALLY DEFERRED`. The app upserts with
--      `.upsert(rows, { onConflict: 'team_id,dedupe_key' })`, which PostgREST
--      turns into `ON CONFLICT (team_id, dedupe_key)`. Postgres arbiter
--      inference for a bare column list only considers IMMEDIATE, non-partial
--      unique indexes — a DEFERRABLE constraint (indimmediate=false) is
--      ineligible, and the partial `baseball_signals_dedupe_open_uidx` is
--      ineligible too (partial, and the JS client can't pass its predicate).
--      With no eligible arbiter, EVERY upsert fails.
--
--   2. baseball_signals_disposition_check allowed only
--      ('open','acknowledged','resolved','dismissed','expired') — a stray 'open'
--      copied from baseball_class_conflicts, missing the values the app actually
--      writes ('new','sample_too_small','converted'). Even with a valid arbiter,
--      the insert would violate the CHECK.
--
-- Fix (additive/idempotent; table is empty in prod so no data-migration risk):
--   * Rebuild the dedupe uniqueness as an IMMEDIATE (non-deferrable) constraint
--     so ON CONFLICT (team_id, dedupe_key) can use it. NOTE: `ALTER TABLE ...
--     ALTER CONSTRAINT ... NOT DEFERRABLE` is FK-only in Postgres, so a UNIQUE
--     constraint must be dropped + re-added (default = NOT DEFERRABLE). With the
--     app upserting on the full (team_id, dedupe_key) key, a recurring finding
--     updates its existing row (re-opens it) rather than duplicating — which is
--     the intended dedupe behavior, so the global immediate unique is correct
--     and the partial index is redundant.
--   * Drop the redundant, client-unusable partial index.
--   * Widen the disposition CHECK to the 7 values in BaseballSignalDisposition
--     (src/lib/types/baseball-signals.ts), dropping the erroneous 'open'.

ALTER TABLE public.baseball_signals
  DROP CONSTRAINT IF EXISTS uq_baseball_signal_dedupe;
ALTER TABLE public.baseball_signals
  ADD CONSTRAINT uq_baseball_signal_dedupe UNIQUE (team_id, dedupe_key);

DROP INDEX IF EXISTS public.baseball_signals_dedupe_open_uidx;

ALTER TABLE public.baseball_signals
  DROP CONSTRAINT IF EXISTS baseball_signals_disposition_check;
ALTER TABLE public.baseball_signals
  ADD CONSTRAINT baseball_signals_disposition_check
  CHECK (disposition = ANY (ARRAY[
    'new','acknowledged','sample_too_small','converted','dismissed','resolved','expired'
  ]));
