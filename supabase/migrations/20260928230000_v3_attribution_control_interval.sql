-- CoachHelm deep audit row 35 (2026-09-28): outcome attribution had no
-- counterfactual. v3 (src/lib/coachhelm/v3/causality/attribute.ts,
-- method_version 'v3_did_prewindow') adds a matched pre-window control and a
-- 95% interval on the lift:
--
--   lift = sign * ((post - baseline) - (baseline - control))
--
-- where control is the metric's mean over the equal-length window just
-- before the baseline. These columns persist the control and the interval so
-- a reader can tell a lift from noise. lift_z (lift / SE) is the unitless
-- signal the coach-weight update consumes.
--
-- Purely additive: nullable, no default, no backfill. Rows written before
-- this migration keep NULL here (v1: method_version NULL; v2:
-- 'v2_observed_delta'). The cron degrades to inserting without these columns
-- while this migration is unapplied, so ordering against the deploy is free.
-- No RLS or grant changes.

ALTER TABLE "public"."golf_insight_outcome_attribution"
ADD COLUMN IF NOT EXISTS "control_value" double precision,
ADD COLUMN IF NOT EXISTS "n_rounds_control" bigint,
ADD COLUMN IF NOT EXISTS "lift_ci_low" double precision,
ADD COLUMN IF NOT EXISTS "lift_ci_high" double precision,
ADD COLUMN IF NOT EXISTS "lift_z" double precision;

ALTER TABLE "public"."golf_insight_outcome_attribution"
ADD CONSTRAINT "golf_insight_outcome_attribution_n_rounds_control_check"
CHECK (n_rounds_control IS NULL OR n_rounds_control >= 0) NOT VALID;
-- NOT VALID is enough: the column is new, so every existing row is NULL and
-- passes; new writes are checked. No separate VALIDATE step is needed.

-- ROLLBACK: `ALTER TABLE public.golf_insight_outcome_attribution DROP
-- ROLLBACK: CONSTRAINT golf_insight_outcome_attribution_n_rounds_control_check,
-- ROLLBACK: DROP COLUMN control_value, DROP COLUMN n_rounds_control, DROP
-- ROLLBACK: COLUMN lift_ci_low, DROP COLUMN lift_ci_high, DROP COLUMN lift_z;`
-- ROLLBACK: safe: all nullable, additive, and the writer degrades without them.
--
-- VERIFY: select count(*) = 5 from information_schema.columns where table_schema = 'public' and table_name = 'golf_insight_outcome_attribution' and column_name in ('control_value', 'n_rounds_control', 'lift_ci_low', 'lift_ci_high', 'lift_z'); -- noqa: LT05

COMMENT ON COLUMN "public"."golf_insight_outcome_attribution"."control_value"
IS 'v3_did_prewindow: metric mean over the control window (the PRE_WINDOW_DAYS
days immediately before the baseline window). NULL before v3.';
COMMENT ON COLUMN "public"."golf_insight_outcome_attribution"."lift_ci_low"
IS 'v3_did_prewindow: lower bound of the t-based 95% interval on lift.';
COMMENT ON COLUMN "public"."golf_insight_outcome_attribution"."lift_ci_high"
IS 'v3_did_prewindow: upper bound of the t-based 95% interval on lift.';
COMMENT ON COLUMN "public"."golf_insight_outcome_attribution"."lift_z"
IS 'v3_did_prewindow: lift divided by its standard error (unitless). The
coach-weight EMA consumes this, not the raw lift.';
