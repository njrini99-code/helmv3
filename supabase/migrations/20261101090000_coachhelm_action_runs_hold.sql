-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- HM1 (Ask lane, AK4; also quick chat QC4). Written 4 Nov 2026 in the wiring
--   pass from 02-PLAN §7 and §16,
-- which named this file but never wrote it. Name kept as planned
--   (20261101090000) because five lanes cite it.
--
-- What: the 8 second Undo hold on the CoachHelm action ledger.
-- 1. golf_coachhelm_action_runs.run_at timestamptz NULL: when a held run may
--   execute.
-- 2. status CHECK widened from (proposed, approved, denied, completed,
--   failed) to add 'held' and 'cancelled'
--      (20260725170000_coachhelm_action_runs_and_ui_parts.sql:61-62).
--   3. a held row must carry run_at.
-- 4. a partial index for the sweep (sweepHeld: overdue held rows for one
--   coach).
-- RLS: unchanged. The table's one policy coachhelm_action_runs_coach_only
--   (FOR ALL, coach_id = current_coach_id(),
-- 20260725170000:96-101) already scopes every read and the held -> cancelled
--   update to the owning coach. Grants
-- unchanged (SELECT, INSERT, UPDATE to authenticated; no DELETE; anon revoked
--   at 20260725170000:112-114).
-- Every row valid today stays valid. Additive and idempotent: a second apply
--   does nothing.
-- Code that reads it: src/lib/coachhelm/v3/chat/undo-hold.ts (new, AK4),
--   action-runs.ts ActionRunStatus (line 27).
-- Until applied: coachhelm_ask_v2 and coachhelm_quick_chat_v1 stay off; AK4's
--   boot check reads 42703 on run_at
-- and the four existing writes run at once through today's ActionCard
--   (S-ASK.kit.no-hold).
--
-- ROLLBACK: update public.golf_coachhelm_action_runs set status = 'failed',
--   error_message = 'Rolled back hold'
-- ROLLBACK:   where status in ('held', 'cancelled');
-- ROLLBACK: drop index if exists
--   public.golf_coachhelm_action_runs_held_due_idx;
-- ROLLBACK: alter table public.golf_coachhelm_action_runs drop constraint if
--   exists golf_coachhelm_action_runs_held_has_run_at;
-- ROLLBACK: alter table public.golf_coachhelm_action_runs drop constraint if
--   exists golf_coachhelm_action_runs_status_check;
-- ROLLBACK: alter table public.golf_coachhelm_action_runs add constraint
--   golf_coachhelm_action_runs_status_check
-- ROLLBACK:   check (status in ('proposed', 'approved', 'denied',
--   'completed', 'failed'));
-- ROLLBACK: alter table public.golf_coachhelm_action_runs drop column if
--   exists run_at;
--
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE
-- VERIFY: table_schema = 'public' AND table_name = 'golf_coachhelm_action_runs'
-- VERIFY: AND column_name = 'run_at' AND is_nullable = 'YES');
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE
-- VERIFY: conname = 'golf_coachhelm_action_runs_status_check' AND
-- VERIFY: pg_get_constraintdef(oid) LIKE '%held%' AND pg_get_constraintdef(oid)
-- VERIFY: LIKE '%cancelled%');
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE
-- VERIFY: conname = 'golf_coachhelm_action_runs_held_has_run_at');
-- VERIFY: SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE
-- VERIFY: schemaname = 'public' AND indexname =
-- VERIFY: 'golf_coachhelm_action_runs_held_due_idx');
-- VERIFY: SELECT 1 WHERE (SELECT count(*) FROM pg_catalog.pg_policies WHERE
-- VERIFY: schemaname = 'public' AND tablename = 'golf_coachhelm_action_runs') =
-- VERIFY: 1;
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('anon',
-- VERIFY: 'public.golf_coachhelm_action_runs', 'SELECT') AND NOT
-- VERIFY: has_table_privilege('authenticated',
-- VERIFY: 'public.golf_coachhelm_action_runs', 'DELETE');

-- squawk-ignore transaction-nesting
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.golf_coachhelm_action_runs
ADD COLUMN IF NOT EXISTS run_at timestamptz NULL;

COMMENT ON COLUMN public.golf_coachhelm_action_runs.run_at IS
'Undo hold (HM1): a held run executes at run_at (confirm time + 8s), unless cancelled first. NULL for every run that is not held.'; -- noqa: LT05

DO $hm1$
BEGIN
  -- Swap the status CHECK only while it still lacks 'held', so a second apply
  --   does nothing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_action_runs'::regclass
      AND conname = 'golf_coachhelm_action_runs_status_check'
      AND pg_get_constraintdef(oid) LIKE '%held%'
  ) THEN
    ALTER TABLE public.golf_coachhelm_action_runs
        DROP CONSTRAINT IF EXISTS golf_coachhelm_action_runs_status_check;
    ALTER TABLE public.golf_coachhelm_action_runs
        ADD CONSTRAINT golf_coachhelm_action_runs_status_check
      CHECK (status
          IN ('proposed', 'approved', 'denied', 'completed', 'failed', 'held',
              'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.golf_coachhelm_action_runs'::regclass
      AND conname = 'golf_coachhelm_action_runs_held_has_run_at'
  ) THEN
    ALTER TABLE public.golf_coachhelm_action_runs
        ADD CONSTRAINT golf_coachhelm_action_runs_held_has_run_at
      CHECK (status <> 'held' OR run_at IS NOT NULL);
  END IF;
END
$hm1$;

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS golf_coachhelm_action_runs_held_due_idx
ON public.golf_coachhelm_action_runs (coach_id, run_at)
WHERE status = 'held';

-- squawk-ignore transaction-nesting
COMMIT;
