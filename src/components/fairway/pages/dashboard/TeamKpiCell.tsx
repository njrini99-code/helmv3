'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · TeamKpiCell  (golf coach dashboard only)
 * ----------------------------------------------------------------------------
 * One cell of the coach dashboard's "Team performance" card: a caption label
 * with a green icon, a big display figure in dark warm ink (owner: no green
 * text) that rolls via Number Flow, a delta chip inline beside it, and a
 * fixed-height slot pinned to the cell's bottom edge for a Sparkline (or, for
 * the roster cell, an avatar stack). Because every cell reserves the same
 * bottom slot, the four sparklines across the card share one baseline
 * regardless of how many lines each cell's label, footnote or delta wrapped
 * onto.
 *
 * Why not restyle MetricCard: MetricCard is a shared primitive (golf CoachHelm
 * sections, the admin auth page, Baseball's PlayerQuickView all render it) and
 * its standalone tile chrome is exactly what this card removes: the four tiles
 * become one contained surface with hairlines. This file is local to the golf
 * dashboard, so nothing here touches another sport.
 *
 * Delta semantics are MetricCard's, unchanged (AUDIT-0724 #2/#6/#7): the
 * chip's tone comes from the cluster's ONE `classifyTrend()` and the arrow
 * reflects the raw sign; the caller feeds the chip's `value` and the
 * Sparkline's `direction` from the same `computeSeriesTrend()` call so the two
 * can never disagree. `TREND_TONE_CLASS.declining` is warm amber, never red.
 * ========================================================================== */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import NumberFlow, { type Format } from '@number-flow/react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sparkline,
  classifyTrend,
  TREND_TONE_CLASS,
  type GoodDirection,
  type TrendDirection,
} from '@/components/fairway/charts';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import type { DashboardDateRange } from '@/app/golf/actions/dashboard-data';

/** Height of the bottom slot every cell reserves, so sparklines share a baseline. */
const TREND_SLOT_HEIGHT = 28;

/** The card header's window readout for the dashboard's `range` state. */
export function windowLabel(range: DashboardDateRange): string {
  switch (range) {
    case '7d':
      return 'Last 7 days';
    case '30d':
      return 'Last 30 days';
    case '90d':
      return 'Last 90 days';
    case 'season':
      return 'This season';
    default:
      return 'All time';
  }
}

/* -- measure-then-fill (mirrors MetricCard's sparkline slot) -----------------
 * Sparkline draws to the exact pixel width it is handed, so the slot measures
 * itself and passes that width down. Until measured (SSR, jsdom) the plot is
 * simply not drawn — never a guessed width that could overshoot the cell. */
function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

export interface TeamKpiDelta {
  /** Split-half movement in the metric's own units (from computeSeriesTrend). */
  value: number;
  /** Fraction digits for the readout. Defaults to the cell's `decimals`. */
  decimals?: number;
  /** e.g. "%". */
  suffix?: string;
}

export interface TeamKpiCellProps {
  /** Sentence-case metric name (TYPE-03: no shouting caps on golf). */
  label: string;
  /** Lead icon, painted in the green accent ink (an icon, never the text). */
  icon: ReactNode;
  /** The figure. `null` renders `emptyMessage` in its place. */
  value: number | null;
  /** Fraction digits for the figure. Default 0. */
  decimals?: number;
  /** e.g. "%". */
  suffix?: string;
  /** Which way the raw number is GOOD — colours the chip. Default 'up'. */
  goodDirection?: GoodDirection;
  /** Delta chip beside the figure. Omit for a calm value-only cell. */
  delta?: TeamKpiDelta | null;
  /** Sparkline series (oldest → newest). Needs ≥2 points to draw. */
  series?: ReadonlyArray<number>;
  /** Accessible name prefix for the sparkline, e.g. "Scoring average". */
  seriesLabel?: string;
  /** Force the sparkline's verdict to the chip's (AUDIT-0724 #2). */
  direction?: TrendDirection;
  /** Shown in place of the figure when `value` is null. */
  emptyMessage?: string;
  /** Small supporting line under the figure. */
  footnote?: ReactNode;
  /** Replaces the sparkline in the bottom slot (the roster cell's avatars). */
  children?: ReactNode;
  className?: string;
}

export function TeamKpiCell({
  label,
  icon,
  value,
  decimals = 0,
  suffix,
  goodDirection = 'up',
  delta,
  series,
  seriesLabel,
  direction,
  emptyMessage = 'Not enough data yet',
  footnote,
  children,
  className,
}: TeamKpiCellProps) {
  const prefersReduced = useReducedMotionGuard();
  const { ref: slotRef, width: slotWidth } = useMeasuredWidth();

  const numberFormat: Format = {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  };
  const isEmpty = value == null;
  const showDelta = !isEmpty && delta != null;
  const showSeries = !isEmpty && children == null && !!series && series.length >= 2;

  // One spoken sentence per KPI (A11Y-01): the figure is split across a label,
  // NumberFlow's shadow digits and a chip, which a screen reader otherwise
  // reads as fragments.
  const spoken = (() => {
    if (isEmpty) return `${label}: ${emptyMessage}`;
    const figure = `${new Intl.NumberFormat('en-US', numberFormat).format(value)}${suffix ?? ''}`;
    const parts = [`${label}: ${figure}`];
    if (showDelta) {
      const dec = delta.decimals ?? decimals;
      const d = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }).format(Math.abs(delta.value));
      parts.push(
        delta.value === 0 ? 'no change' : `${delta.value > 0 ? 'up' : 'down'} ${d}${delta.suffix ?? ''}`,
      );
    }
    if (typeof footnote === 'string') parts.push(footnote);
    return parts.join(', ');
  })();

  return (
    <div
      role="group"
      aria-label={spoken}
      className={cn('flex min-w-0 flex-col gap-1.5 px-4 py-4 sm:px-5', className)}
    >
      {/* label row: green icon + sentence-case caption */}
      <div className="flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
        <span aria-hidden className="shrink-0 text-accent-ink [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        <span className="truncate">{label}</span>
      </div>

      {/* figure + inline delta */}
      {isEmpty ? (
        // Null metric recedes: quiet ink, sans, never a confident zero.
        <p className="font-fw-sans text-h3 font-normal text-text-tertiary">{emptyMessage}</p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            // Dark warm ink, not the green metric face MetricCard defaults to:
            // the card's deep green header already carries the brand, and the
            // owner rules out green text. NumberFlow's shadow digits inherit
            // `color`, so the class reaches them.
            className="font-fw-display text-h1 font-semibold leading-none tabular-nums text-text-primary"
            style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
          >
            <NumberFlow
              value={value}
              suffix={suffix}
              format={numberFormat}
              animated={!prefersReduced}
              transformTiming={{ duration: 700, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
              spinTiming={{ duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
              respectMotionPreference
            />
          </span>
          {showDelta ? (
            <TeamKpiDeltaChip
              delta={delta}
              decimals={delta.decimals ?? decimals}
              goodDirection={goodDirection}
              animated={!prefersReduced}
            />
          ) : null}
        </div>
      )}

      {footnote ? (
        <p className="font-fw-sans text-caption text-text-tertiary">{footnote}</p>
      ) : null}

      {/* bottom slot — fixed height, pinned to the cell's bottom edge, so the
          four cells' trends sit on one shared baseline. Kept even when empty
          (nothing to plot) so the silhouette never shifts between cells.
          Children (the roster cell's avatar stack) are centred rather than
          bottom-aligned so an avatar's cut-out ring is never clipped. */}
      <div
        ref={slotRef}
        className={cn(
          'mt-auto flex w-full min-w-0 overflow-hidden text-text-tertiary',
          children != null ? 'items-center' : 'items-end pt-1',
        )}
        style={{ height: TREND_SLOT_HEIGHT + 4 }}
      >
        {children ??
          (showSeries && slotWidth > 0 ? (
            <Sparkline
              data={series}
              width={slotWidth}
              height={TREND_SLOT_HEIGHT}
              goodDirection={goodDirection}
              direction={direction}
              label={seriesLabel ?? label}
            />
          ) : null)}
      </div>
    </div>
  );
}

/* -- delta chip ------------------------------------------------------------- */

function TeamKpiDeltaChip({
  delta,
  decimals,
  goodDirection,
  animated,
}: {
  delta: TeamKpiDelta;
  decimals: number;
  goodDirection: GoodDirection;
  animated: boolean;
}) {
  // Tone via the shared classifier (never a local sign check); arrow via the
  // raw sign. Flat when the value is exactly zero — a Minus beside "0" read as
  // a stray "— 0" (#950), so the chip says "Flat" instead.
  const verdict = classifyTrend(delta.value, { goodDirection });
  const isFlat = delta.value === 0 || verdict === 'flat';
  const Icon = delta.value > 0 ? ArrowUpRight : ArrowDownRight;
  const format: Format = {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: 'exceptZero',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'font-fw-sans text-caption font-medium tabular-nums',
        isFlat ? TREND_TONE_CLASS.flat : TREND_TONE_CLASS[verdict],
      )}
      style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
    >
      {isFlat ? (
        'Flat'
      ) : (
        <>
          <Icon aria-hidden className="h-3 w-3" strokeWidth={1.5} />
          <NumberFlow
            value={delta.value}
            suffix={delta.suffix}
            format={format}
            animated={animated}
            respectMotionPreference
          />
        </>
      )}
    </span>
  );
}
