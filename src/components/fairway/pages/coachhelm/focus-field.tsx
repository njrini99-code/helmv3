'use client';

/**
 * ============================================================================
 * FocusField: every focus area's readings on one shared date axis
 * ----------------------------------------------------------------------------
 * The stage instrument for player development. One row per active focus area:
 * the readings plotted as marks against a fixed baseline rule at the player's
 * starting value and a green target rule at 100 percent of the way there.
 *
 * PAGE-LOCAL BY DESIGN. It is not in `modules/`, the barrel or `registry.ts`,
 * per IMPLEMENTING.md: one screen uses it, so it lives beside that screen.
 * Promote it only when a second screen needs it AND the lead agrees.
 *
 * Mechanics are COPIED from `modules/ScoreField.tsx`, not imported: percentage
 * geometry with no measurement pass, `dayMs`/`dateFraction` for x, a one-day
 * floor on the domain, an axis that thins its own labels and yields the right
 * edge to the Today marker, a stagger capped at 16, `useReducedMotionGuard`.
 * ScoreField is deliberately single-purpose (one scale, one baseline at par,
 * one meaning for up and down); bending it to carry arbitrary units and
 * directions would make it a chart library.
 *
 * INK: a mark is coloured against the BASELINE RULE, a fixed reference, never
 * against the mark before it. Against a predecessor the hue would mean "the
 * last step" and any noisy series would read as alternating confetti. The
 * step-to-step story is carried by slope, which is what slope is for. The
 * connecting line is therefore one neutral hue for its whole length.
 *
 * ONE COLUMN AT EVERY WIDTH, and that is a measured decision, not a default.
 * A three-column row (identity, track, reading) was built first and measured
 * at 390 / 768 / 1024 / 1280 / 1440 inside the shell this page actually
 * renders in. The shell grows a right rail at 940px and keeps widening it, so
 * the stage's usable width does NOT rise with the viewport, and the split lost
 * at every size:
 *
 *     width   track split   track stacked
 *     768       281 px        594 px
 *     1024      167 px        366 px
 *     1280      285 px        602 px
 *     1440      365 px        762 px
 *
 * The split was worse everywhere and non-monotonic besides: a reader widening
 * from 1024 to 1280 watched the chart shrink from 285 to 167 and back. No
 * breakpoint fixes that, because the cause is the rail, not the viewport. So
 * the row does not split, and there is no breakpoint here to get wrong later.
 *
 * ACCESSIBILITY: the marks are not links. Every reading on this page is also a
 * row in the readings log table below, with its date, value and change, so the
 * table is the accessible equivalent of the plot and the plot does not repeat
 * one destination as sixteen identical links.
 * ========================================================================== */

import Link from 'next/link';
import { useMemo } from 'react';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { cn } from '@/lib/utils';
import { EASE_CINEMATIC, DURATION, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { VIZ_CHROME } from '../../charts/theme';
import {
  markTone,
  thinRowCaption,
  type FieldDomain,
  type FieldMark,
  type FieldRowState,
  type RowReadout,
} from './development-logic';

const DAY_MS = 86_400_000;
const STAGGER_STEP = 0.012;
const STAGGER_CAP = 16;
const SAME_DAY_NUDGE_PX = 5;
/**
 * How much of the right edge the axis keeps clear for the "Today" marker, as a
 * percentage of FIELD WIDTH. It has to clear the narrowest field the component
 * ever renders in, which is always the phone: at 390 a "Sep" tick and "Today"
 * collide at 8 percent. Raised to 12 alongside the same fix on the coach axis.
 */
const TICK_RIGHT_MARGIN = 12;

/** How far below the baseline the plot will stretch before it stops following. */
const FLOOR_LIMIT = -60;

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayMs(date: string): number {
  const [y, mo, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !mo || !d) return Number.NaN;
  return Date.UTC(y, mo - 1, d);
}

/** 0 to 100 position of a day inside the domain, clamped. */
export function dateFraction(date: string, domain: FieldDomain): number {
  const start = dayMs(domain.start);
  const end = Math.max(dayMs(domain.end), start + DAY_MS);
  const at = dayMs(date);
  if (!Number.isFinite(at) || !Number.isFinite(start)) return 0;
  return Math.min(100, Math.max(0, ((at - start) / (end - start)) * 100));
}

/**
 * The shared bottom of the y scale, in raw percent.
 *
 * Every row is measured against the same scale or the rows are not comparable,
 * which is the entire reason they share an axis. The floor follows the deepest
 * slip so a backslide is legible, but stops at FLOOR_LIMIT: one player who
 * collapsed to minus two hundred would otherwise flatten every other row into
 * a line at the top of its track.
 */
export function fieldFloor(rows: readonly FocusFieldRow[]): number {
  let low = 0;
  for (const row of rows) {
    for (const mark of marksOf(row.state)) low = Math.min(low, mark.raw);
  }
  return Math.max(FLOOR_LIMIT, Math.min(0, low));
}

/** 0 (target rule) to 100 (floor), top down, for absolute positioning. */
export function fieldY(raw: number, floor: number): number {
  const span = 100 - floor;
  if (span <= 0) return 100;
  const clamped = Math.max(floor, Math.min(100, raw));
  return ((100 - clamped) / span) * 100;
}

function marksOf(state: FieldRowState): readonly FieldMark[] {
  if (state.kind === 'plot') return state.marks;
  if (state.kind === 'single') return [state.mark];
  return [];
}

export interface FocusFieldTick {
  key: string;
  label: string;
  x: number;
}

/** Weekly ticks up to 45 days, monthly beyond, thinned when crowded. */
export function focusFieldTicks(domain: FieldDomain): FocusFieldTick[] {
  const start = dayMs(domain.start);
  const end = Math.max(dayMs(domain.end), start + DAY_MS);
  if (!Number.isFinite(start)) return [];
  const spanDays = (end - start) / DAY_MS;
  const ticks: FocusFieldTick[] = [];
  const fits = (x: number) => x <= 100 - TICK_RIGHT_MARGIN;
  if (spanDays <= 45) {
    for (let t = start; t <= end; t += 7 * DAY_MS) {
      const d = new Date(t);
      const x = ((t - start) / (end - start)) * 100;
      if (!fits(x)) continue;
      ticks.push({
        key: d.toISOString().slice(0, 10),
        label: `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`,
        x,
      });
    }
    return ticks;
  }
  const first = new Date(start);
  let y = first.getUTCFullYear();
  let mo = first.getUTCMonth() + (first.getUTCDate() === 1 ? 0 : 1);
  if (mo > 11) {
    mo = 0;
    y += 1;
  }
  for (let t = Date.UTC(y, mo, 1); t <= end; ) {
    const d = new Date(t);
    const x = ((t - start) / (end - start)) * 100;
    if (fits(x)) {
      ticks.push({
        key: d.toISOString().slice(0, 10),
        label:
          d.getUTCMonth() === 0
            ? `${MONTH[0]} ${String(d.getUTCFullYear()).slice(2)}`
            : MONTH[d.getUTCMonth()]!,
        x,
      });
    }
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  // A January tick keeps its label even when thinned: it is the only one
  // carrying the year, so blanking it loses the reader's place entirely.
  if (ticks.length > 8) {
    return ticks.map((tick, i) =>
      i % 2 === 0 || tick.label.startsWith(MONTH[0]!) ? tick : { ...tick, label: '' },
    );
  }
  return ticks;
}

/* ── The row ────────────────────────────────────────────────────────────── */

export interface FocusFieldRow {
  id: string;
  title: string;
  /** The metric being moved, e.g. "Greens in regulation". Sits under the title. */
  metricLabel: string;
  href?: string;
  /** Derived in `development-logic`; this component reads it, never derives it. */
  state: FieldRowState;
  readout: RowReadout;
  /** Latest value in its own unit, already formatted. */
  currentDisplay: string | null;
  /** Only present when the row has two or more readings and a resolved direction. */
  trend: { direction: 'improving' | 'declining'; magnitude: string } | null;
}

export interface FocusFieldProps {
  rows: readonly FocusFieldRow[];
  domain: FieldDomain;
  ariaLabel?: string;
  className?: string;
}

const TONE_DOT: Record<ReturnType<typeof markTone>, string> = {
  good: 'bg-accent-500',
  warn: 'bg-fw-warning',
  // Sits ON the baseline rule, so it needs to out-contrast it.
  neutral: 'bg-text-secondary',
};

function Mark({
  mark,
  x,
  y,
  nudge,
  index,
  reduced,
  last,
}: {
  mark: FieldMark;
  x: number;
  y: number;
  nudge: number;
  index: number;
  reduced: boolean;
  last: boolean;
}) {
  const tone = markTone(mark.raw);
  return (
    <m.span
      aria-hidden="true"
      title={`${mark.day}: ${mark.value}`}
      initial={reduced ? false : { opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: DURATION.short,
        delay: Math.min(index, STAGGER_CAP) * STAGGER_STEP,
        ease: EASE_CINEMATIC,
      }}
      style={{ left: `calc(${x}% + ${nudge}px)`, top: `${y}%` }}
      className={cn(
        'absolute block -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface',
        // The newest reading is the one a player looks for, so it is larger: a
        // colour change alone would not survive a row of same-toned marks.
        last ? 'h-[9px] w-[9px]' : 'h-[6px] w-[6px]',
        TONE_DOT[tone],
      )}
    />
  );
}

function Track({
  row,
  domain,
  floor,
  reduced,
  offset,
}: {
  row: FocusFieldRow;
  domain: FieldDomain;
  floor: number;
  reduced: boolean;
  offset: number;
}) {
  const marks = marksOf(row.state);
  const baselineY = fieldY(0, floor);
  const targetY = fieldY(100, floor);
  const points = marks
    .map((mark) => `${dateFraction(mark.day, domain)},${fieldY(mark.raw, floor)}`)
    .join(' ');
  const seenByDay = new Map<string, number>();

  return (
    <div className="relative h-14 min-w-0">
      {/*
        The plot is INSET from the row box by half a mark's height. A mark sits
        at its own centre, so one drawn exactly on the target rule (y=0) or on
        the floor (y=100) had half of itself outside the box and was clipped:
        a reader at 100 percent saw a half-moon, and a reader at their starting
        value saw a sliver at the row's bottom edge.
      */}
      <div className="absolute inset-x-0 bottom-[7px] top-[7px]">
        {/*
          Chart furniture, not page rules. Both are dashed and low-contrast so
          they read as the scale a mark is measured against, rather than as the
          section rules this page uses elsewhere at full strength.
        */}
        <span
          aria-hidden="true"
          style={{ top: `${targetY}%` }}
          className="absolute inset-x-0 border-t border-dashed border-accent-300"
        />
        <span
          aria-hidden="true"
          style={{ top: `${baselineY}%` }}
          className="absolute inset-x-0 border-t border-dashed border-border-strong"
        />

        {marks.length >= 2 ? (
          // Stretched viewBox with a non-scaling stroke: the geometry follows
          // the column width while the line stays one pixel at every width.
          // The dots are DOM, not SVG circles, which would squash into slivers.
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 block h-full w-full"
          >
            <polyline
              points={points}
              fill="none"
              stroke={VIZ_CHROME.axis}
              strokeWidth={1.25}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}

        {marks.map((mark, i) => {
          const seen = seenByDay.get(mark.day) ?? 0;
          seenByDay.set(mark.day, seen + 1);
          return (
            <Mark
              key={`${mark.day}-${i}`}
              mark={mark}
              x={dateFraction(mark.day, domain)}
              y={fieldY(mark.raw, floor)}
              nudge={seen * SAME_DAY_NUDGE_PX}
              index={offset + i}
              reduced={reduced}
              last={i === marks.length - 1}
            />
          );
        })}

      </div>
    </div>
  );
}

function RowReadoutCell({ row }: { row: FocusFieldRow }) {
  const { readout } = row;
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
      <div className="flex items-baseline gap-1.5">
        {row.currentDisplay ? (
          <span className="font-fw-sans text-caption text-text-tertiary">
            now{' '}
            <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
              {row.currentDisplay}
            </span>
          </span>
        ) : null}
        {row.trend ? (
          <span
            className={cn(
              'font-fw-mono text-caption font-medium tabular-nums',
              row.trend.direction === 'improving' ? 'text-accent-700' : 'text-fw-warning-ink',
            )}
          >
            <span aria-hidden="true">{row.trend.direction === 'improving' ? '▲' : '▼'}</span>{' '}
            {row.trend.magnitude}
            <span className="sr-only">
              {row.trend.direction === 'improving' ? ' improving' : ' declining'}
            </span>
          </span>
        ) : null}
      </div>
      {readout.kind === 'pct' ? (
        <span className="font-fw-sans text-caption text-text-secondary">
          <span className="font-fw-mono tabular-nums">{readout.pct}%</span> of the way there
        </span>
      ) : null}
      {/* Never the clamped 0 next to a mark drawn below the baseline: a reader
          who sees both has to decide which one is lying, and neither is. */}
      {readout.kind === 'below-start' ? (
        <span className="font-fw-sans text-caption text-fw-warning-ink">
          Below where you started.
        </span>
      ) : null}
    </div>
  );
}

export function FocusField({
  rows,
  domain,
  ariaLabel = 'Focus areas by reading over the window',
  className,
}: FocusFieldProps) {
  const reduced = useReducedMotionGuard();
  const floor = useMemo(() => fieldFloor(rows), [rows]);
  const ticks = useMemo(() => focusFieldTicks(domain), [domain]);
  // A shared counter so the stagger sweeps the whole instrument once, top to
  // bottom, instead of restarting inside every row.
  let markIndex = 0;

  return (
    <LazyMotion features={loadFeatures}>
      <div
        aria-label={ariaLabel}
        data-slot="focus-field"
        className={cn('flex min-w-0 flex-col border-t border-border-strong', className)}
      >
        {rows.map((row) => {
          const offset = markIndex;
          markIndex += marksOf(row.state).length;
          return (
            <div
              key={row.id}
              className="flex min-w-0 flex-col gap-1 border-b border-border-subtle py-3"
            >
              {/* Identity and reading share one line: both are short, and
                  keeping them on the same baseline lets the eye read down a
                  column of names and a column of values without the track
                  between them. */}
              <div className="flex min-w-0 items-baseline justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  {row.href ? (
                    <Link
                      href={row.href}
                      className="font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-700"
                    >
                      {row.title}
                    </Link>
                  ) : (
                    <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                      {row.title}
                    </span>
                  )}
                  <span className="font-fw-sans text-caption text-text-tertiary">
                    {row.metricLabel}
                  </span>
                </div>
                <RowReadoutCell row={row} />
              </div>
              <Track row={row} domain={domain} floor={floor} reduced={reduced} offset={offset} />
              {/* Says what the row is waiting for: no readings, one reading and
                  so no movement to draw, or a metric whose direction cannot be
                  resolved. A row never leaves a bare track unexplained. */}
              {thinRowCaption(row.state) ? (
                <p className="font-fw-sans text-caption text-text-tertiary">
                  {thinRowCaption(row.state)}
                </p>
              ) : null}
            </div>
          );
        })}

        {/* One shared axis under every row, full width: the track is full
            width too, so no column offset is needed to line them up. */}
        <div aria-hidden="true" className="relative mt-1 h-5 min-w-0">
          {ticks.map((tick) => (
            <span
              key={tick.key}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${tick.x}%` }}
            >
              <span className="block h-1.5 w-px bg-border-strong" />
              {tick.label ? (
                <span className="mt-0.5 whitespace-nowrap font-fw-mono text-eyebrow font-normal leading-none tabular-nums text-text-tertiary">
                  {tick.label}
                </span>
              ) : null}
            </span>
          ))}
          <span className="absolute right-0 top-0 flex flex-col items-end">
            <span className="block h-1.5 w-px bg-accent-500" />
            <span className="mt-0.5 font-fw-mono text-eyebrow font-normal leading-none text-accent-700">
              Today
            </span>
          </span>
        </div>
      </div>
    </LazyMotion>
  );
}
