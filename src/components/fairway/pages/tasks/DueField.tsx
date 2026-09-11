'use client';

/**
 * ============================================================================
 * DueField — the tasks stage
 * ----------------------------------------------------------------------------
 * One lane per person who still owes open, dated work, every lane on one
 * shared due-date axis. A task list answers "what is outstanding"; this
 * answers the question a coach actually opens the page with — who is behind,
 * how far behind, and whether the next crunch is tomorrow or in three weeks.
 *
 * The marks are asymmetric on purpose, because the two states are not
 * symmetric facts. An overdue task has a magnitude, so it rises from the
 * centre as an amber bar scaled by days late. A task not yet due has no
 * honest "how far ahead" magnitude, so it is a neutral stroke at its date and
 * nothing more: its distance from the Today rule carries the urgency. Each
 * lane prints the date of its next upcoming mark beside it, so a lane holding
 * one short stroke still states its own value instead of asking the reader to
 * measure it against a tick strip at the bottom of the field.
 *
 * There are NO per-row rails. The ground is vertical: month or week gridlines
 * and the Today rule. A rail drawn under a mark turns it into a handle parked
 * on a slider, which is the one shape this field must never produce.
 *
 * Today is interior, not the right-edge marker ScoreField pins: due dates run
 * into the future, which is the geometric reason this is its own instrument
 * rather than a reuse of ScoreField.
 *
 * PAGE-LOCAL by design. Not exported from modules/, not in the barrel, not in
 * registry.ts. It joins them when a second screen needs it.
 *
 * HYDRATION: `today` arrives as a bare YYYY-MM-DD string from the caller and
 * every derivation is precomputed in tasks-field-logic.ts. No clock is read
 * here, so the first client paint matches the markup it hydrates.
 * ========================================================================== */

import Link from 'next/link';
import { useMemo } from 'react';
import { LazyMotion, m } from 'framer-motion';

import { loadFeatures } from '@/lib/motion/load-features';
import { cn } from '@/lib/utils';
import { EASE_CINEMATIC, DURATION, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { dateFraction, scoreFieldTicks } from '@/components/fairway/modules/ScoreField';
import { Avatar } from '@/components/fairway/controls/avatar';
import { PressTarget } from '@/components/fairway/controls/press-target';
import { shortDate, type DueLane, type DueMark } from './tasks-field-logic';

const IDENTITY_COL = '13rem';
const LOAD_COL = '2.75rem';
const LATE_COL = '5rem';

/** The same entrance vocabulary as ScoreField: a capped stagger across every
 *  mark on the field, so a long roster never queues behind its own animation. */
const STAGGER_STEP = 0.012;
const STAGGER_CAP = 16;

/** The tallest an overdue bar grows, and the floor that keeps a one-day-late
 *  task a real mark rather than a speck. */
const HALF_HEIGHT_PX = 19;
const MIN_BAR_PX = 2;
/** A neutral stroke has no magnitude to encode, so it is a fixed height. */
const TICK_HEIGHT_PX = 12;
const SAME_DAY_NUDGE_PX = 4;

/** Past this fraction of the field a date label would run off the right edge,
 *  so the mark keeps its position and the label moves to its other side. */
const LABEL_FLIP_PCT = 64;
/** A tick label this close to the Today rule prints on top of it. The
 *  suppressed tick keeps its mark and its gridline; only the word goes. */
const TODAY_LABEL_MARGIN = 12;
/** A tick within this much of either end would hang its label off the field,
 *  so the label anchors to that edge while the mark keeps its position. */
const EDGE_ANCHOR_PCT = 8;

const anchorTransform = (x: number) =>
  x > 100 - EDGE_ANCHOR_PCT ? 'translateX(-100%)' : x < EDGE_ANCHOR_PCT ? 'translateX(0)' : 'translateX(-50%)';
const anchorItems = (x: number) =>
  x > 100 - EDGE_ANCHOR_PCT ? 'items-end' : x < EDGE_ANCHOR_PCT ? 'items-start' : 'items-center';

/** Left offset of an axis fraction inside the rowgroup, which is wider than
 *  the strip column by the identity, load and late tracks plus their gaps.
 *  The gridlines, the Today rule and the tick strip all measure from here, so
 *  they cannot drift apart. */
const axisLeft = (x: number) =>
  `calc(var(--df-identity) + 0.75rem + ${x}% * (100% - var(--df-identity) - var(--df-load) - var(--df-late) - 2.25rem) / 100%)`;

function Mark({
  mark,
  x,
  nudge,
  cap,
  index,
  reduced,
  dateLabel,
  onOpen,
}: {
  mark: DueMark;
  x: number;
  nudge: number;
  cap: number;
  index: number;
  reduced: boolean;
  /** Printed beside this mark when it is the lane's next upcoming date. */
  dateLabel: string | null;
  onOpen: ((taskId: string) => void) | null;
}) {
  const height = mark.overdue
    ? Math.max(MIN_BAR_PX, Math.round((Math.min(mark.daysLate, cap) / cap) * HALF_HEIGHT_PX))
    : TICK_HEIGHT_PX;
  const transition = {
    duration: DURATION.short,
    delay: Math.min(index, STAGGER_CAP) * STAGGER_STEP,
    ease: EASE_CINEMATIC,
  };

  const bar = (
    <m.span
      aria-hidden="true"
      initial={reduced ? false : { scaleY: 0, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      transition={reduced ? { duration: 0 } : transition}
      style={{
        height,
        // Overdue grows upward out of the centre line; a neutral stroke has no
        // direction to grow in, so it stays centred on it.
        transformOrigin: mark.overdue ? 'bottom' : 'center',
        ...(mark.overdue ? { bottom: '50%' } : { top: `calc(50% - ${TICK_HEIGHT_PX / 2}px)` }),
      }}
      className={cn(
        'absolute left-1/2 block w-[3px] -translate-x-1/2 rounded-full',
        mark.overdue ? 'bg-fw-warning' : 'bg-text-tertiary/70',
      )}
    />
  );

  const style = { left: `calc(${x}% + ${nudge}px)` };
  const hit = 'absolute top-0 block h-full w-3 -translate-x-1/2';
  const label = dateLabel ? (
    <span
      aria-hidden="true"
      className={cn(
        'absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-fw-mono text-eyebrow tabular-nums text-text-tertiary',
        x > LABEL_FLIP_PCT ? 'right-full mr-1.5' : 'left-full ml-1.5',
      )}
    >
      {dateLabel}
    </span>
  ) : null;

  // A task whose detail panel would be empty gets no button. The shipped row
  // already disables its own affordance rather than opening an empty panel;
  // a mark follows the same rule, and keeps the fact in its tooltip.
  if (!onOpen) {
    return (
      <span title={mark.label} style={style} className={hit}>
        <span className="sr-only">{mark.label}</span>
        {bar}
        {label}
      </span>
    );
  }

  return (
    <PressTarget
      title={mark.label}
      aria-label={mark.label}
      style={style}
      onClick={() => onOpen(mark.taskId)}
      className={cn(hit, 'rounded-fw-sm')}
    >
      {bar}
      {label}
    </PressTarget>
  );
}

export interface DueFieldProps {
  lanes: DueLane[];
  domain: { start: string; end: string };
  cap: number;
  today: string;
  /** "Player" for a coach, "Lane" for a single-lane player view. */
  rowsLabel?: string;
  ariaLabel: string;
  /** Opens the task's detail. Only wired to marks whose task has one. */
  onOpenTask: (taskId: string) => void;
  className?: string;
}

export function DueField({
  lanes,
  domain,
  cap,
  today,
  rowsLabel = 'Player',
  ariaLabel,
  onOpenTask,
  className,
}: DueFieldProps) {
  const reduced = useReducedMotionGuard();
  const ticks = useMemo(() => scoreFieldTicks(domain), [domain]);
  const todayX = dateFraction(today, domain);
  let markIndex = 0;

  return (
    <LazyMotion features={loadFeatures}>
      <div
        role="table"
        aria-label={ariaLabel}
        data-slot="due-field"
        className={cn('flex min-w-0 flex-col', className)}
        style={{
          ['--df-identity' as string]: IDENTITY_COL,
          ['--df-load' as string]: LOAD_COL,
          ['--df-late' as string]: LATE_COL,
        }}
      >
        <div
          role="row"
          className="hidden md:grid md:grid-cols-[var(--df-identity)_minmax(0,1fr)_var(--df-load)_var(--df-late)] md:gap-x-3 md:pb-1.5"
        >
          <span role="columnheader" className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
            {rowsLabel}
          </span>
          <span role="columnheader" className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
            Due dates, height is days late
          </span>
          {/* Not "Open": the readouts above already head a task count with that
              word, and this counts assignments, which is a different number. */}
          <span role="columnheader" className="text-right font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
            Load
          </span>
          <span role="columnheader" className="text-right font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
            Worst late
          </span>
        </div>

        <div role="rowgroup" className="relative isolate flex flex-col border-t border-border-strong">
          {/* Vertical ground. Month or week gridlines, never a rail per row. */}
          {ticks
            .filter((tick) => tick.label)
            .map((tick) => (
              <span
                key={`grid-${tick.key}`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 z-0 hidden w-px bg-border-subtle/50 md:block"
                style={{ left: axisLeft(tick.x) }}
              />
            ))}
          {/* One Today rule through the whole field, not one per row. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-0 hidden w-px bg-accent-500/70 md:block"
            style={{ left: axisLeft(todayX) }}
          />
          {/* Phone: the strip spans the whole row, so the same fraction maps
              straight onto the rowgroup. Without this the marks would sit on
              a field with no "now" in it, which is the only thing that makes
              a position mean urgency. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-0 w-px bg-accent-500/70 md:hidden"
            style={{ left: `${todayX}%` }}
          />

          {lanes.map((lane) => {
            const byDay = new Map<string, number>();
            // One date label per lane: the next thing it owes. A lane holding a
            // single upcoming stroke then still states its own value.
            const nextKey = lane.marks.find((mark) => !mark.overdue)?.key ?? null;
            return (
              <div
                key={lane.id}
                role="row"
                className={cn(
                  'relative z-10 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 border-b border-border-subtle py-2',
                  'md:grid-cols-[var(--df-identity)_minmax(0,1fr)_var(--df-load)_var(--df-late)] md:py-1',
                  // The terminal lane is work nobody owns. A heavier rule above
                  // it says it is a different kind of row, not one more player.
                  lane.isTeamLane && 'border-t border-border-strong',
                )}
              >
                <div role="rowheader" className="flex min-w-0 items-center gap-2.5 md:order-1">
                  {lane.isTeamLane ? null : (
                    <Avatar decorative name={lane.name} size="xs" className="shrink-0" />
                  )}
                  {lane.href ? (
                    <Link
                      href={lane.href}
                      className="truncate font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-700"
                    >
                      {lane.name}
                    </Link>
                  ) : (
                    <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">{lane.name}</span>
                  )}
                </div>

                <div
                  role="cell"
                  className="text-right font-fw-mono text-body-sm font-medium tabular-nums text-text-primary md:order-3"
                >
                  {lane.load}
                </div>

                <div role="cell" className="text-right md:order-4">
                  {lane.worst ? (
                    <span className="whitespace-nowrap font-fw-mono text-caption font-medium tabular-nums text-fw-warning-ink">
                      {lane.worst.daysLate}d late
                    </span>
                  ) : lane.nextDue ? (
                    // Nothing late: say when the next thing is due rather than
                    // a bare phrase that states no value.
                    <span className="whitespace-nowrap font-fw-mono text-caption tabular-nums text-text-tertiary">
                      {shortDate(lane.nextDue)}
                    </span>
                  ) : (
                    <span className="font-fw-sans text-caption text-text-tertiary">no date</span>
                  )}
                </div>

                <div role="cell" className="relative col-span-3 h-11 min-w-0 md:order-2 md:col-span-1">
                  {lane.offAxis ? (
                    // Say why there is no mark. Plotting an impossible date
                    // would put a mark on a day the task does not have, and
                    // letting it into the domain flattens every other lane.
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 font-fw-sans text-caption text-text-tertiary">
                      Due date outside the plotted range
                    </span>
                  ) : (
                    lane.marks.map((mark) => {
                      const seen = byDay.get(mark.date) ?? 0;
                      byDay.set(mark.date, seen + 1);
                      const i = markIndex++;
                      return (
                        <Mark
                          key={mark.key}
                          mark={mark}
                          x={dateFraction(mark.date, domain)}
                          nudge={seen * SAME_DAY_NUDGE_PX}
                          cap={cap}
                          index={i}
                          reduced={reduced}
                          dateLabel={mark.key === nextKey ? shortDate(mark.date) : null}
                          onOpen={mark.expandable ? onOpenTask : null}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div
          aria-hidden="true"
          className="relative mt-1 h-5 md:ml-[calc(var(--df-identity)+0.75rem)] md:mr-[calc(var(--df-load)+var(--df-late)+1.5rem)]"
        >
          {ticks.map((tick) => {
            // Today owns its own space: a tick label that would land under the
            // rule keeps its mark and loses its text.
            const collides = Math.abs(tick.x - todayX) < TODAY_LABEL_MARGIN;
            return (
              <span
                key={tick.key}
                className={cn('absolute top-0 flex flex-col', anchorItems(tick.x))}
                style={{ left: `${tick.x}%`, transform: anchorTransform(tick.x) }}
              >
                <span className="block h-1.5 w-px bg-border-strong" />
                {tick.label && !collides ? (
                  <span className="mt-0.5 whitespace-nowrap font-fw-mono text-eyebrow font-normal leading-none tabular-nums text-text-tertiary">
                    {tick.label}
                  </span>
                ) : null}
              </span>
            );
          })}
          <span
            className={cn('absolute top-0 flex flex-col', anchorItems(todayX))}
            style={{ left: `${todayX}%`, transform: anchorTransform(todayX) }}
          >
            <span className="block h-1.5 w-px bg-accent-500" />
            <span className="mt-0.5 font-fw-mono text-eyebrow font-normal leading-none text-accent-700">Today</span>
          </span>
        </div>
      </div>
    </LazyMotion>
  );
}
