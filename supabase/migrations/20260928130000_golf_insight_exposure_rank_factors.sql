-- CoachHelm deep audit row 51 (2026-09-28): persist the factors behind every
-- exposure's rank_score. WRITTEN, NOT APPLIED; owner applies.
--
-- Why. golf_insight_exposure.rank_score is a product of six multipliers
-- (magnitude, confidence, coach weight, goal boost, coachability, sample
-- damping; see scoreInsightFactors in src/lib/coachhelm/v3/ranking/score.ts).
-- The audit could only re-derive it approximately: 12 of 380 stored scores
-- fell outside what the formula can produce, and whether a row ranked on
-- measured strokes or on the priority floor was not recorded anywhere.
--
-- Change. One nullable jsonb column. No default, no backfill, no index: old
-- rows stay NULL ("not recorded"), and the column is written only by the
-- server-side exposure writer (service role), so RLS and grants are unchanged.
--
-- ORDER. The app does NOT write this column yet. recordInsightExposure is
-- fire-and-forget and swallows errors, so shipping the write before this
-- column exists would silently drop every exposure row. Apply this first,
-- regenerate src/lib/types/database.ts, then wire `factors` from
-- rankEvidenceInsightsScored into buildExposureRows / recordInsightExposure.
--
-- ROLLBACK: ALTER TABLE public.golf_insight_exposure DROP COLUMN rank_factors;
-- VERIFY: select 1 from information_schema.columns
-- VERIFY:   where table_schema = 'public' and table_name =
-- VERIFY:     'golf_insight_exposure'
-- VERIFY:   and column_name = 'rank_factors' and data_type = 'jsonb';

ALTER TABLE public.golf_insight_exposure
ADD COLUMN IF NOT EXISTS rank_factors jsonb;

COMMENT ON COLUMN public.golf_insight_exposure.rank_factors IS
'Factors behind rank_score (scoreInsightFactors): magnitude, '
'magnitude_basis (strokes | priority_floor | exempt_zero), confidence, '
'coach_weight, goal_boost, coachability, sample_damping, urgent. '
'NULL = not recorded.';
