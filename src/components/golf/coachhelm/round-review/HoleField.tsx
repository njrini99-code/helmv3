'use client';

/**
 * ============================================================================
 * HoleField — a round drawn along its hole axis
 * ----------------------------------------------------------------------------
 * One column per hole across the full width. Each column is a bar off the par
 * baseline: over par rises in amber, under par drops in green, an eagle or
 * better takes the deeper green, and a par is a neutral tick on the line. An
 * optional cumulative line crosses the same box on its OWN scale — the bars
 * say what happened on each hole, the line says where the round actually
 * turned — so its finishing value is labelled at the right edge rather than
 * asking the reader to take it off the bars' axis.
 *
 * Geometry is percentage based: the columns are flex tracks and the bars are
 * pixel heights against a shared cap, so nothing is scaled by an SVG
 * transform. The one SVG is the cumulative polyline, which draws in a 0-100
 * box with `vectorEffect="non-scaling-stroke"` so its 1.5px stroke stays
 * 1.5px at every width.
 *
 * SELF-CONTAINED ON PURPOSE. Round review and round detail both draw a round
 * this way, so this file declares its own column model and geometry and
 * imports nothing from either page. The column model is deliberately NOT
 * `HoleBreakdown`: that type belongs to `round-review-system`, and taking it
 * would tie every caller to the review's view model. A caller maps whatever
 * it has into `HoleFieldColumn[]` and keeps its own framing — captions,
 * headings, the sentence naming the scale — outside this component.
 *
 * Because the model is columns rather than holes, the same instrument also
 * draws a season: hand it one column per round instead of one per hole. It
 * never fabricates a series.
 * ========================================================================== */

import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { PressTarget } from '@/components/fairway';
import { EASE_CINEMATIC, DURATION, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';

/** Half-height of a BAR in px: a column at the cap reaches exactly this. */
const HALF_HEIGHT_PX = 30;
/** Height of the box the bars and the cumulative line share. The bars keep
 *  their own scale off the centre line; the extra room belongs to the line,
 *  which needs real amplitude to show where the round turned. */
const BOX_HEIGHT_PX = 88;
const MIN_BAR_PX = 2;
const STAGGER_STEP = 0.014;
const STAGGER_CAP = 18;

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

/** One column of the field: a hole, or a round in a season view. */
export interface HoleFieldColumn {
  key: string;
  /** Signed strokes against par. Positive rises in amber, negative drops in
   *  green, `null` renders the neutral par tick with no claim. */
  value: number | null;
  /** The row printed directly under the box (par, or a round's date). */
  overline: string;
  /** The row under that (hole number, or the round's score). */
  label: string;
  /** Spoken/hover description — the whole fact for this column. */
  detail: string;
  /** Eagle or better, which reads deeper than a birdie. */
  deep?: boolean;
  /** The column the field is drawn around, marked with the green rail. */
  marked?: boolean;
  /** Off-the-tee result: `null` when there is no fairway target at all. */
  fairway?: { hit: boolean | null; side: 'left' | 'right' | null };
  /** Green in regulation, `null` when it was never logged. */
  gir?: boolean | null;
}

/** A plotted point of the cumulative line, in the 0-100 box. */
export interface HoleFieldPoint {
  hole: number;
  value: number;
  x: number;
  y: number;
}

export interface HoleFieldLine {
  points: HoleFieldPoint[];
  min: number;
  max: number;
  last: number;
}

/** The hairline that separates two halves of the field, OUT from IN. */
export interface HoleFieldDivider {
  /** Index of the last column before the rule. */
  afterIndex: number;
  frontLabel: string;
  backLabel: string;
}

/** `points` for an SVG polyline, fixed to 2dp so the markup is stable. */
export function polylinePoints(points: ReadonlyArray<HoleFieldPoint>): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

/**
 * Strokes that reach a full bar. At least 3, so a round that never moved more
 * than one off par does not render every hole at full height, and otherwise
 * the round's own worst hole, so no bar is ever clipped.
 */
export function holeFieldCap(columns: ReadonlyArray<HoleFieldColumn>): number {
  let worst = 0;
  for (const column of columns) {
    if (column.value == null) continue;
    worst = Math.max(worst, Math.abs(column.value));
  }
  return Math.max(3, worst);
}

export interface HoleFieldProps {
  columns: HoleFieldColumn[];
  /** Strokes that reach a full bar. Derived from the columns when omitted, so
   *  a caller never has to import a helper just to render the field. */
  cap?: number;
  /** The cumulative score to par, or `null` when there is nothing to plot. */
  line?: HoleFieldLine | null;
  /** Right-edge label for the line's finishing value. */
  lineLabel?: string | null;
  divider?: HoleFieldDivider | null;
  /** The column the reader has open, by `HoleFieldColumn.key`. */
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  /** Row of off-the-tee ticks, omitted when no column logged one. */
  showFairwayRow?: boolean;
  /** Row of green-in-regulation ticks, omitted when no column logged one. */
  showGirRow?: boolean;
  /** Row labels for the two label rows, printed in the right lane instead of
   *  inside column one. A column an eighteenth of the screen wide cannot hold
   *  a word and a number, so "Par 4" truncated to "PA…" at every width below
   *  1280; the lane always has room. Desktop only, like the rows it names. */
  rowLabels?: { overline?: string; label?: string };
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

function FairwayTick({ fairway }: { fairway: HoleFieldColumn['fairway'] }) {
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

function GirTick({ gir }: { gir: HoleFieldColumn['gir'] }) {
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

export function HoleField({
  columns,
  cap: capProp,
  line,
  lineLabel,
  divider,
  selectedKey,
  onSelect,
  showFairwayRow = false,
  showGirRow = false,
  rowLabels,
  ariaLabel,
  denseLabels = false,
  className,
}: HoleFieldProps) {
  const reduced = useReducedMotionGuard();
  const cap = capProp ?? holeFieldCap(columns);
  // The lane exists for the line's finishing value and for the row labels. A
  // field with neither keeps the full width for its columns.
  const showLane = Boolean(rowLabels?.overline || rowLabels?.label || (line && lineLabel));
  const dividerX = divider ? ((divider.afterIndex + 1) / columns.length) * 100 : null;

  return (
    <LazyMotion features={loadFeatures}>
      <div data-slot="hole-field" className={cn('min-w-0', className)}>
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
          {/* The instrument proper, then the right lane. The lane carries the
              cumulative line's finishing value and the row labels, and it is
              a real flex track rather than a margin so each label lines up
              with its row by structure instead of by arithmetic. */}
          <div className="flex items-stretch">
           <div className="relative min-w-0 flex-1">
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

           {/* The lane. It mirrors the column stack exactly — same heights,
               same margins — so "Par" sits on the par row and "Hole" on the
               hole row without a single magic offset. */}
           {showLane ? (
             <div aria-hidden="true" className="hidden w-14 shrink-0 flex-col pl-2 md:flex">
               <span className="block" style={{ height: BOX_HEIGHT_PX }} />
               <span className={cn(OVERLINE, 'mt-1.5 block truncate')}>{rowLabels?.overline ?? ''}</span>
               <span className="mt-0.5 block truncate font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
                 {rowLabels?.label ?? ''}
               </span>
             </div>
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
