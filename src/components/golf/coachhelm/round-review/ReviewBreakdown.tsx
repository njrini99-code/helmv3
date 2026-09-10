'use client';

/**
 * ============================================================================
 * ReviewBreakdown — "Round breakdown" (round-review.v2.md R6, full rewrite)
 * ----------------------------------------------------------------------------
 * A flat, numbered ledger — `01`-padded mono index, `font-fw-display text-h3`
 * title, a plain-language blurb, then either the row's own instrument or its
 * honest-empty line — the SAME visual convention `RoundStatReport.tsx`'s own
 * `Section` already uses, recreated locally here (no shared file is touched)
 * so the family resemblance is free. This is a bare band (`border-t
 * border-b border-border-subtle`, no per-row rounded/border/shadow/hover),
 * replacing the previous identical-card-grid layout, including the Front/
 * Back block's 3-layer nested cards.
 *
 * Every row is honest-empty (renders nothing but its own empty line) when
 * its source data has nothing to show, and the whole component is left to
 * its caller (`FilmstripReview`'s `showBreakdown`) to omit entirely when
 * ALL SIX rows would be empty — never a "Round breakdown" heading over
 * nothing.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/fairway';
import {
  DivergingBars,
  DrivingDotStrip,
  RailBars,
  RampMatrix,
  TickerStrip,
  rampBandForValue,
} from '@/components/fairway/modules';
import { PuttHeatmap } from '@/components/golf/coachhelm/v3/PuttHeatmap';
import { useRoundPutts } from '@/components/golf/coachhelm/v3/PuttHeatmap/useRoundPutts';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { FrontBackRow, PuttingRamp } from './buildReviewViewModel';
import type {
  DivergingRow,
  DrivingDotHole,
  RailBarRow,
  RampCell,
  TickerItem,
} from '@/components/fairway/modules';

export interface ReviewBreakdownProps {
  /** The reviewed round's id — feeds `useRoundPutts` for the PuttHeatmap
   *  panel beside "By distance". Everything else on this component stays
   *  pure-presentational; this is the one exception because per-putt start
   *  position/outcome isn't part of the already-aggregated `puttingRamp`. */
  roundId: string;
  frontBack: FrontBackRow[];
  frontBackDiverging: DivergingRow[];
  drivingDots: DrivingDotHole[];
  /** Already-fetched per-round detailed stats — second, round-review-local
   *  consumer of the SAME `roundStats` `page.tsx` already fetches for
   *  `RoundStatsPanel`. `null` while unfetched/absent. */
  roundStats: GolfStats | null;
  puttingRamp: PuttingRamp;
  momentum: TickerItem[];
  drivingPenaltyLines: string[];
  shortGameRows: RailBarRow[];
}

/** True when at least one Front/Back row carries a real figure. Unlike
 *  `momentum`/`drivingPenaltyLines`/`shortGameRows` (honest-empty arrays
 *  that are `[]` when there's nothing to show), `buildFrontBackRows` always
 *  returns exactly two rows — a scorecard-only round with no hole data still
 *  gets a "Front 9" / "Back 9" row, just one whose every field is the
 *  zero/dash a `HalfStats` with no holes computes to. `frontBack.length > 0`
 *  was therefore never a real gate; this checks the VALUES instead. Used by
 *  the caller's whole-section gate, not by this row's own (which reads
 *  `frontBackDiverging` directly — see the render below). */
export function hasFrontBackData(rows: FrontBackRow[]): boolean {
  return rows.some((row) => row.score !== 0 || row.putts !== 0 || row.gir !== '0/0' || row.fairways !== '—');
}

/** Same reasoning as `hasFrontBackData`: `buildPuttingRamp`'s `cols` come
 *  from the fixed distance-bucket config, not from the round's own putts —
 *  `puttingRamp.cols.length > 0` is always true. A cell is real data only
 *  when its bucket had at least one attempt (`buildPuttingRamp` renders "—"
 *  for a zero-attempt bucket); if every cell is a dash, there is nothing to
 *  show. */
export function hasPuttingRampData(ramp: PuttingRamp): boolean {
  return ramp.cells.some((cell) => cell.value !== '—');
}

/** True when at least one hole carries a real fairway-hit/miss signal.
 *  `buildDrivingDotStripData` returns one dot per hole in `review.holeByHole`
 *  unconditionally (including a `fairwayHit: null` dot for every par-3), so
 *  `holes.length > 0` is never a real gate — a scorecard-only round with no
 *  hole rows at all still produces an empty array, and a round whose only
 *  holes are all par-3s produces an array of nothing but `null`s. Either way
 *  there is no real accuracy signal to plot. */
export function hasDrivingDotData(holes: DrivingDotHole[]): boolean {
  return holes.some((h) => h.fairwayHit !== null);
}

/** True when at least one of the six approach-heat fields (`roundStats`'s
 *  par-scoped GIR%/FW% and lie-scoped GIR%) is a real number. */
export function hasApproachHeatData(stats: GolfStats | null): boolean {
  if (!stats) return false;
  return [
    stats.girPctPar3,
    stats.girPctPar4,
    stats.girPctPar5,
    stats.fairwayPctPar4,
    stats.fairwayPctPar5,
    stats.girPctFromFairway,
    stats.girPctFromRough,
    stats.girPctFromSand,
  ].some((v) => typeof v === 'number' && Number.isFinite(v));
}

/** A percentage -> `RampCell`, banded with the SAME `rampBandForValue`
 *  helper `buildPuttingRamp` already uses (one banding rule, not a new
 *  one). `null` (no such stat, e.g. Par-3 fairway%) renders the existing
 *  dash convention rather than a fabricated 0%. */
function heatCell(value: number | null | undefined): RampCell {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { value: '—', band: 0 };
  return { value: `${Math.round(value)}%`, band: rampBandForValue(value, [25, 50, 75]) };
}

const DASH_CELL: RampCell = { value: '—', band: 0 };

/** "Front 9: 39 (+3) · 15 putts · 2/4 GIR · 1/4 fairways" — one mono caption
 *  line per half, pairing the DivergingBars row (score-to-par delta,
 *  already `formatToPar`-formatted) with the matching `FrontBackRow`'s
 *  putts/GIR/fairways. `null` when the matching half has no stats row
 *  (should not happen in practice, since both are derived from the same
 *  underlying split, but this stays honest rather than assuming it). */
function frontBackCaption(row: DivergingRow, stats: FrontBackRow[]): string | null {
  const match = stats.find((s) => s.label === row.label);
  if (!match) return null;
  return `${row.label}: ${match.score} (${row.display}) · ${match.putts} putts · ${match.gir} GIR · ${match.fairways} fairways`;
}

function Row({
  index,
  title,
  blurb,
  hasSignal,
  emptyLine,
  children,
}: {
  index: number;
  title: string;
  blurb: string;
  hasSignal: boolean;
  emptyLine: string;
  children: ReactNode;
}) {
  return (
    <section
      data-slot="review-breakdown-row"
      className="border-t border-border-subtle pt-5 first:border-t-0 first:pt-0"
    >
      <h3 className="flex items-baseline gap-2.5">
        <span aria-hidden="true" className="font-fw-mono text-caption tabular-nums text-text-tertiary">
          {String(index).padStart(2, '0')}
        </span>
        <span className="font-fw-display text-h3 font-medium text-text-primary">{title}</span>
      </h3>
      <p className="mt-1 font-fw-sans text-caption text-text-tertiary">{blurb}</p>
      {hasSignal ? <div className="mt-4">{children}</div> : (
        <p className="mt-3 font-fw-sans text-body-sm text-text-secondary">{emptyLine}</p>
      )}
    </section>
  );
}

export function ReviewBreakdown({
  roundId,
  frontBack,
  frontBackDiverging,
  drivingDots,
  roundStats,
  puttingRamp,
  momentum,
  drivingPenaltyLines,
  shortGameRows,
}: ReviewBreakdownProps) {
  const { putts } = useRoundPutts(roundId);

  const drivingSignal = hasDrivingDotData(drivingDots);
  const approachSignal = hasApproachHeatData(roundStats);
  const frontBackSignal = frontBackDiverging.length > 0;
  const puttingSignal = hasPuttingRampData(puttingRamp);
  const shortGameSignal = shortGameRows.length > 0;
  const momentumSignal = momentum.length > 0;

  const frontBackMax = Math.max(1, ...frontBackDiverging.map((r) => Math.abs(r.delta)));

  return (
    <div data-slot="review-breakdown" className="border-t border-b border-border-subtle">
      <Row
        index={1}
        title="Off the tee"
        blurb="Fairway hit or missed, hole by hole."
        hasSignal={drivingSignal}
        emptyLine="No fairway data for this round."
      >
        <DrivingDotStrip holes={drivingDots} />
        {drivingPenaltyLines.length > 0 ? (
          <div className="mt-3 space-y-0.5">
            {drivingPenaltyLines.map((line) => (
              <p key={line} className="font-fw-mono text-caption text-text-tertiary">
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </Row>

      <Row
        index={2}
        title="Approach"
        blurb="Greens and fairways hit, by par and by lie."
        hasSignal={approachSignal}
        emptyLine="No approach data for this round."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0 overflow-x-auto">
            <RampMatrix
              cols={['Par 3', 'Par 4', 'Par 5']}
              rows={[
                {
                  label: 'GIR%',
                  cells: [
                    heatCell(roundStats?.girPctPar3),
                    heatCell(roundStats?.girPctPar4),
                    heatCell(roundStats?.girPctPar5),
                  ],
                },
                {
                  label: 'FW%',
                  cells: [DASH_CELL, heatCell(roundStats?.fairwayPctPar4), heatCell(roundStats?.fairwayPctPar5)],
                },
              ]}
            />
          </div>
          <div className="min-w-0 overflow-x-auto">
            <RampMatrix
              cols={['Fairway', 'Rough', 'Sand']}
              rows={[
                {
                  label: 'GIR%',
                  cells: [
                    heatCell(roundStats?.girPctFromFairway),
                    heatCell(roundStats?.girPctFromRough),
                    heatCell(roundStats?.girPctFromSand),
                  ],
                },
              ]}
            />
          </div>
        </div>
      </Row>

      <Row
        index={3}
        title="Front / back"
        blurb="Score to par for each nine."
        hasSignal={frontBackSignal}
        emptyLine="No front/back split for this round."
      >
        <DivergingBars rows={frontBackDiverging} max={frontBackMax} />
        <div className="mt-2 space-y-0.5">
          {frontBackDiverging.map((row) => {
            const caption = frontBackCaption(row, frontBack);
            return caption ? (
              <p key={row.label} className="font-fw-mono text-caption text-text-tertiary">
                {caption}
              </p>
            ) : null;
          })}
        </div>
      </Row>

      <Row
        index={4}
        title="Short game"
        blurb="Scrambling and sand saves."
        hasSignal={shortGameSignal}
        emptyLine="No short-game attempts for this round."
      >
        <RailBars rows={shortGameRows} labelWidth={80} />
      </Row>

      <Row
        index={5}
        title="Putting"
        blurb="Make percentage by distance and by start position."
        hasSignal={puttingSignal}
        emptyLine="No putting data for this round."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <p className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">By distance</p>
            <div className="overflow-x-auto">
              <RampMatrix cols={puttingRamp.cols} rows={[{ label: 'Makes', cells: puttingRamp.cells }]} />
            </div>
          </div>
          <div className="min-w-0 border-t border-border-subtle pt-4 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0">
            {putts === null ? (
              <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
                <span className="sr-only">Loading putts…</span>
                <Skeleton className="mx-auto aspect-square w-full max-w-[230px] rounded-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ) : (
              <PuttHeatmap putts={putts} title="By start position" />
            )}
          </div>
        </div>
      </Row>

      <Row
        index={6}
        title="Momentum"
        blurb="Score to par building through the round."
        hasSignal={momentumSignal}
        emptyLine="No momentum data for this round."
      >
        <TickerStrip items={momentum} />
      </Row>
    </div>
  );
}
