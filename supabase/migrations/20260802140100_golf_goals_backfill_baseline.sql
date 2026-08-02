-- ============================================================================
-- Goals: recover the missing baselines.  Issue #1244.
--
-- `FairwayGoalCard` computes progress correctly — (current - baseline) /
-- (target - baseline), with an honest "Not started — baseline captured" state
-- — but bails to no-bar-at-all when baseline_value IS NULL. Every goal minted
-- by the engine-suggestion path shipped with a hardcoded `baseline_value:
-- null`, so 9 of 19 live goals (including the only ACTIVE one) could never
-- render progress.
--
-- The create path is fixed in src/app/golf/actions/v3/goals.ts — createGoal
-- now resolves the player's observed standing centrally, so no caller can mint
-- a baseline-less goal again. This migration recovers the rows already written.
--
-- Recovery source: snapshots[0].value. The progress evaluator appends a dated,
-- same-day-deduped {date, value} on every pass, so element 0 is the EARLIEST
-- observed reading for the goal — which is precisely the definition of its
-- baseline. Verified against live data: all 9 affected rows carry one.
--
-- Rows with no snapshot keep a NULL baseline and keep the honest empty state.
-- We never substitute the target, the current value, or zero.
-- ============================================================================

UPDATE public.golf_goals
SET baseline_value = (snapshots -> 0 ->> 'value')::numeric
WHERE baseline_value IS NULL
  AND jsonb_typeof(snapshots) = 'array'
  AND jsonb_array_length(snapshots) > 0
  AND (snapshots -> 0 ->> 'value') IS NOT NULL
  -- Guard against a malformed entry poisoning a numeric cast.
  AND (snapshots -> 0 ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$';

COMMENT ON COLUMN public.golf_goals.baseline_value IS
  'The measured value when the goal window opened. Set by createGoal from the player''s standing at creation (never by a caller-supplied null). Immutable afterwards: the progress evaluator writes current_value + appends snapshots only. NULL means no reading existed at creation — the card then shows "Not started — baseline captured" rather than a fabricated bar. See issue #1244.';
