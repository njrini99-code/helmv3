'use client';

/**
 * ============================================================================
 * StatTile — the dense chart-overview micro-KPI (§5.4 / cohesion: StatTile≠MetricCard)
 * ----------------------------------------------------------------------------
 * The denser sibling of MetricCard, built to sit in a ChartCard header row or an
 * overview strip: a Number Flow value + a tiny Sparkline + a TrendChip on an
 * `Inset` (sunken well, lighter chrome than MetricCard's full Surface card).
 *
 * THE CRITICAL HONESTY CONTRACT — the reason StatTile ships separately from
 * MetricCard: when the figure is STARVED (e.g. effectiveness with outcomes=0,
 * or fewer than the required resolved samples), it renders InsufficientData in
 * COMPACT mode INSTEAD OF an authoritative-looking 0% / 0.0. MetricCard cannot
 * do this swap — StatTile owns it. It NEVER paints a fabricated zero as a real
 * metric (DESIGN-SYSTEM §0 #8, §5.4 data reality).
 *
 * Both StatTile and MetricCard back onto the SAME Sparkline + the SAME shared
 * trend classifier (classifyTrend, hosted in TrendChip) — one trend math, two
 * chrome levels.
 * ========================================================================== */

import * as React from 'react';
import { type Format } from '@number-flow/react';
import { cn } from '@/lib/utils';
import { Numeric } from './Numeric';
import { Sparkline } from './Sparkline';
import {
  TrendChip,
  classifyTrend,
  type GoodDirection,
  type TrendDirection,
} from './TrendChip';
import { InsufficientData } from '../feedback/InsufficientData';

export interface StatTileProps {
  /** Uppercase overline label (e.g. "PREDICTION ACCURACY"). */
  label: string;
  /** The figure to display (animated via Number Flow). Required unless starved. */
  value?: number;
  /** Intl.NumberFormat options for the value (e.g. `{ style: 'percent' }`). */
  format?: Format;
  prefix?: string;
  suffix?: string;
  /** Use the mono ledger face for the value. Default false (tabular sans). */
  mono?: boolean;
  /**
   * Value-face tone, forwarded to `Numeric`. `'accent'` (default) paints the
   * figure in brand green; `'neutral'` renders heavy graphite ink
   * (text-primary/warm-900) instead — used by admin console KPI tiles, which
   * reserve green for delta/context chips only (see KpiTile). Additive: the
   * default is unchanged, so every existing golf/baseball caller is
   * unaffected.
   */
  tone?: 'accent' | 'neutral';

  /** Optional micro-trend series (oldest → newest). Drives the Sparkline. */
  trendData?: ReadonlyArray<number>;
  /**
   * Which direction of the value is GOOD. Golf KPIs are often lower-is-better
   * (scoring, putts) → `'down'`. Defaults to `'up'`. Feeds BOTH the Sparkline
   * color and the TrendChip verdict via the ONE shared classifier.
   */
  goodDirection?: GoodDirection;
  /** Deadzone for the flat band (value units). */
  flatThreshold?: number;
  /**
   * Explicit signed delta for the TrendChip (e.g. period-over-period change). If
   * omitted, the delta is derived from `trendData` (last − first).
   */
  delta?: number;
  /** Hide the TrendChip even when a trend is computable. */
  hideTrend?: boolean;

  /**
   * THE honesty switch. When true, the tile renders InsufficientData(compact)
   * instead of the value — use it the moment the figure would be a fabricated
   * zero (outcomes=0, too few resolved samples, etc.).
   */
  starved?: boolean;
  /** How many samples exist so far (shown in the InsufficientData meter). */
  current?: number;
  /** How many samples are required before the figure is trustworthy. */
  required?: number;
  /** What's being counted, e.g. "resolved predictions". */
  unit?: string;
  /** Override the starved-state title. */
  starvedTitle?: React.ReactNode;
  /** Override the starved-state description. */
  starvedDescription?: React.ReactNode;

  className?: string;
}

/**
 * Dense overview micro-KPI on an Inset. Swaps to InsufficientData(compact) when
 * starved — never an authoritative fake zero.
 */
export const StatTile = React.forwardRef<HTMLDivElement, StatTileProps>(function StatTile(
  {
    label,
    value,
    format,
    prefix,
    suffix,
    mono = false,
    tone = 'accent',
    trendData,
    goodDirection = 'up',
    flatThreshold = 0,
    delta,
    hideTrend = false,
    starved = false,
    current,
    required,
    unit = 'data points',
    starvedTitle,
    starvedDescription,
    className,
  },
  ref,
) {
  // Derive the trend series once (hooks must run before any early return).
  const finite = React.useMemo(
    () => (trendData ?? []).filter((v): v is number => Number.isFinite(v)),
    [trendData],
  );

  // HONESTY CONTRACT — starved figure → compact InsufficientData, never a fake 0.
  const isStarved = starved || typeof value !== 'number' || !Number.isFinite(value);

  if (isStarved) {
    return (
      <div
        ref={ref}
        data-slot="stat-tile"
        data-state="insufficient-data"
        className={cn(
          // Same Inset chrome as the "ready" branch below (rounded-fw-md
          // bg-surface-sunken p-4, h-full) so a starved tile is ONE
          // self-contained panel — never a label floating above a
          // separately-bordered dashed box at a different height than its
          // neighbors (phone-width KPI grid audit, 2026-07-02).
          'flex h-full flex-col gap-2 rounded-fw-md bg-surface-sunken p-4',
          className,
        )}
      >
        <span className="font-fw-sans text-eyebrow uppercase text-text-tertiary">{label}</span>
        <InsufficientData
          compact
          title={starvedTitle ?? 'Not enough data yet'}
          description={starvedDescription}
          unit={unit}
          current={current}
          required={required}
          // No icon in this dense embedding — the label above already gives
          // context, and the icon's 40px circle was the single biggest
          // contributor to these tiles "dominating" a 2-col phone grid.
          icon={null}
          // Flatten into the outer panel above instead of drawing its own
          // nested dashed border/background (never card-in-card, §Inset).
          className="flex-1 justify-center border-0 bg-transparent p-0"
        />
      </div>
    );
  }

  // Derive the trend delta from the series when not given explicitly.
  const derivedDelta =
    typeof delta === 'number'
      ? delta
      : finite.length >= 2
        ? (finite[finite.length - 1] as number) - (finite[0] as number)
        : undefined;

  const verdict: TrendDirection | undefined =
    typeof derivedDelta === 'number'
      ? classifyTrend(derivedDelta, { goodDirection, flatThreshold })
      : undefined;

  const showTrend = !hideTrend && verdict !== undefined;
  const showSpark = finite.length >= 2;

  return (
    <div
      ref={ref}
      data-slot="stat-tile"
      data-state="ready"
      className={cn(
        // Inset chrome: sunken well, lighter than MetricCard's Surface card.
        // `h-full` pairs with KpiTile's `h-full` Link so every cell in a KPI
        // grid row (ready or starved) fills the row's stretched height —
        // no more mismatched panel heights (phone-width KPI grid audit).
        'flex h-full flex-col gap-2 rounded-fw-md bg-surface-sunken p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Numeric
          value={value}
          format={format}
          prefix={prefix}
          suffix={suffix}
          mono={mono}
          tone={tone}
          label={label}
          size="sm"
        />
        {showTrend ? (
          <TrendChip direction={verdict} size="sm" className="mt-0.5" />
        ) : null}
      </div>

      {showSpark ? (
        <Sparkline
          data={finite}
          goodDirection={goodDirection}
          flatThreshold={flatThreshold}
          direction={verdict}
          label={label}
          width={88}
          height={24}
          className="mt-0.5"
        />
      ) : null}
    </div>
  );
});
