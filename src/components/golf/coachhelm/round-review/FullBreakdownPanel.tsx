'use client';

/**
 * ============================================================================
 * FullBreakdownPanel — everything the field sheet does not put on the page
 * ----------------------------------------------------------------------------
 * The v3 composition (round-review.v3.md) is a masthead, one stage, a three
 * column ledger and the hole table. The detail that used to sit inline below
 * it — this round's Strokes Gained rollup, the front/back split, the putting
 * bands, the driving strip, momentum, short game, and the full per-round stat
 * report — is real, computed data, so it moves behind the masthead's "Full
 * breakdown" action rather than being deleted or given a new inline card.
 *
 * Every child here already carries its own honest-empty guard; this panel
 * simply omits a section whose predicate says there is nothing to show.
 * ========================================================================== */

import { useMemo } from 'react';
import { Eyebrow } from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { RoundReviewContent } from '@/app/golf/actions/round-review-system';
import {
  ReviewBreakdown,
  hasFrontBackData,
  hasPuttingRampData,
  hasDrivingDotData,
  hasApproachHeatData,
} from './ReviewBreakdown';
import { RoundSGSummary } from './RoundSGSummary';
import {
  buildDrivingDotStripData,
  buildDrivingPenaltyLines,
  buildFrontBackDiverging,
  buildFrontBackRows,
  buildMomentumTicker,
  buildPuttingRamp,
  buildShortGameRows,
} from './buildReviewViewModel';

export interface FullBreakdownPanelProps {
  roundId: string;
  review: RoundReviewContent;
  /** `golf_holes` rows, used only to sum each nine's par. */
  holes: Array<{ hole_number: number; par: number | null }>;
  roundStats: GolfStats | null;
  strokesGainedTotal: number | null;
  strokesGainedTee: number | null;
  strokesGainedApproach: number | null;
  strokesGainedAroundGreen: number | null;
  strokesGainedPutting: number | null;
  /** True when this round has at least one computed Strokes Gained column. */
  hasAnySG: boolean;
  isWomens: boolean;
}

export function FullBreakdownPanel({
  roundId,
  review,
  holes,
  roundStats,
  strokesGainedTotal,
  strokesGainedTee,
  strokesGainedApproach,
  strokesGainedAroundGreen,
  strokesGainedPutting,
  hasAnySG,
  isWomens,
}: FullBreakdownPanelProps) {
  const frontBack = useMemo(() => buildFrontBackRows(review.frontBackSplit), [review.frontBackSplit]);
  const frontBackDiverging = useMemo(
    () => buildFrontBackDiverging(review.frontBackSplit, holes),
    [review.frontBackSplit, holes],
  );
  const puttingRamp = useMemo(() => buildPuttingRamp(review.puttingBreakdown), [review.puttingBreakdown]);
  const momentum = useMemo(() => buildMomentumTicker(review.momentumData), [review.momentumData]);
  const drivingPenaltyLines = useMemo(
    () => buildDrivingPenaltyLines(review.drivingAnalysis, review.penaltyAnalysis),
    [review.drivingAnalysis, review.penaltyAnalysis],
  );
  const shortGameRows = useMemo(() => buildShortGameRows(review.shortGameAnalysis), [review.shortGameAnalysis]);
  const drivingDots = useMemo(() => buildDrivingDotStripData(review.holeByHole), [review.holeByHole]);

  const showBreakdown =
    hasFrontBackData(frontBack) ||
    hasPuttingRampData(puttingRamp) ||
    hasDrivingDotData(drivingDots) ||
    hasApproachHeatData(roundStats) ||
    momentum.length > 0 ||
    drivingPenaltyLines.length > 0 ||
    shortGameRows.length > 0;

  if (!hasAnySG && !showBreakdown) {
    return (
      <p className="font-fw-sans text-body-sm text-text-tertiary">
        There is no shot-level detail for this round yet. Enter holes and shots to unlock the full breakdown.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {hasAnySG ? (
        <RoundSGSummary
          strokesGainedTotal={strokesGainedTotal}
          strokesGainedTee={strokesGainedTee}
          strokesGainedApproach={strokesGainedApproach}
          strokesGainedAroundGreen={strokesGainedAroundGreen}
          strokesGainedPutting={strokesGainedPutting}
          isWomens={isWomens}
        />
      ) : null}

      {showBreakdown ? (
        <section className="flex flex-col gap-3">
          <div>
            <Eyebrow as="h2">Round breakdown</Eyebrow>
            <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">
              The key scoring, putting, driving, and short-game details from this round.
            </p>
          </div>
          <ReviewBreakdown
            roundId={roundId}
            frontBack={frontBack}
            frontBackDiverging={frontBackDiverging}
            drivingDots={drivingDots}
            roundStats={roundStats}
            puttingRamp={puttingRamp}
            momentum={momentum}
            drivingPenaltyLines={drivingPenaltyLines}
            shortGameRows={shortGameRows}
          />
        </section>
      ) : null}
    </div>
  );
}
