-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 11 Nov 2026 for the CoachHelm chat rebuild (a player's Ask turn and
--   the call for what to ask next each get their own key in the model-call
--   ledger). Not applied anywhere, not run against any database.
--
-- Apply: npm run db:apply --
--   supabase/migrations/20261111090000_coachhelm_llm_calls_chat_tasks.sql
--   after npm run test:rls passes (the pgTAP file is
--   supabase/tests/rls/coachhelm_llm_calls_chat_tasks.sql).
--
-- Risk: LOW. One CHECK constraint on public.golf_coachhelm_llm_calls is
--   replaced by a wider one: the four task values accepted today stay
--   accepted and two are added, so every existing row stays valid. No
--   column, policy, grant or index changes. The constraint is dropped and
--   added again in the one transaction db:apply gives the file; adding it
--   scans the table under its lock. The table is an append-only log of a
--   few thousand rows written after a response has been sent, so the scan is
--   milliseconds and nobody waits on a write to it; lock_timeout bounds the
--   wait for the lock at 3s. NOT VALID plus a separate VALIDATE would add a
--   statement and save nothing at this size (the precedent is
--   20260923100000, which widened the same constraint the same way).
--
-- What: task also accepts
--   'player_chat'       a player's own Ask turn (written as 'coach_chat'
--                       until now, told apart only by player_id);
--   'chat_suggestions'  the small call after a coach's answer that asks for
--                       two to four things to ask next (no row at all until
--                       now: its cost is only in the day's budget).
--
-- RLS: unchanged (llm_calls_coach_read: a coach reads their own rows; the
--   chat writes with the service role). Grants unchanged.
--
-- Code that writes them: src/lib/coachhelm/v3/chat/ledger.ts. The code runs
--   WITHOUT this migration: on 23514 it writes a player's turn as
--   'coach_chat', as before, and writes no row for a suggestions call, and
--   it remembers the refusal for the life of the process. So after applying,
--   a running instance keeps the old behaviour until it is replaced; no
--   deploy is needed and none is implied.
--
-- ORDER: after 20260923100000 (the last migration to replace this
--   constraint). Independent of every other held chat migration.
--
-- VERIFY: select 1 where exists (select 1 from pg_catalog.pg_constraint
-- VERIFY:   where conrelid = 'public.golf_coachhelm_llm_calls'::regclass
-- VERIFY:   and conname = 'golf_coachhelm_llm_calls_task_check'
-- VERIFY:   and convalidated
-- VERIFY:   and pg_get_constraintdef(oid) like '%player_chat%'
-- VERIFY:   and pg_get_constraintdef(oid) like '%chat_suggestions%'
-- VERIFY:   and pg_get_constraintdef(oid) like '%round_review_narrative%'
-- VERIFY:   and pg_get_constraintdef(oid) like '%coach_chat%');
-- VERIFY: select 1 where not exists (select 1 from
-- VERIFY:   public.golf_coachhelm_llm_calls where task not in
-- VERIFY:   ('round_review', 'hero_narrative', 'coach_chat',
-- VERIFY:   'round_review_narrative', 'player_chat', 'chat_suggestions'));
--
-- ROLLBACK (one transaction; supabase/rollbacks/
--   20261111090000_coachhelm_llm_calls_chat_tasks.rollback.sql):
-- ROLLBACK: update public.golf_coachhelm_llm_calls set task = 'coach_chat'
--   where task = 'player_chat';
-- ROLLBACK: delete from public.golf_coachhelm_llm_calls where task =
--   'chat_suggestions';
-- ROLLBACK: alter table public.golf_coachhelm_llm_calls drop constraint
--   golf_coachhelm_llm_calls_task_check; then add it again with the four
--   earlier values.
--   Cost of rolling back: a player's rows read as 'coach_chat' again (what
--   they were before), and the suggestions rows are deleted, which is what
--   the ledger held before this migration (nothing); their cost stays in
--   golf_coachhelm_llm_budget. The narrower constraint cannot be added while
--   a row carries either new value, which is why the two statements come
--   first.

-- No BEGIN or COMMIT in this file: db:apply runs the whole file and its ledger
-- row in one transaction, and a COMMIT here would close that transaction
-- before the ledger row is written.
SET lock_timeout = '3s';

ALTER TABLE public.golf_coachhelm_llm_calls
DROP CONSTRAINT IF EXISTS golf_coachhelm_llm_calls_task_check;

ALTER TABLE public.golf_coachhelm_llm_calls
-- An append-only log of a few thousand rows: the scan this takes is
-- milliseconds, and NOT VALID plus VALIDATE would be a second statement for
-- no gain (see Risk above, and 20260923100000).
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT golf_coachhelm_llm_calls_task_check
CHECK (task = any(ARRAY[
    'round_review'::text,
    'hero_narrative'::text,
    'coach_chat'::text,
    'round_review_narrative'::text,
    'player_chat'::text,
    'chat_suggestions'::text
]));
