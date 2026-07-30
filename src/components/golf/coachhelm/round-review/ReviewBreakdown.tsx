'use client';

/**
 * ============================================================================
 * ReviewBreakdown — the "Full breakdown" DrillPanel body (spec §3.4/§5.5)
 * ----------------------------------------------------------------------------
 * Front/back split, putting bands, momentum, driving/penalties, and
 * short-game — the old review's nine accordions' content, behind ONE door.
 * Pure presentational: every section is honest-empty (renders nothing) when
 * its source data has nothing to show, rather than an empty chart shell.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { Eyebrow, Skeleton } from '@/components/fairway';
import { RailBars, RampMatrix, TickerStrip } from '@/components/fairway/modules';
import { TABULAR_NUMS } from '@/components/fairway/charts/theme';
import { PuttHeatmap } from '@/components/golf/coachhelm/v3/PuttHeatmap';
import { useRoundPutts } from '@/components/golf/coachhelm/v3/PuttHeatmap/useRoundPutts';
import type {
  FrontBackRow,
  PuttingRamp,
} from './buildReviewViewModel';
import type { RailBarRow, TickerItem } from '@/components/fairway/modules';

export interface ReviewBreakdownProps {
  /** The reviewed round's id — feeds `useRoundPutts` for the PuttHeatmap
   *  panel beside "By distance". Everything else on this component stays
   *  pure-presentational; this is the one exception because per-putt start
   *  position/outcome isn't part of the already-aggregated `puttingRamp`. */
  roundId: string;
  frontBack: FrontBackRow[];
  puttingRamp: PuttingRamp;
  momentum: TickerItem[];
  drivingPenaltyLines: string[];
  shortGameRows: RailBarRow[];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-3 overflow-clip rounded-fw-md border border-border-subtle bg-surface p-4 shadow-soft transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-accent-200 hover:shadow-raise motion-reduce:hover:translate-y-0">
      <Eyebrow as="h3">{title}</Eyebrow>
      {children}
    </div>
  );
}

export function ReviewBreakdown({
  roundId,
  frontBack,
  puttingRamp,
  momentum,
  drivingPenaltyLines,
  shortGameRows,
}: ReviewBreakdownProps) {
  const { putts } = useRoundPutts(roundId);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {frontBack.length > 0 ? (
        <Section title="Front / back">
          <div className="grid grid-cols-1 gap-2">
            {frontBack.map((row) => (
              <div
                key={row.label}
                className="rounded-fw-md border border-border-subtle bg-surface-sunken px-3 py-3"
              >
                <span className="font-fw-sans text-body-sm font-semibold text-text-primary">{row.label}</span>
                <div className="mt-2 grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
                  <BreakdownMetric label="Score" value={`${row.score}`} />
                  <BreakdownMetric label="Putts" value={`${row.putts}`} />
                  <BreakdownMetric label="GIR" value={`${row.gir}`} />
                  <BreakdownMetric label="Fairways" value={`${row.fairways}`} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {puttingRamp.cols.length > 0 ? (
        <div className="min-w-0 space-y-3 overflow-clip rounded-fw-md border border-border-subtle bg-surface p-4 shadow-soft md:col-span-2">
          <Eyebrow as="h3">Putting</Eyebrow>
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
        </div>
      ) : null}

      {momentum.length > 0 ? (
        <Section title="Momentum">
          <TickerStrip items={momentum} />
        </Section>
      ) : null}

      {drivingPenaltyLines.length > 0 ? (
        <Section title="Driving & penalties">
          <ul className="space-y-1">
            {drivingPenaltyLines.map((line) => (
              <li key={line} className="font-fw-sans text-body-sm text-text-secondary">
                {line}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {shortGameRows.length > 0 ? (
        <Section title="Short game">
          <RailBars rows={shortGameRows} labelWidth={80} />
        </Section>
      ) : null}
    </div>
  );
}

function BreakdownMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-fw-sm bg-surface px-2.5 py-2">
      <p className="truncate font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">{label}</p>
      <p style={TABULAR_NUMS} className="mt-0.5 font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}
