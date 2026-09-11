'use client';

/**
 * ============================================================================
 * QualifyingField — the qualifiers stage
 * ----------------------------------------------------------------------------
 * One row per qualifier, one bar per row, all on one shared date axis: the
 * team's whole lineup pipeline in a single strip. A table of start, end and
 * deadline columns makes a coach read three dates per row and work out overlap
 * and urgency by hand. Here position and length say it directly.
 *
 * Each bar is two nested segments. The outer track runs from the entry
 * deadline to the end of play, so the weeks a qualifier sits open for entries
 * are visible rather than implied. The inner segment is the play window
 * itself, at full strength. When no deadline was ever recorded the track
 * collapses onto the play window and the bar renders as one solid mark, which
 * is the honest way to show a missing field rather than inventing a waiting
 * period to shade. A qualifier that opens and closes on the same day has no
 * length to draw at all, so it renders as a stroke on the axis carrying its
 * own date. There are no per-row rails: the ground is vertical month lines, so
 * a short mark reads as a date and never as a handle parked on a slider.
 *
 * The Today rule is interior, not the right-edge marker ScoreField uses: this
 * domain runs into the future, because upcoming qualifiers are the point.
 *
 * PAGE-LOCAL by design. Not exported from modules/, not in registry.ts. It
 * joins them when a second screen needs it.
 *
 * HYDRATION: `today` arrives as a bare YYYY-MM-DD string from the caller. No
 * clock is read here, so the server render and the first client paint agree.
 * ========================================================================== */

import Link from 'next/link';
import { useMemo } from 'react';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { cn } from '@/lib/utils';
import { EASE_CINEMATIC, DURATION, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { dateFraction, scoreFieldTicks } from '@/components/fairway/modules/ScoreField';
import { StatusPill } from '@/components/fairway';
import { qualifierStatusMeta } from './qualifier-status';
import { isPointEvent } from './qualifiers-field-logic';
import type { QualifyingBar } from './qualifiers-field-logic';

const IDENTITY_COL = '15rem';
const SPOTS_COL = '3.5rem';
const STAGGER_STEP = 0.012;
const STAGGER_CAP = 16;
/** A one-day qualifier inside a ninety-day domain is under one percent wide.
 *  The percentage keeps the geometry honest; the pixel floor keeps the mark
 *  visible. Both apply, and the pixel floor wins on a narrow field. */
const MIN_BAR_PCT = 0.6;
const MIN_BAR_PX = 7;
/** A tick label this close to the Today rule prints on top of it. The margin
 *  is a percentage of the field, so it has to clear the narrowest field this
 *  component renders on, which is a phone. At six percent "Sep" and "Today"
 *  still collided at 390px. The suppressed tick keeps its mark and its
 *  gridline; only the word goes. */
const TODAY_LABEL_MARGIN = 12;
/** Past this fraction of the field a point label would run off the right edge,
 *  so the mark keeps its position and the label moves to its other side. */
const LABEL_FLIP_PCT = 62;

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `YYYY-MM-DD` to `Aug 31`, assembled from the string's own parts. No Date
 *  parsing and no locale table, so the server string and the client's first
 *  paint are the same string. */
function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  const month = MONTH_ABBR[Number(m) - 1];
  return month && d ? `${month} ${Number(d)}` : dateStr;
}

/** What the row's play window is, in the fewest characters that stay exact.
 *  A one-day qualifier prints one date; a window inside one month drops the
 *  repeated month; anything else prints both in full. */
function rangeLabel(start: string, end: string): string {
  if (start === end) return shortDate(start);
  const [, sm] = start.split('-');
  const [, em, ed] = end.split('-');
  if (sm === em) return `${shortDate(start)}\u2013${Number(ed)}`;
  return `${shortDate(start)}\u2013${shortDate(end)}`;
}

/** A tick within this much of either end would hang its label off the field,
 *  so the label anchors to that edge while the mark keeps its exact position. */
const EDGE_ANCHOR_PCT = 8;

const anchorTransform = (x: number) =>
  x > 100 - EDGE_ANCHOR_PCT ? 'translateX(-100%)' : x < EDGE_ANCHOR_PCT ? 'translateX(0)' : 'translateX(-50%)';
const anchorItems = (x: number) =>
  x > 100 - EDGE_ANCHOR_PCT ? 'items-end' : x < EDGE_ANCHOR_PCT ? 'items-start' : 'items-center';

/** Left offset of an axis fraction inside the rowgroup, which is wider than
 *  the bar column by the identity and spots tracks plus their two gaps. The
 *  gridlines, the Today rule and the tick strip all measure from here, so they
 *  cannot drift apart. */
const axisLeft = (x: number) =>
  `calc(var(--qf-identity) + 0.75rem + ${x}% * (100% - var(--qf-identity) - var(--qf-spots) - 1.5rem) / 100%)`;

const TONE_CLASS: Record<QualifyingBar['tone'], string> = {
  live: 'bg-accent-500',
  urgent: 'bg-fw-warning',
  neutral: 'bg-text-tertiary/70',
};

function Bar({
  bar,
  domain,
  index,
  reduced,
}: {
  bar: QualifyingBar;
  domain: { start: string; end: string };
  index: number;
  reduced: boolean;
}) {
  const trackLeft = dateFraction(bar.trackStart, domain);
  const trackRight = dateFraction(bar.trackEnd, domain);
  const playLeft = dateFraction(bar.playStart, domain);
  const playRight = dateFraction(bar.playEnd, domain);
  const trackWidth = Math.max(MIN_BAR_PCT, trackRight - trackLeft);
  const playWidth = Math.max(MIN_BAR_PCT, playRight - playLeft);
  const tone = TONE_CLASS[bar.tone];
  const transition = reduced
    ? { duration: 0 }
    : { duration: DURATION.short, delay: Math.min(index, STAGGER_CAP) * STAGGER_STEP, ease: EASE_CINEMATIC };

  // One day is a position, not a length. The stroke marks the day and the date
  // rides beside it, so the row states its own value instead of asking the
  // coach to measure a dot against a tick strip five rows away.
  if (isPointEvent(bar)) {
    const flip = trackLeft > LABEL_FLIP_PCT;
    return (
      <span
        aria-hidden="true"
        className="absolute top-1/2"
        style={{ left: `${trackLeft}%`, transform: flip ? 'translate(-100%, -50%)' : 'translateY(-50%)' }}
      >
        <m.span
          className={cn('flex h-5 items-center gap-1.5', flip && 'flex-row-reverse')}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={transition}
        >
          <span className={cn('h-full w-0.5 shrink-0 rounded-full', tone)} />
          <span className="whitespace-nowrap font-fw-mono text-eyebrow tabular-nums text-text-tertiary">
            {rangeLabel(bar.playStart, bar.playEnd)}
          </span>
        </m.span>
      </span>
    );
  }

  // Every mark states its own window. A three-day bar inside a ninety-day
  // domain is under four percent wide, and no coach measures four percent
  // against a tick strip at the bottom of the field.
  const flip = trackRight > LABEL_FLIP_PCT;
  return (
    <span
      aria-hidden="true"
      className="absolute top-1/2 block h-2 -translate-y-1/2"
      style={{ left: `${trackLeft}%`, width: `${trackWidth}%`, minWidth: `${MIN_BAR_PX}px` }}
    >
      <m.span
        className="absolute inset-0 block rounded-full"
        style={{ transformOrigin: 'left' }}
        initial={reduced ? false : { scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={transition}
      >
        {/* The waiting period, only drawn when a deadline was actually recorded. */}
        {bar.deadlineUnknown ? null : <span className={cn('absolute inset-0 rounded-full opacity-20', tone)} />}
        <span
          className={cn('absolute top-0 h-full rounded-full', tone)}
          style={{
            left: `${trackWidth > 0 ? ((playLeft - trackLeft) / trackWidth) * 100 : 0}%`,
            width: `${trackWidth > 0 ? (playWidth / trackWidth) * 100 : 100}%`,
          }}
        />
      </m.span>
      <span
        className={cn(
          'absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-fw-mono text-eyebrow tabular-nums text-text-tertiary',
          flip ? 'right-full mr-1.5' : 'left-full ml-1.5',
        )}
      >
        {rangeLabel(bar.playStart, bar.playEnd)}
      </span>
    </span>
  );
}

export interface QualifyingFieldProps {
  bars: QualifyingBar[];
  domain: { start: string; end: string };
  today: string;
  rowsLabel?: string;
  ariaLabel: string;
  className?: string;
}

export function QualifyingField({ bars, domain, today, rowsLabel = 'Qualifier', ariaLabel, className }: QualifyingFieldProps) {
  const reduced = useReducedMotionGuard();
  const ticks = useMemo(() => scoreFieldTicks(domain), [domain]);
  const todayX = dateFraction(today, domain);

  return (
    <LazyMotion features={loadFeatures} strict>
      <div
        role="table"
        aria-label={ariaLabel}
        className={cn('flex min-w-0 flex-col', className)}
        style={{ ['--qf-identity' as string]: IDENTITY_COL, ['--qf-spots' as string]: SPOTS_COL }}
      >
        <div role="row" className="hidden md:grid md:grid-cols-[var(--qf-identity)_minmax(0,1fr)_var(--qf-spots)] md:gap-x-3 md:pb-1.5">
          <span role="columnheader" className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">{rowsLabel}</span>
          <span role="columnheader" className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
            Entries open, then play
          </span>
          <span role="columnheader" className="text-right font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">Spots</span>
        </div>

        <div role="rowgroup" className="relative isolate flex flex-col border-t border-border-strong">
          {/* Month gridlines, not per-row rails. A rail under every bar turns a
              short mark into a handle sitting on a slider; vertical ground lets
              a mark mean the date it sits on. */}
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
          {/* The Today rule runs the height of the rowgroup, not each row, so it
              reads as one line through the whole field. It sits only over the
              bar column, which is why the inset uses the same identity and
              spots widths the grid does. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-0 hidden w-px bg-accent-500/70 md:block"
            style={{ left: axisLeft(todayX) }}
          />
          {bars.map((bar, i) => (
            <div
              key={bar.id}
              role="row"
              className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border-subtle py-2 md:grid-cols-[var(--qf-identity)_minmax(0,1fr)_var(--qf-spots)] md:py-1"
            >
              <div role="rowheader" className="flex min-w-0 items-center gap-2 md:order-1">
                {/* Two lines, not an ellipsis. Qualifier names carry the
                    distinguishing part at the end ("... 2026-08-31", "...-V2"),
                    so truncating makes two rows look identical. */}
                <Link href={bar.href} className="line-clamp-2 font-fw-sans text-body-sm font-medium leading-tight text-text-primary hover:text-accent-700">
                  {bar.name}
                </Link>
                <StatusPill tone={qualifierStatusMeta(bar.status).tone} dot={false} size="sm" className="shrink-0">
                  {qualifierStatusMeta(bar.status).label}
                </StatusPill>
              </div>
              <div role="cell" className="text-right font-fw-mono text-body-sm font-medium tabular-nums text-text-primary md:order-3">
                {bar.spots == null ? '–' : bar.spots}
              </div>
              <div role="cell" className="relative col-span-2 h-11 min-w-0 md:order-2 md:col-span-1">
                {bar.offAxis ? (
                  // Say why there is no bar. Plotting it anyway would put a
                  // mark at a date the row does not have, and letting it into
                  // the domain would flatten every other row on the field.
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 bg-surface pr-2 font-fw-sans text-caption text-text-tertiary">
                    Dates outside the plotted range
                  </span>
                ) : (
                  <Bar bar={bar} domain={domain} index={i} reduced={reduced} />
                )}
              </div>
            </div>
          ))}
        </div>

        <div
          aria-hidden="true"
          className="relative mt-1 h-5 md:ml-[calc(var(--qf-identity)+0.75rem)] md:mr-[calc(var(--qf-spots)+0.75rem)]"
        >
          {ticks.map((tick) => {
            // Today owns its own space. A tick label that would land under the
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
