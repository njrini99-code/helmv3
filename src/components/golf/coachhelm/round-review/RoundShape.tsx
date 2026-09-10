'use client';

/**
 * ============================================================================
 * RoundShape — the Round review stage instrument (round-review.v3.md)
 * ----------------------------------------------------------------------------
 * One column per hole across the full width. Each column is a bar off the par
 * baseline: over par rises in amber, under par drops in green, an eagle or
 * better takes the deeper green, and a par is a neutral tick on the line. A
 * cumulative line crosses the same box on its OWN scale — the bars say what
 * happened on each hole, the line says where the round actually turned — so
 * its finishing value is labelled at the right edge rather than asking the
 * reader to take it off the bars' axis.
 *
 * Geometry is percentage based: the columns are flex tracks and the bars are
 * pixel heights against a shared cap, so nothing is scaled by an SVG
 * transform. The one SVG is the cumulative polyline, which draws in a 0-100
 * box with `vectorEffect="non-scaling-stroke"` so its 1.5px stroke stays
 * 1.5px at every width.
 *
 * The same component draws the degraded stage: a scorecard-only round has no
 * hole columns, so the caller hands it the player's recent rounds instead,
 * with this round marked. It never fabricates a hole series.
 *
 * Page-local on purpose (round-review.v3.md): it is not in the shared
 * fairway barrel or registry.
 * ========================================================================== */

import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { PressTarget } from '@/components/fairway';
import { EASE_CINEMATIC, DURATION, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import { polylinePoints, type CumulativeLine, type NineDivider, type ShapeColumn } from './round-shape';

/** Half-height of a BAR in px: a hole at the cap reaches exactly this. */
const HALF_HEIGHT_PX = 30;
/** Height of the box the bars and the cumulative line share. The bars keep
 *  their own ±20px scale off the centre line; the extra room belongs to the
 *  line, which needs real amplitude to show where the round turned. */
const BOX_HEIGHT_PX = 88;
const MIN_BAR_PX = 2;
const STAGGER_STEP = 0.014;
const STAGGER_CAP = 18;

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

export interface RoundShapeProps {
  columns: ShapeColumn[];
  /** Strokes that reach a full bar. */
  cap: number;
  /** The cumulative score to par, or `null` when there is nothing to plot. */
  line?: CumulativeLine | null;
  /** Right-edge label for the line's finishing value. */
  lineLabel?: string | null;
  divider?: NineDivider | null;
  /** The column the reader has open, by `ShapeColumn.key`. */
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  /** Row of off-the-tee ticks, omitted when no column logged one. */
  showFairwayRow?: boolean;
  /** Row of green-in-regulation ticks, omitted when no column logged one. */
  showGirRow?: boolean;
  ariaLabel: string;
  /** Print every column's lower label on phone rather than one in three. The
   *  upper label row is desktop-only either way: at phone width these columns
   *  cannot hold a date or a par without truncating. */
  denseLabels?: boolean;
  className?: string;
}

function barHeight(value: number, cap: number): number {
  const safeCap = cap > 0 ? cap : 1;
  return Math.max(MIN_BAR_PX, Math.round((Math.abs(value) / safeCap) * HALF_HEIGHT_PX));
}

function FairwayTick({ fairway }: { fairway: ShapeColumn['fairway'] }) {
  if (!fairway) return <span className="block h-2" />;
  const noTarget = fairway.hit === null;
  const missed = fairway.hit === false;
  const left = missed && fairway.side === 'left' ? 26 : missed && fairway.side === 'right' ? 74 : 50;
  return (
    <span aria-hidden="true" className="relative block h-2">
      <span
        className={cn(
          'absolute top-1/2 block h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
          noTarget && 'bg-transparent ring-1 ring-warm-300',
          missed && 'bg-fw-warning',
          !noTarget && !missed && 'bg-accent-500',
        )}
        style={{ left: `${left}%` }}
      />
    </span>
  );
}

function GirTick({ gir }: { gir: ShapeColumn['gir'] }) {
  if (gir == null) return <span className="block h-2" />;
  return (
    <span aria-hidden="true" className="relative block h-2">
      <span
        className={cn(
          'absolute left-1/2 top-1/2 block h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2',
          gir ? 'bg-accent-500' : 'bg-fw-warning',
        )}
      />
    </span>
  );
}

export function RoundShape({
  columns,
  cap,
  line,
  lineLabel,
  divider,
  selectedKey,
  onSelect,
  showFairwayRow = false,
  showGirRow = false,
  ariaLabel,
  denseLabels = false,
  className,
}: RoundShapeProps) {
  const reduced = useReducedMotionGuard();
  const dividerX = divider ? ((divider.afterIndex + 1) / columns.length) * 100 : null;

  return (
    <LazyMotion features={loadFeatures}>
      <div data-slot="round-shape" className={cn('min-w-0', className)}>
        {/* OUT / IN, printed against the hairline that separates the nines. */}
        {divider && dividerX != null ? (
          <div className="relative mb-1 h-4 md:mr-14">
            <span
              className={cn(OVERLINE, 'absolute top-0 pr-2 font-fw-mono tabular-nums')}
              style={{ right: `${100 - dividerX}%` }}
            >
              {divider.frontLabel}
            </span>
            <span
              className={cn(OVERLINE, 'absolute top-0 pl-2 font-fw-mono tabular-nums')}
              style={{ left: `${dividerX}%` }}
            >
              {divider.backLabel}
            </span>
          </div>
        ) : null}

        <div className="relative">
          {/* The instrument proper. The right lane on desktop belongs to the
              cumulative line's finishing value, so the columns stop short of
              it and every label row below stays in the same grid. */}
          <div className="relative md:mr-14">
            <div role="group" aria-label={ariaLabel} className="relative flex w-full items-stretch">
              {columns.map((column, i) => {
                const selected = selectedKey != null && selectedKey === column.key;
                const over = column.value != null && column.value > 0;
                const under = column.value != null && column.value < 0;
                const height = column.value != null && column.value !== 0 ? barHeight(column.value, cap) : MIN_BAR_PX;
                const content = (
                  <>
                    <span className="relative block" style={{ height: BOX_HEIGHT_PX }}>
                      {/* the par line, drawn per column so it runs unbroken */}
                      <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-border-strong" />
                      <m.span
                        aria-hidden="true"
                        initial={reduced ? false : { scaleY: 0, opacity: 0 }}
                        animate={{ scaleY: 1, opacity: 1 }}
                        transition={{
                          duration: DURATION.short,
                          delay: Math.min(i, STAGGER_CAP) * STAGGER_STEP,
                          ease: EASE_CINEMATIC,
                        }}
                        style={{
                          height,
                          transformOrigin: over ? 'bottom' : 'top',
                          ...(over ? { bottom: '50%' } : under ? { top: '50%' } : { top: 'calc(50% - 1px)' }),
                        }}
                        className={cn(
                          'absolute left-1/2 block w-[42%] max-w-[16px] min-w-[3px] -translate-x-1/2',
                          over && 'bg-fw-warning',
                          under && (column.deep ? 'bg-accent-700' : 'bg-accent-500'),
                          !over && !under && 'bg-text-tertiary/70',
                        )}
                      />
                    </span>
                    {/* The upper label row (par, or the round's date) is a
                        desktop row: at phone width these columns are too
                        narrow to print it without truncating to ellipses. */}
                    <span className={cn(OVERLINE, 'mt-1.5 hidden truncate text-center font-fw-mono tabular-nums md:block')}>
                      {column.overline}
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 block truncate text-center font-fw-mono text-eyebrow tabular-nums',
                        column.marked ? 'font-semibold text-text-primary' : 'text-text-secondary',
                        !denseLabels && i % 3 !== 0 && 'invisible md:visible',
                      )}
                    >
                      {column.label}
                    </span>
                    {showFairwayRow ? (
                      <span className="mt-1.5 block">
                        <FairwayTick fairway={column.fairway} />
                      </span>
                    ) : null}
                    {showGirRow ? (
                      <span className="mt-0.5 block">
                        <GirTick gir={column.gir} />
                      </span>
                    ) : null}
                    {/* The one marker rail: green under the open hole, and
                        under the round being reviewed in the season view. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 block h-0.5 rounded-full transition-colors duration-150',
                        selected || column.marked ? 'bg-accent-600' : 'bg-transparent',
                      )}
                    />
                  </>
                );

                if (!onSelect) {
                  return (
                    <span key={column.key} className="flex min-w-0 flex-1 flex-col" title={column.detail}>
                      <span className="sr-only">{column.detail}</span>
                      {content}
                    </span>
                  );
                }
                return (
                  <PressTarget
                    key={column.key}
                    onClick={() => onSelect(column.key)}
                    aria-pressed={selected}
                    aria-label={column.detail}
                    title={column.detail}
                    className="flex min-w-0 flex-1 flex-col rounded-fw-sm hover:bg-surface-hover"
                  >
                    {content}
                  </PressTarget>
                );
              })}

              {dividerX != null ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 w-px bg-border-strong"
                  style={{ left: `${dividerX}%`, height: BOX_HEIGHT_PX }}
                />
              ) : null}
            </div>

            {/* The cumulative line: its own scale, over the same box. */}
            {line && line.points.length > 1 ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-x-0 top-0 w-full overflow-visible"
                style={{ height: BOX_HEIGHT_PX }}
              >
                <polyline
                  points={polylinePoints(line.points)}
                  fill="none"
                  className="stroke-accent-700"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : null}
          </div>

          {/* The one deep green element on the page: where the round finished. */}
          {line && lineLabel ? (
            <span
              className="absolute right-0 hidden -translate-y-1/2 whitespace-nowrap font-fw-mono text-caption font-medium tabular-nums text-accent-700 md:block"
              style={{ top: `${((line.points[line.points.length - 1]?.y ?? 50) / 100) * BOX_HEIGHT_PX}px` }}
            >
              {lineLabel}
            </span>
          ) : null}
        </div>

        {line && lineLabel ? (
          <p className="mt-2 font-fw-sans text-caption text-text-tertiary md:hidden">
            Running total finished at{' '}
            <span className="font-fw-mono font-medium tabular-nums text-accent-700">{lineLabel}</span>.
          </p>
        ) : null}
      </div>
    </LazyMotion>
  );
}
