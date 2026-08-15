'use client';

/**
 * ============================================================================
 * BandHistogram — the distance-band distribution instrument
 * ----------------------------------------------------------------------------
 * Vertical columns, one per band. Column HEIGHT reads attempt volume (`n`)
 * when a band has a sample; a band that only carries a `pct` (no `n`) falls
 * back to a pct-scaled height so it still renders something honest. Column
 * FILL always reads `pct` on the accent ramp (RAMP_CLASSES-style — see
 * `modules/RampMatrix.tsx` for the convention this mirrors; this file keeps
 * its OWN local copy rather than importing across the modules/charts
 * boundary, matching this folder's self-containment rule, see theme.ts).
 *
 * A band with neither `n` nor `pct` (truly no data) renders as a hairline
 * "ghost" column — never a fabricated zero-height bar that reads as "0%".
 *
 * An optional dashed benchmark reference line floats OVER the (possibly
 * scrolling) column row so it stays legible regardless of horizontal scroll
 * position, with its caption pinned to the component's own right edge.
 *
 * Column HEIGHT is on a volume scale (`n`/`maxN`) in the typical case, so it
 * is NOT comparable to a pct-based benchmark — a high-n/low-pct band would
 * otherwise render taller than a low-n/high-pct band and read as "beating"
 * the benchmark when its actual rate doesn't. Each column therefore also
 * draws its own solid rate MARKER, positioned on the identical pct scale as
 * the dashed benchmark line (via `computePctTrackOffset`), so the honest
 * comparison is marker-vs-line, never bar-height-vs-line.
 * ========================================================================== */

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from './theme';

export interface BandHistogramBand {
  label: string;
  n: number | null;
  pct: number | null;
}

export interface BandHistogramProps {
  bands: BandHistogramBand[];
  /** Suffix shown after the `n=` sample-count caption, e.g. "attempts". */
  unit?: string;
  benchmarkPct?: number | null;
  benchmarkLabel?: string;
  ariaLabel: string;
}

/* ---------------------------------------------------------------------------
 * Pure helpers — exported for the colocated unit tests.
 * ------------------------------------------------------------------------- */

/** Local accent-ramp classes — mirrors RampMatrix's 0 (no data) .. 4 (strongest).
 *
 * Uses the shared `--fw-ramp-*` tokens so the scale reads correctly in both
 * themes (it runs light→dark on cream and dark→light on espresso). The old
 * hardcoded ramp opened on accent-100, which flips from L 0.939 to L 0.352 in
 * dark — so at night band 1 (weakest) rendered darker than bands 2-4 and the
 * scale inverted at its low end. */
const BAND_HISTOGRAM_RAMP_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-surface-sunken',
  1: 'bg-ramp-1',
  2: 'bg-ramp-2',
  3: 'bg-ramp-3',
  4: 'bg-ramp-4',
};

/** pct (0-100) → ramp band. `null`/NaN → 0 (no data — distinct from a real 0%). */
export function rampBandForPct(pct: number | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 0;
  if (pct >= 75) return 4;
  if (pct >= 50) return 3;
  if (pct >= 25) return 2;
  return 1;
}

/** The largest finite `n` across all bands (0 when none have a sample). */
export function computeMaxN(bands: ReadonlyArray<{ n: number | null }>): number {
  let max = 0;
  for (const b of bands) {
    if (b.n != null && Number.isFinite(b.n)) max = Math.max(max, b.n);
  }
  return max;
}

/** Neither n nor pct present — a true "no data yet" band, never a fake 0. */
export function isGhostBand(band: { n: number | null; pct: number | null }): boolean {
  return band.n == null && band.pct == null;
}

/**
 * 0..1 column height fraction. Prefers `n` (scaled against the widest sample
 * in this set) so bars read relative attempt VOLUME; falls back to `pct` (its
 * own natural 0-100 scale) only when a band has no `n`. A ghost band is 0.
 */
export function computeBarHeightFraction(
  band: { n: number | null; pct: number | null },
  maxN: number,
): number {
  if (band.n != null && Number.isFinite(band.n) && maxN > 0) {
    return Math.max(0, Math.min(1, band.n / maxN));
  }
  if (band.pct != null && Number.isFinite(band.pct)) {
    return Math.max(0, Math.min(1, band.pct / 100));
  }
  return 0;
}

/** Clamped 0-100 benchmark position, or null when there is no benchmark to draw. */
export function computeBenchmarkOffsetPct(benchmarkPct: number | null | undefined): number | null {
  if (benchmarkPct === null || benchmarkPct === undefined || !Number.isFinite(benchmarkPct)) {
    return null;
  }
  return Math.max(0, Math.min(100, benchmarkPct));
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

const TRACK_H = 160;
const PCT_LABEL_H = 20;
const COL_GAP = 4;
const ENTRANCE_MS = 340;

/**
 * Pixel offset, measured from the TOP of a `TRACK_H`-tall track, for an
 * already-clamped 0-100 pct value (100 -> 0, top; 0 -> TRACK_H, bottom).
 * The ONE place a pct maps to a track pixel position — shared by the
 * full-width benchmark line and every column's own rate marker so both
 * live on the identical scale, regardless of what that column's bar HEIGHT
 * happens to encode (volume, when `n` is present, per this chart's spec).
 */
export function computePctTrackOffset(pctOffset: number): number {
  return TRACK_H * (1 - pctOffset / 100);
}

/**
 * Top position for the full-width benchmark overlay, measured from the top
 * of the row wrapper (the overlay's containing block). Valid ONLY because
 * the row enforces an identical track-top on every column: `items-start`
 * alignment plus fixed-height slots for the pct label above the track and
 * the `n=` caption below it (both slots render even when empty — a column
 * with no pct or no n must not collapse and shift its track).
 */
export function computeBenchmarkTop(pctOffset: number): number {
  return PCT_LABEL_H + COL_GAP + computePctTrackOffset(pctOffset);
}

export function BandHistogram({ bands, unit, benchmarkPct, benchmarkLabel, ariaLabel }: BandHistogramProps) {
  const maxN = React.useMemo(() => computeMaxN(bands), [bands]);
  const benchmarkOffset = computeBenchmarkOffsetPct(benchmarkPct);

  if (bands.length === 0) {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        style={{ minHeight: TRACK_H + PCT_LABEL_H + 48 }}
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border-subtle bg-inset p-6 text-center"
      >
        <span className="font-fw-sans text-body-sm font-medium text-text-secondary">No distribution yet</span>
        <span className="font-fw-sans text-caption font-normal text-text-tertiary">
          Data appears here once there are attempts to bucket.
        </span>
      </div>
    );
  }

  const benchmarkTop = benchmarkOffset === null ? null : computeBenchmarkTop(benchmarkOffset);

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="w-full rounded-card border border-border-subtle bg-surface-sunken p-4 sm:p-5"
    >
      {/* The overlay's containing block starts exactly at the row's content
          top — NOT the padded card — so `computeBenchmarkTop`'s slot math maps
          1:1 onto every column's track regardless of the card's padding. */}
      <div className="relative">
        {benchmarkTop !== null ? (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed"
              style={{ top: benchmarkTop, borderColor: 'var(--fw-viz-benchmark)' }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-0 z-10 -translate-y-full font-fw-mono text-microbadge text-text-tertiary"
              style={{ top: benchmarkTop }}
            >
              {benchmarkLabel ?? `${Math.round(benchmarkOffset as number)}%`}
            </span>
          </>
        ) : null}

        <div className="overflow-x-auto">
          <div className="flex items-start gap-3" style={{ minWidth: bands.length * 60 }}>
            {bands.map((band, i) => (
              <Column key={`${band.label}-${i}`} band={band} maxN={maxN} unit={unit} benchmarkOffset={benchmarkOffset} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({
  band,
  maxN,
  unit,
  benchmarkOffset,
}: {
  band: BandHistogramBand;
  maxN: number;
  unit?: string;
  benchmarkOffset: number | null;
}) {
  const reduced = useReducedMotion() ?? false;
  const ghost = isGhostBand(band);
  const heightFrac = computeBarHeightFraction(band, maxN);
  const rampBand = rampBandForPct(band.pct);
  const ownPctOffset = computeBenchmarkOffsetPct(band.pct);
  // Only draw the per-column rate marker when there's an actual benchmark to
  // compare it against — no benchmark, no misleading-comparison risk, no chrome.
  const showRateMarker = benchmarkOffset !== null && ownPctOffset !== null;

  return (
    <div className="flex shrink-0 basis-14 flex-1 flex-col items-center gap-1">
      {/* Fixed-height slot even when there's no pct to show — a collapsed
          label would shift this column's track top off the benchmark scale. */}
      <span
        style={{ ...TABULAR_NUMS, height: PCT_LABEL_H }}
        className="flex items-center font-fw-mono text-caption font-semibold text-text-primary"
      >
        {band.pct != null ? `${Math.round(band.pct)}%` : ghost ? '—' : ''}
      </span>

      <div className="relative flex w-full flex-col justify-end" style={{ height: TRACK_H }}>
        {ghost ? (
          <div
            aria-hidden
            className="h-1.5 w-full rounded-t-fw-sm border border-dashed border-border-subtle"
          />
        ) : (
          <motion.div
            className={cn('w-full rounded-t-fw-sm', BAND_HISTOGRAM_RAMP_CLASSES[rampBand])}
            initial={reduced ? false : { height: 0 }}
            animate={{ height: `${heightFrac * 100}%` }}
            transition={reduced ? { duration: 0 } : { duration: ENTRANCE_MS / 1000 }}
          />
        )}
        {showRateMarker ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t-2 border-accent-700"
            style={{ top: computePctTrackOffset(ownPctOffset as number) }}
          />
        ) : null}
      </div>

      <span className="max-w-full truncate font-fw-sans text-caption text-text-secondary">
        {band.label}
      </span>
      {/* Slot always renders (empty when no n) so mixed n-presence never
          changes a column's height — see computeBenchmarkTop's contract. */}
      <span
        style={TABULAR_NUMS}
        className="h-3.5 font-fw-sans text-microbadge normal-case leading-none tracking-normal text-text-tertiary"
      >
        {band.n != null ? `n=${band.n}${unit ? ` ${unit}` : ''}` : ''}
      </span>
    </div>
  );
}
