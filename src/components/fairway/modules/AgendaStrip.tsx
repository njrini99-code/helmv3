'use client';

/**
 * ============================================================================
 * Fairway · modules · AgendaStrip — the coach-home "Today" hour rail
 * (docs/design/fairway-facelift/screens/home.v2.md §4)
 * ----------------------------------------------------------------------------
 * Today was the dominant object on the coach dashboard and the least visually
 * resolved thing on the page — a plain seam list, no different in shape from
 * a notifications feed. This gives it a real instrument: a labeled hour rail
 * with tone-filled event pills positioned by percentage of the visible range,
 * an optional 2px "now" tick, and a visually-hidden `<ul>` carrying each
 * event's title/time for screen readers (the pills themselves are decorative
 * — color position, not text, so an AT user needs the equivalent list to get
 * anything out of this instrument at all).
 *
 * Tones are the SAME `EVENT_TONE` vocabulary `FairwayCoachDashboard.tsx`
 * already maps event types onto (accent/warning/info/neutral) — no new tone
 * vocabulary is introduced here, only a new visual reading of it.
 *
 * Phone hour-label density: BOTH the desktop (`hourLabels`, default 6) and
 * phone (fixed at 3: first/middle/last of the same visible range) tick sets
 * render into the DOM always; Tailwind's `sm:` breakpoint decides which one
 * paints (same "both stay in the DOM, CSS decides" idiom the coach-home
 * Toolbar uses for its Segmented/Menu window control). No client-only
 * breakpoint detection, so there is nothing here that can disagree between
 * server and client and trip a hydration mismatch.
 *
 * `nowMinutes` is deliberately mount-gated BY THE CALLER (pass `null` until
 * mount, exactly like `TodayPanel`'s own `tz` state) — this component never
 * reads `Date.now()` itself, so it stays a pure function of props and is safe
 * to render on the server.
 *
 * Reduced-motion-guarded entrance (`useReducedMotionGuard`, never raw
 * `useReducedMotion` — see `.claude/rules/design-system.md`), staggered left
 * to right, capped the same way `TickerStrip`/`Filmstrip` cap their own
 * sibling staggers so a busy day still settles well under the motion budget.
 * ========================================================================== */

import { useMemo } from 'react';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { useReducedMotionGuard, EASE_CINEMATIC, DURATION } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import { clampPct } from './logic';

export interface AgendaStripEvent {
  id: string;
  label: string;
  startMinutes: number;
  endMinutes: number;
  tone: 'accent' | 'warning' | 'info' | 'neutral';
}

export interface AgendaStripProps {
  events: AgendaStripEvent[];
  /** Start of the visible range, minutes from midnight. Default 360 (6am). */
  rangeStartMinutes?: number;
  /** End of the visible range, minutes from midnight. Default 1320 (10pm). */
  rangeEndMinutes?: number;
  /** Current time, minutes from midnight. Mount-gated by the caller — pass
   *  `null` until mount so server and client never disagree. */
  nowMinutes?: number | null;
  /** Desktop hour-tick count. Phone always thins to 3 (first/middle/last). Default 6. */
  hourLabels?: number;
  className?: string;
}

/** Same 4-value palette `EVENT_TONE` already uses — no new tone vocabulary. */
const TONE_FILL: Record<AgendaStripEvent['tone'], string> = {
  accent: 'bg-accent-500',
  warning: 'bg-fw-warning',
  info: 'bg-warm-400',
  neutral: 'bg-warm-300',
};

// A wide day can carry a dozen-plus events; a tighter, capped stagger step
// (same idea as TickerStrip/Filmstrip) keeps the whole reveal comfortably
// under the <600ms motion budget.
const STAGGER_STEP = 0.03;
const STAGGER_CAP = 8;
function stagger(i: number): number {
  return Math.min(i, STAGGER_CAP) * STAGGER_STEP;
}

/** A pill floor so a point-in-time (or missing end-time) event never
 *  collapses to a sliver nobody can see or tap. */
const MIN_WIDTH_PCT = 3;

/** "6a" / "12p" / "9p" — compact, lowercase, no space (the rail's own
 *  register; distinct from the full "6:00 AM" labels the row list below it
 *  already renders). */
function compactHourLabel(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const suffix = hour >= 12 ? 'p' : 'a';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

function clockRangeLabel(startMinutes: number, endMinutes: number): string {
  const start = compactHourLabel(startMinutes);
  if (endMinutes <= startMinutes) return start;
  return `${start}–${compactHourLabel(endMinutes)}`;
}

/** `count` (>=2) minutes, evenly spaced by TIME across `[start, end]`, both
 *  ends included. */
function evenTicks(start: number, end: number, count: number): number[] {
  if (end <= start) return [start];
  const n = Math.max(2, count);
  const step = (end - start) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(start + step * i));
}

/**
 * The hour rail. Mount under a "Today" hairline when `events.length > 0` —
 * a rail with zero events is dead space, so a genuinely clear day should stay
 * the caller's existing quiet sentence instead of rendering this at all.
 */
export function AgendaStrip({
  events,
  rangeStartMinutes = 360,
  rangeEndMinutes = 1320,
  nowMinutes = null,
  hourLabels = 6,
  className,
}: AgendaStripProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const span = Math.max(1, rangeEndMinutes - rangeStartMinutes);

  const sorted = useMemo(
    () => events.slice().sort((a, b) => a.startMinutes - b.startMinutes),
    [events],
  );

  const pctFor = (minutes: number) => clampPct(((minutes - rangeStartMinutes) / span) * 100);

  const desktopTicks = useMemo(
    () => evenTicks(rangeStartMinutes, rangeEndMinutes, hourLabels),
    [rangeStartMinutes, rangeEndMinutes, hourLabels],
  );
  const phoneTicks = useMemo(
    () => evenTicks(rangeStartMinutes, rangeEndMinutes, 3),
    [rangeStartMinutes, rangeEndMinutes],
  );

  const nowInRange = nowMinutes != null && nowMinutes >= rangeStartMinutes && nowMinutes <= rangeEndMinutes;

  function tickClassName(i: number, count: number): string {
    if (i === 0) return '';
    if (i === count - 1) return '-translate-x-full';
    return '-translate-x-1/2';
  }

  return (
    <div data-slot="agenda-strip" className={cn('flex flex-col gap-1.5', className)}>
      <LazyMotion features={loadFeatures}>
        {/* The pills + "now" tick are purely decorative — the sr-only list
            below carries the equivalent content for assistive tech. */}
        <div
          aria-hidden="true"
          data-slot="agenda-strip-rail"
          className="relative h-9 overflow-hidden rounded-fw-sm bg-surface-sunken"
        >
          {sorted.map((event, i) => {
            const left = pctFor(event.startMinutes);
            const right = pctFor(Math.max(event.endMinutes, event.startMinutes));
            const width = Math.max(right - left, MIN_WIDTH_PCT);
            return (
              <m.div
                key={event.id}
                data-slot="agenda-strip-event"
                data-tone={event.tone}
                initial={prefersReducedMotion ? false : { opacity: 0, scaleX: 0.6 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: DURATION.short, delay: stagger(i), ease: EASE_CINEMATIC }}
                style={{ left: `${left}%`, width: `${width}%`, transformOrigin: 'left' }}
                className={cn('absolute inset-y-1.5 rounded-fw-sm', TONE_FILL[event.tone])}
              />
            );
          })}
          {nowInRange ? (
            <div
              data-slot="agenda-strip-now"
              style={{ left: `${pctFor(nowMinutes!)}%` }}
              className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-accent-500"
            />
          ) : null}
        </div>
      </LazyMotion>

      <div aria-hidden="true" className="relative h-3.5">
        <div className="absolute inset-0 hidden sm:block">
          {desktopTicks.map((minute, i) => (
            <span
              key={`d-${i}-${minute}`}
              style={{ left: `${pctFor(minute)}%` }}
              className={cn(
                'absolute font-fw-mono text-caption tabular-nums text-text-tertiary',
                tickClassName(i, desktopTicks.length),
              )}
            >
              {compactHourLabel(minute)}
            </span>
          ))}
        </div>
        <div className="absolute inset-0 sm:hidden">
          {phoneTicks.map((minute, i) => (
            <span
              key={`p-${i}-${minute}`}
              style={{ left: `${pctFor(minute)}%` }}
              className={cn(
                'absolute font-fw-mono text-caption tabular-nums text-text-tertiary',
                tickClassName(i, phoneTicks.length),
              )}
            >
              {compactHourLabel(minute)}
            </span>
          ))}
        </div>
      </div>

      <ul className="sr-only">
        {sorted.map((event) => (
          <li key={event.id}>
            {event.label}, {clockRangeLabel(event.startMinutes, event.endMinutes)}
          </li>
        ))}
      </ul>
    </div>
  );
}
