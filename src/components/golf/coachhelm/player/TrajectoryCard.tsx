'use client';

/**
 * ============================================================================
 * TrajectoryCard — the 90-day scoring-average forecast, finally reaches a
 * coach (#1485)
 * ----------------------------------------------------------------------------
 * `TrajectoryForecaster` (v2/prediction/trajectory-forecaster.ts) has built a
 * 90-day ensemble projection with confidence bands since it shipped, but no
 * UI path ever read `TrajectoryForecast.projections` — traced 2026-08-17. This
 * is the first consumer, on the coach's per-player deep-dive
 * (Scouting Report tab, `FairwayPlayerInsight`).
 *
 * FRAMING, on purpose: this is a STATISTICAL PROJECTION, not advice. It makes
 * no causal claim ("do X and you'll shoot Y"), so it carries no research
 * citation the way an InsightCard's causal insight must — but CoachHelm's
 * honesty rules still require the SAMPLE BASIS (how many rounds, what window)
 * to be visible wherever a number like this renders, so that line is always
 * shown, never buried in a tooltip.
 *
 * HONESTY, and a distinction that matters: `trajectory` is
 *   - a real summary — the normal case, rendered below.
 *   - `null` — `TrajectoryForecaster.forecastTrajectory()` itself ran and
 *     found insufficient round history (its own `rounds.length < 10` gate).
 *     Renders `InsufficientData` framed as exactly that.
 *   - `undefined` — the fetch didn't produce a real answer at all (auth
 *     rejected, rate-limited, CoachHelm disabled for this player, or an
 *     unexpected error). This must NOT render the same "not enough rounds"
 *     copy — that would be a false claim to a coach whose player has plenty
 *     of round history and just hit a rate limit. Renders a neutral
 *     "unavailable" message instead.
 * `Ribbon` adds its own second honesty floor (`minPoints`) for the rendered
 * series itself.
 *
 * Built on Fairway primitives only: `Ribbon` (which owns its own
 * `InstrumentPanel` bezel — do not double-wrap it in another one) for the
 * projected-average trend, `InsufficientData` for both honest empty states.
 * Its own entrance motion is gated through `useReducedMotionGuard`, never the
 * raw framer-motion hook (design-system.md).
 * ========================================================================== */

import { motion } from 'framer-motion';
import { Ribbon, type RibbonPoint } from '@/components/fairway/charts/Ribbon';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { InsufficientData } from '@/components/fairway/feedback/InsufficientData';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import type { PlayerTrajectorySummary } from '@/lib/coachhelm/v2/types';

export interface TrajectoryCardProps {
  /**
   * See the file docblock — `null` (insufficient history) and `undefined`
   * (couldn't compute) render DIFFERENT honest messages, never the same one.
   */
  trajectory: PlayerTrajectorySummary | null | undefined;
  className?: string;
}

/** Mirrors `TrajectoryForecaster.forecastTrajectory()`'s own `rounds.length < 10` gate. */
const MIN_ROUNDS_FOR_TRAJECTORY = 10;

/** Score-to-par, signed, one decimal — "E" at exactly even par. */
function formatScoreToPar(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return 'E';
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}

export function TrajectoryCard({ trajectory, className }: TrajectoryCardProps) {
  const prefersReducedMotion = useReducedMotionGuard();

  // `undefined` — the fetch failed for a reason OTHER than insufficient
  // history (auth/rate-limit/disabled/unexpected). Neutral message: saying
  // "not enough rounds" here would be false for a player with plenty.
  if (trajectory === undefined) {
    return (
      <InstrumentPanel
        depth="base"
        className={className}
        eyebrow="Looking ahead"
        header="Trajectory"
      >
        <InsufficientData
          title="Trajectory unavailable right now"
          description="Couldn't load a projection for this player. Try refreshing the page."
          icon={null}
        />
      </InstrumentPanel>
    );
  }

  // `null` — the forecaster itself ran and found too little round history.
  if (!trajectory || trajectory.projections.length === 0) {
    return (
      <InstrumentPanel
        depth="base"
        className={className}
        eyebrow="Looking ahead"
        header="Trajectory"
      >
        <InsufficientData
          title="Not enough rounds for a trajectory yet"
          description="This is a statistical projection, not advice — it needs a real trend to project from."
          unit="rounds"
          current={
            typeof trajectory?.roundsAnalyzed === 'number' ? trajectory.roundsAnalyzed : undefined
          }
          required={MIN_ROUNDS_FOR_TRAJECTORY}
        />
      </InstrumentPanel>
    );
  }

  const points: RibbonPoint[] = trajectory.projections.map((p) => ({ x: p.date, y: p.value }));
  const horizonPoint = trajectory.projections[trajectory.projections.length - 1];

  return (
    <motion.div
      className={className}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.28 }}
    >
      <p className="mb-2 font-fw-sans text-caption text-text-tertiary">
        Statistical projection, not advice — based on the last{' '}
        <span className="font-medium text-text-secondary">{trajectory.roundsAnalyzed}</span>{' '}
        rounds, {trajectory.horizonDays}-day window.
      </p>
      <Ribbon
        title="Trajectory"
        overline={`${trajectory.horizonDays}-day projection`}
        data={points}
        valueFormatter={formatScoreToPar}
        seriesName="Projected scoring average"
        goodDirection="down"
        readoutLabels={() => ({
          value: 'Projected',
          delta: `over ${trajectory.horizonDays}d`,
        })}
      />
      {horizonPoint ? (
        <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
          Day {trajectory.horizonDays} confidence band:{' '}
          <span className="font-fw-mono tabular-nums text-text-secondary">
            {formatScoreToPar(horizonPoint.rangeLow)} to {formatScoreToPar(horizonPoint.rangeHigh)}
          </span>{' '}
          ({Math.round(trajectory.modelConfidence * 100)}% model confidence)
        </p>
      ) : null}
    </motion.div>
  );
}

export default TrajectoryCard;
