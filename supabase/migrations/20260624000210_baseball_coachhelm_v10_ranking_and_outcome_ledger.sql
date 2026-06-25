-- ============================================================================
-- 20260624000210_baseball_coachhelm_v10_ranking_and_outcome_ledger.sql
--
-- Wave 10 / V10 — CoachHelm baseball engine deepening: multi-factor ranking
-- score + the engine OUTCOME LEDGER (source → signal → action → did-it-move).
--
-- The V10 engine (src/lib/coachhelm/baseball/*) now ranks every candidate with a
-- multi-factor model and converts ranked signals into staff actions whose
-- effect is tracked over the next data window. Two small, ADDITIVE schema needs:
--
--   1. baseball_coach_insights.rank_score — the materialized multi-factor rank so
--      every surface (Command Center, Signals, Player Profile) orders signals
--      identically without re-running the ranker.
--
--   2. baseball_actions outcome-attribution columns — the V6 "track action
--      outcomes after next game/practice" loop. baseball_actions already has
--      `outcome` + `outcome_recorded_at`; we EXTEND it (never clone) with the
--      TARGET METRIC + its baseline value at conversion + the later observed
--      value + the improvement-signed movement, so the outcome ledger can answer
--      "did the metric the action targeted actually move the right way?".
--
-- SAFETY:
--   * Purely additive — ADD COLUMN IF NOT EXISTS only. No DROP, no destructive
--     DML, no rename. Re-runnable / idempotent.
--   * Shares the production DB with live GolfHelm. NOT applied by us; committed
--     as a .sql file only.
--   * No GRANTs issued. RLS on baseball_coach_insights / baseball_actions
--     (already enabled by earlier Wave-10 migrations) remains the access gate;
--     AI writes go through service_role, authenticated users only READ via policy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ranking score on baseball_coach_insights.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_coach_insights') IS NOT NULL THEN
    -- Multi-factor rank score (higher = more attention-worthy). Materialized by
    -- the engine write layer from src/lib/coachhelm/baseball/ranking.ts so every
    -- read surface orders identically. Nullable: legacy/manual rows rank by
    -- created_at until the engine touches them.
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS rank_score integer;

    -- When the rank was last computed (so a surface can detect a stale ordering).
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS ranked_at timestamptz;

    -- Index the common ordered read: active engine rows for a team, best-first.
    CREATE INDEX IF NOT EXISTS idx_baseball_coach_insights_team_rank
      ON public.baseball_coach_insights (team_id, rank_score DESC NULLS LAST);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Outcome-attribution columns on baseball_actions (EXTEND, do not clone).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.baseball_actions') IS NOT NULL THEN
    -- The canonical metric id the action was meant to move (e.g.
    -- 'two_strike_chase_pct'). Resolved from the originating signal's primary
    -- driver at conversion time.
    ALTER TABLE public.baseball_actions
      ADD COLUMN IF NOT EXISTS outcome_metric text;

    -- The metric's value AT THE MOMENT the action was created (the baseline the
    -- later window is compared against). NULL when the action had no measurable
    -- target metric.
    ALTER TABLE public.baseball_actions
      ADD COLUMN IF NOT EXISTS outcome_baseline_value numeric;

    -- The metric's later observed value (filled by the outcome sweep after the
    -- next data window). NULL until measured.
    ALTER TABLE public.baseball_actions
      ADD COLUMN IF NOT EXISTS outcome_observed_value numeric;

    -- Observations the observed value rests on (honesty: a 1-game window is thin
    -- and the ledger must say so rather than declare success).
    ALTER TABLE public.baseball_actions
      ADD COLUMN IF NOT EXISTS outcome_sample_n integer;

    -- The IMPROVEMENT-SIGNED movement: (observed - baseline) * improvement_sign
    -- from the metric registry. Positive = moved the right way, negative = wrong
    -- way, NULL = not yet measured or a neutral_threshold metric (sign 0). The
    -- write layer computes the sign from the registry — NEVER inferred from the
    -- raw delta — so the ledger can never "learn backward".
    ALTER TABLE public.baseball_actions
      ADD COLUMN IF NOT EXISTS outcome_movement numeric;

    -- Honest verdict tier mirroring the engine's effectiveness language so the
    -- ledger never overclaims: 'improved' | 'no_change' | 'regressed' |
    -- 'too_early' | 'insufficient_sample'. CHECK keeps the vocabulary fixed.
    ALTER TABLE public.baseball_actions
      ADD COLUMN IF NOT EXISTS outcome_verdict text;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'baseball_actions_outcome_verdict_check'
    ) THEN
      ALTER TABLE public.baseball_actions
        ADD CONSTRAINT baseball_actions_outcome_verdict_check
        CHECK (outcome_verdict IS NULL OR outcome_verdict IN (
          'improved','no_change','regressed','too_early','insufficient_sample'
        ));
    END IF;

    -- Partial index for the OUTCOME SWEEP's hot path (the nightly Inngest cron +
    -- postgame finalize): "open metric-targeted actions not yet measured", scoped
    -- by team. Tiny because it only indexes the sweep-eligible slice, and it lets
    -- the cron discover teams-with-open-actions without a full table scan.
    CREATE INDEX IF NOT EXISTS idx_baseball_actions_outcome_sweep
      ON public.baseball_actions (team_id)
      WHERE outcome_metric IS NOT NULL
        AND outcome_observed_value IS NULL
        AND status IN ('open','in_progress','completed');
  END IF;
END $$;
