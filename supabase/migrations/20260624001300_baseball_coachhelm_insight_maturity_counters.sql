-- ============================================================================
-- 20260624001300_baseball_coachhelm_insight_maturity_counters.sql
--
-- V10 — CoachHelm baseball engine: insight MATURITY / repeat-validation counters.
--
-- The shared lifecycle ladder (src/lib/coachhelm/shared/evidence-types.ts)
-- defines a `matured` state, the ranker (ranking.ts) PROMOTES a `matured` signal,
-- and the spec's PROMOTE list names "repeated trend (matured)". But nothing ever
-- WROTE the transition: every engine run reset lifecycle_state to detected/
-- tentative, so `matured` was unreachable and the promotion was dead. This
-- migration adds the small persisted counters the engine needs to recognize a
-- signal that has re-fired across runs and promote it to `matured` while it is
-- still active (orthogonal to coach_status — see below).
--
--   * observation_count  — how many engine runs have re-emitted this dedupe_key.
--                          Starts at 1 on first insert; incremented on every
--                          subsequent run that re-fires the SAME dedupe_key.
--   * first_detected_at   — when the signal was first emitted (stable across
--                           re-fires; the "how long has this persisted" clock).
--   * last_seen_at        — the most recent run that re-emitted it (freshness).
--
-- The engine promotes lifecycle_state -> 'matured' once observation_count >= 3
-- (a signal validated across ≥3 runs) OR first_detected_at is older than the
-- maturity window, while the row is still active and not already addressed/
-- resolved. lifecycle_state and the coach's own status remain ORTHOGONAL columns:
-- the engine owns lifecycle (detected/tentative/matured/resolved/archived from
-- DATA), the coach owns status (active/dismissed/etc. from JUDGMENT). The outcome
-- sweep separately moves lifecycle_state -> 'resolved' when a linked action's
-- target metric actually improves (distinct from a coach dismissing it).
--
-- SAFETY:
--   * Purely additive — ADD COLUMN IF NOT EXISTS only. No DROP, no destructive
--     DML, no rename. Re-runnable / idempotent.
--   * Shares the production DB with live GolfHelm. NOT applied by us; committed
--     as a .sql file only.
--   * No GRANTs issued. RLS on baseball_coach_insights (enabled by earlier
--     Wave-10 migrations) remains the access gate; AI writes go through
--     service_role, authenticated users only READ via policy.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.baseball_coach_insights') IS NOT NULL THEN
    -- Re-fire counter. Defaults to 1 so a freshly-inserted row already reflects
    -- its first observation; the engine increments it on every re-emit of the
    -- same (team_id, dedupe_key).
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS observation_count integer NOT NULL DEFAULT 1;

    -- The "how long has this persisted" clock — stable across re-fires. The
    -- engine sets it once on first insert and never overwrites it on a re-emit.
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS first_detected_at timestamptz;

    -- The most recent run that re-emitted this signal (freshness for the matured
    -- retraction window in the engine's stale-row reconciliation).
    ALTER TABLE public.baseball_coach_insights
      ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

    -- Backfill first_detected_at / last_seen_at for any pre-existing rows from the
    -- columns we already have, so the maturity clock is honest from day one
    -- (created_at is the earliest signal we can attribute as the first detection;
    -- last_generated_at, if present, is the most recent re-emit). Additive,
    -- idempotent (only fills NULLs), non-destructive.
    UPDATE public.baseball_coach_insights
      SET first_detected_at = COALESCE(first_detected_at, created_at)
      WHERE first_detected_at IS NULL;

    UPDATE public.baseball_coach_insights
      SET last_seen_at = COALESCE(last_seen_at, last_generated_at, created_at)
      WHERE last_seen_at IS NULL;

    -- Index the matured-promotion read: active engine rows for a team ordered by
    -- how long they have persisted (oldest first-detected = most-validated). Tiny
    -- because it only covers active rows.
    CREATE INDEX IF NOT EXISTS idx_baseball_coach_insights_team_persisted
      ON public.baseball_coach_insights (team_id, first_detected_at)
      WHERE status = 'active';
  END IF;
END $$;
