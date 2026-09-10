'use client';

/**
 * ============================================================================
 * ScoreField: every player's rounds on one shared date axis (LANGUAGE.md)
 * ----------------------------------------------------------------------------
 * One row per player. Each round is a bar at its date: it rises over par in
 * amber and drops under par in green, an even round is a neutral tick. The
 * baseline is par. Rows end with the player's window average and a
 * split-half trend chip, so a coach reads the whole roster's shape in one
 * pass and still sees each round.
 *
 * Geometry is percentage based (no SVG scaling), so bars stay crisp at every
 * width. Phone: the identity row sits above the strip; desktop: one row.
 * ========================================================================== */

import Link from 'next/link';
import { useMemo } from 'react';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { cn } from '@/lib/utils';
import { EASE_CINEMATIC, DURATION, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { Avatar } from '../controls/avatar';
import type { ScoreFieldProps, ScoreFieldRound, ScoreFieldRow } from './types';

const DAY_MS = 86_400_000;
const HALF_HEIGHT_PX = 19;
const MIN_BAR_PX = 2;
const SAME_DAY_NUDGE_PX = 4;
const STAGGER_STEP = 0.012;
const STAGGER_CAP = 16;

function dayMs(date: string): number {
  const [y, mo, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !mo || !d) return Number.NaN;
  return Date.UTC(y, mo - 1, d);
}

/** 0 to 100 position of a day inside the domain, clamped. */
export function dateFraction(date: string, domain: { start: string; end: string }): number {
  const start = dayMs(domain.start);
  const end = Math.max(dayMs(domain.end), start + DAY_MS);
  const at = dayMs(date);
  if (!Number.isFinite(at) || !Number.isFinite(start)) return 0;
  return Math.min(100, Math.max(0, ((at - start) / (end - start)) * 100));
}

/** Strokes that reach full bar height: the roster's largest swing, kept between 4 and 12. */
export function scoreFieldCap(rows: ReadonlyArray<ScoreFieldRow>): number {
  let max = 0;
  for (const row of rows) for (const r of row.rounds) max = Math.max(max, Math.abs(r.toPar));
  return Math.min(12, Math.max(4, max));
}

export interface ScoreFieldTick {
  key: string;
  label: string;
  x: number;
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Axis ticks: weekly for windows up to 45 days, monthly beyond (every other label past eight). */
/** The right edge belongs to the Today marker: a tick inside this margin would print on top of it. */
const TICK_RIGHT_MARGIN = 8;

export function scoreFieldTicks(domain: { start: string; end: string }): ScoreFieldTick[] {
  const start = dayMs(domain.start);
  const end = Math.max(dayMs(domain.end), start + DAY_MS);
  if (!Number.isFinite(start)) return [];
  const spanDays = (end - start) / DAY_MS;
  const ticks: ScoreFieldTick[] = [];
  const fits = (x: number) => x <= 100 - TICK_RIGHT_MARGIN;
  if (spanDays <= 45) {
    for (let t = start; t <= end; t += 7 * DAY_MS) {
      const d = new Date(t);
      const x = ((t - start) / (end - start)) * 100;
      if (!fits(x)) continue;
      ticks.push({ key: d.toISOString().slice(0, 10), label: `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`, x });
    }
    return ticks;
  }
  const first = new Date(start);
  let y = first.getUTCFullYear();
  let mo = first.getUTCMonth() + (first.getUTCDate() === 1 ? 0 : 1);
  if (mo > 11) { mo = 0; y += 1; }
  for (let t = Date.UTC(y, mo, 1); t <= end; ) {
    const d = new Date(t);
    const isJan = d.getUTCMonth() === 0;
    const x = ((t - start) / (end - start)) * 100;
    if (fits(x)) {
      ticks.push({
        key: d.toISOString().slice(0, 10),
        label: isJan ? `${MONTH[0]} ${String(d.getUTCFullYear()).slice(2)}` : MONTH[d.getUTCMonth()]!,
        x,
      });
    }
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  // Thin a crowded axis, but a January tick keeps its label: it is the only
  // one carrying the year, so blanking it loses the reader's place entirely.
  if (ticks.length > 8) {
    return ticks.map((tick, i) => (i % 2 === 0 || tick.label.startsWith(MONTH[0]!) ? tick : { ...tick, label: '' }));
  }
  return ticks;
}

function formatAvg(avg: number | null): string {
  return avg == null ? '–' : avg.toFixed(1);
}

function TrendMark({ trend }: { trend: ScoreFieldRow['trend'] }) {
  if (!trend) {
    return <span className="font-fw-sans text-caption text-text-tertiary">no read</span>;
  }
  const magnitude = Math.abs(trend.delta).toFixed(1);
  if (trend.direction === 'improving') {
    return (
      <span className="font-fw-mono text-caption font-medium tabular-nums text-accent-700">
        <span aria-hidden="true">▲</span> {magnitude}
        <span className="sr-only"> strokes better</span>
      </span>
    );
  }
  if (trend.direction === 'declining') {
    return (
      <span className="font-fw-mono text-caption font-medium tabular-nums text-fw-warning-ink">
        <span aria-hidden="true">▼</span> {magnitude}
        <span className="sr-only"> strokes worse</span>
      </span>
    );
  }
  return <span className="font-fw-sans text-caption text-text-tertiary">flat</span>;
}

function Bar({
  round,
  x,
  nudge,
  cap,
  index,
  reduced,
}: {
  round: ScoreFieldRound;
  x: number;
  nudge: number;
  cap: number;
  index: number;
  reduced: boolean;
}) {
  const over = round.toPar > 0;
  const under = round.toPar < 0;
  const height = round.toPar === 0
    ? MIN_BAR_PX
    : Math.max(MIN_BAR_PX, Math.round((Math.abs(round.toPar) / cap) * HALF_HEIGHT_PX));
  const bar = (
    <m.span
      aria-hidden="true"
      initial={reduced ? false : { scaleY: 0, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      transition={{ duration: DURATION.short, delay: Math.min(index, STAGGER_CAP) * STAGGER_STEP, ease: EASE_CINEMATIC }}
      style={{
        height,
        transformOrigin: over ? 'bottom' : 'top',
        ...(over ? { bottom: '50%' } : under ? { top: '50%' } : { top: 'calc(50% - 1px)' }),
      }}
      className={cn(
        'absolute left-1/2 block w-[3px] -translate-x-1/2 rounded-full',
        over && 'bg-fw-warning',
        under && 'bg-accent-500',
        !over && !under && 'bg-text-tertiary/70',
      )}
    />
  );
  const hit = 'absolute top-0 block h-full w-3 -translate-x-1/2';
  const style = { left: `calc(${x}% + ${nudge}px)` };
  return round.href ? (
    <Link
      href={round.href}
      title={round.label}
      aria-label={round.label}
      style={style}
      className={cn(hit, 'rounded-fw-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50')}
    >
      {bar}
    </Link>
  ) : (
    <span title={round.label} style={style} className={hit}>
      <span className="sr-only">{round.label}</span>
      {bar}
    </span>
  );
}

const IDENTITY_COL = '11rem';
const AVG_COL = '3.25rem';
const TREND_COL = '4.25rem';

export function ScoreField({
  rows,
  domain,
  cap: capProp,
  rowsLabel = 'Player',
  ariaLabel = 'Rounds by player over the window',
  className,
}: ScoreFieldProps) {
  const reduced = useReducedMotionGuard();
  const cap = capProp ?? scoreFieldCap(rows);
  const ticks = useMemo(() => scoreFieldTicks(domain), [domain]);
  let barIndex = 0;

  return (
    <LazyMotion features={loadFeatures}>
      <div
        role="table"
        aria-label={ariaLabel}
        data-slot="score-field"
        className={cn('flex min-w-0 flex-col', className)}
        style={{ ['--sf-identity' as string]: IDENTITY_COL, ['--sf-avg' as string]: AVG_COL, ['--sf-trend' as string]: TREND_COL }}
      >
        <div role="row" className="hidden md:grid md:grid-cols-[var(--sf-identity)_minmax(0,1fr)_var(--sf-avg)_var(--sf-trend)] md:gap-x-3 md:pb-1.5">
          <span role="columnheader" className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">{rowsLabel}</span>
          <span role="columnheader" className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">Rounds, over par up, under par down</span>
          <span role="columnheader" className="text-right font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">Avg</span>
          <span role="columnheader" className="text-right font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">Trend</span>
        </div>
        <div role="rowgroup" className="flex flex-col border-t border-border-strong">
          {rows.map((row) => {
            const byDay = new Map<string, number>();
            return (
              <div
                key={row.id}
                role="row"
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 border-b border-border-subtle py-2 md:grid-cols-[var(--sf-identity)_minmax(0,1fr)_var(--sf-avg)_var(--sf-trend)] md:py-0.5"
              >
                <div role="rowheader" className="flex min-w-0 items-center gap-2.5 md:order-1">
                  <Avatar decorative name={row.name} src={row.avatarUrl} size="xs" className="shrink-0" />
                  {row.href ? (
                    <Link href={row.href} className="truncate font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-700">
                      {row.name}
                    </Link>
                  ) : (
                    <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">{row.name}</span>
                  )}
                </div>
                <div role="cell" className="text-right font-fw-mono text-body-sm font-medium tabular-nums text-text-primary md:order-3">
                  {formatAvg(row.avg)}
                </div>
                <div role="cell" className="text-right md:order-4">
                  <TrendMark trend={row.trend} />
                </div>
                <div role="cell" className="relative col-span-3 h-11 min-w-0 md:order-2 md:col-span-1">
                  <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-border-strong" />
                  {row.rounds.length === 0 ? (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 bg-surface px-1 font-fw-sans text-caption text-text-tertiary">
                      No rounds in this window
                    </span>
                  ) : null}
                  {row.rounds.map((round) => {
                    const seen = byDay.get(round.date) ?? 0;
                    byDay.set(round.date, seen + 1);
                    const i = barIndex++;
                    return (
                      <Bar
                        key={round.id}
                        round={round}
                        x={dateFraction(round.date, domain)}
                        nudge={seen * SAME_DAY_NUDGE_PX}
                        cap={cap}
                        index={i}
                        reduced={reduced}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div
          aria-hidden="true"
          className="relative mt-1 h-5 md:ml-[calc(var(--sf-identity)+0.75rem)] md:mr-[calc(var(--sf-avg)+var(--sf-trend)+1.5rem)]"
        >
          {ticks.map((tick) => (
            <span key={tick.key} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${tick.x}%` }}>
              <span className="block h-1.5 w-px bg-border-strong" />
              {tick.label ? (
                <span className="mt-0.5 whitespace-nowrap font-fw-mono text-eyebrow font-normal leading-none tabular-nums text-text-tertiary">{tick.label}</span>
              ) : null}
            </span>
          ))}
          <span className="absolute right-0 top-0 flex flex-col items-end">
            <span className="block h-1.5 w-px bg-accent-500" />
            <span className="mt-0.5 font-fw-mono text-eyebrow font-normal leading-none text-accent-700">Today</span>
          </span>
        </div>
      </div>
    </LazyMotion>
  );
}
