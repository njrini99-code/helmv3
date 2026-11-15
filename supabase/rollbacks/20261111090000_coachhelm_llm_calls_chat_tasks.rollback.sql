-- ROLLBACK for 20261111090000_coachhelm_llm_calls_chat_tasks.sql.
--
-- Prior definition: golf_coachhelm_llm_calls_task_check accepted round_review, hero_narrative, coach_chat and
-- round_review_narrative (20260923100000; the declarative schema held the same four when the forward migration was
-- written on 2026-11-11). Before this file is used against production, confirm that against the live catalog
-- (pg_get_constraintdef of the constraint as it was before the forward migration, from a backup or the migration history)
-- and record the capture date here: the forward migration had not been applied anywhere when this was written, so there
-- was nothing live to capture.
--
-- Forward change: branch agent/coachhelm-chat-rebuild (the commit that adds the migration). Approval and deployment
-- record to update on apply: supabase/migrations/HELD.md, the row for this migration.
--
-- WHAT ROLLING BACK COSTS, AND IT DELETES ROWS: the narrower constraint cannot be added while any row carries one of the
-- two new values, so this file first re-keys every 'player_chat' row to 'coach_chat' (what a player's turn was written as
-- before the migration; player_id still tells them apart) and DELETES every 'chat_suggestions' row (before the migration
-- that call wrote no row at all; its cost stays in golf_coachhelm_llm_budget under its own key). Count them first and
-- keep the count with the deployment record:
--   select task, count(*), sum(cost_usd) from public.golf_coachhelm_llm_calls
--   where task in ('player_chat', 'chat_suggestions') group by task;
-- The chat keeps working afterwards (src/lib/coachhelm/v3/chat/ledger.ts falls back on the refused key by itself).
--
-- Sentry verification window after a rollback: one hour of chat traffic with no "player ask: llm ledger failed" warnings
-- (action coachhelm.ask.player).

BEGIN;
SET LOCAL lock_timeout = '3s';

UPDATE public.golf_coachhelm_llm_calls
SET task = 'coach_chat'
WHERE task = 'player_chat';

DELETE FROM public.golf_coachhelm_llm_calls
WHERE task = 'chat_suggestions';

ALTER TABLE public.golf_coachhelm_llm_calls
DROP CONSTRAINT IF EXISTS golf_coachhelm_llm_calls_task_check;

ALTER TABLE public.golf_coachhelm_llm_calls
ADD CONSTRAINT golf_coachhelm_llm_calls_task_check
CHECK (task = any(ARRAY[
    'round_review'::text,
    'hero_narrative'::text,
    'coach_chat'::text,
    'round_review_narrative'::text
]));

COMMIT;

-- Verification (expect one row):
-- select 1 where pg_get_constraintdef((select oid from pg_constraint where conname = 'golf_coachhelm_llm_calls_task_check'
--   and conrelid = 'public.golf_coachhelm_llm_calls'::regclass)) not like '%chat_suggestions%';
