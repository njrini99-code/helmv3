'use client';

/**
 * ============================================================================
 * PuttingBenchmarkSheet — DASH-12 Stats field sheet (putting)
 * ----------------------------------------------------------------------------
 * The player's make % per distance band beside the Tour and Division-1
 * averages, one row per band that has a standard. A bottom sheet on phones,
 * a right-hand panel from `md`.
 *
 * Data: the leak map's putting buckets (`getPlayerLeakMaps`, every countable
 * completed round; career evidence, so it lives on the career stage only)
 * graded by `buildPuttingBenchmarkRows`
 * (`src/lib/golf/benchmarks/putting.ts`). Every row prints its sample size;
 * the header prints the round count and the date window.
 * ========================================================================== */

import { useMemo, useState } from 'react';
import { Button, Sheet } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { formatDateOnly } from '@/lib/golf/date-only';
import {
  PUTTING_BENCHMARK_MIN_SAMPLE,
  buildPuttingBenchmarkRows,
  type PuttingBandVerdict,
  type PuttingBenchmarkRow,
  type PuttingTour,
} from '@/lib/golf/benchmarks/putting';
import type { LeakBucket } from '@/app/golf/actions/stats-leak-maps-types';

export interface PuttingBenchmarkSheetProps {
  buckets: readonly LeakBucket[];
  roundsIncluded: number;
  tour: PuttingTour;
  /** Oldest and newest completed-round dates (ISO date-only), when known. */
  window: { from: string; to: string } | null;
}

function verdictText(verdict: PuttingBandVerdict, tourLabel: string): string {
  switch (verdict) {
    case 'above_tour':
      return `At or above ${tourLabel}`;
    case 'between':
      return 'Above D1';
    case 'below_div1':
      return 'Below D1';
    case 'small_sample':
      return `Under ${PUTTING_BENCHMARK_MIN_SAMPLE} putts`;
    case 'no_putts':
      return 'No putts yet';
  }
}

const VERDICT_CLASS: Record<PuttingBandVerdict, string> = {
  above_tour: 'text-accent-ink',
  between: 'text-text-secondary',
  below_div1: 'text-fw-warning-text',
  small_sample: 'text-text-tertiary',
  no_putts: 'text-text-tertiary',
};

function pct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`;
}

function formatWindowDate(value: string): string {
  return formatDateOnly(value, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "12 completed rounds · Mar 3, 2025 to Sep 20, 2026" */
export function puttingBenchmarkWindowLabel(
  roundsIncluded: number,
  window: { from: string; to: string } | null,
): string {
  const rounds = `${roundsIncluded} completed round${roundsIncluded === 1 ? '' : 's'}`;
  if (!window) return rounds;
  const from = formatWindowDate(window.from);
  const to = formatWindowDate(window.to);
  return from === to ? `${rounds} · ${from}` : `${rounds} · ${from} to ${to}`;
}

function BenchmarkRow({ row, tourLabel }: { row: PuttingBenchmarkRow; tourLabel: string }) {
  return (
    <li
      className="grid min-h-11 grid-cols-[4.5rem_1fr_3.25rem_3.25rem] items-center gap-x-3 border-b border-border-subtle py-2 last:border-b-0"
      aria-label={
        `${row.label}: ${row.makePct === null ? 'no putts' : `${Math.round(row.makePct)}% on ${row.sampleN} putts`}, ` +
        `${tourLabel} ${Math.round(row.tour)}%, D1 ${Math.round(row.div1)}%. ${verdictText(row.verdict, tourLabel)}.`
      }
    >
      <span className="font-fw-sans text-body-sm font-medium text-text-primary">{row.label}</span>
      <span className="flex min-w-0 flex-col">
        <span className="font-fw-mono text-body tabular-nums text-text-primary">
          {pct(row.makePct)}
          <span className="ml-1.5 font-fw-sans text-caption text-text-tertiary">n={row.sampleN}</span>
        </span>
        <span className={cn('font-fw-sans text-caption', VERDICT_CLASS[row.verdict])}>{verdictText(row.verdict, tourLabel)}</span>
      </span>
      <span className="text-right font-fw-mono text-body-sm tabular-nums text-text-secondary">{pct(row.tour)}</span>
      <span className="text-right font-fw-mono text-body-sm tabular-nums text-text-secondary">{pct(row.div1)}</span>
    </li>
  );
}

export function PuttingBenchmarkSheet({ buckets, roundsIncluded, tour, window }: PuttingBenchmarkSheetProps) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => buildPuttingBenchmarkRows(buckets, tour), [buckets, tour]);
  const tourLabel = tour === 'lpga' ? 'LPGA' : 'Tour';

  return (
    <>
      <Button variant="secondary" size="md" className="self-start" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Compare with {tourLabel} and D1
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        side="right"
        mobileSide="bottom"
        title="Putting benchmarks"
        description={puttingBenchmarkWindowLabel(roundsIncluded, window)}
      >
        <Sheet.Body className="space-y-4">
          <p className="text-body-sm text-text-secondary">
            Make % by distance across every completed round. A band is graded once it has{' '}
            {PUTTING_BENCHMARK_MIN_SAMPLE} putts.
          </p>
          <div>
            <div
              className="grid grid-cols-[4.5rem_1fr_3.25rem_3.25rem] gap-x-3 border-b border-border-subtle pb-2 font-fw-sans text-microlabel font-medium uppercase text-text-tertiary"
              aria-hidden="true"
            >
              <span>Distance</span>
              <span>You</span>
              <span className="text-right">{tourLabel}</span>
              <span className="text-right">D1</span>
            </div>
            <ul>
              {rows.map((row) => (
                <BenchmarkRow key={row.band} row={row} tourLabel={tourLabel} />
              ))}
            </ul>
          </div>
          <p className="text-caption text-text-tertiary">
            {tour === 'lpga'
              ? 'LPGA averages: LPGA ShotLink, 2024 season. D1 averages are college reference estimates.'
              : 'Tour averages: PGA Tour ShotLink, 2024 season. D1 averages are estimates from Shot Scope scratch-golfer data.'}{' '}
            Putts inside 3 ft have no published standard, so they are not compared.
          </p>
        </Sheet.Body>
      </Sheet>
    </>
  );
}
