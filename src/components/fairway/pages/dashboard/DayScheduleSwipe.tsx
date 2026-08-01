'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · DayScheduleSwipe
 * ----------------------------------------------------------------------------
 * The player dashboard's top-slot calendar: ONE day at a time, swipe left /
 * right (or chevrons) to move between days. Replaces the old "You're gaining
 * most …" glass hero (removed by founder decision 2026-07-24 — the hero slot
 * now answers "what's happening today" instead of restating My Standing).
 *
 * Reads the SAME merged today+upcoming feed the bottom DaySchedule card used
 * (dashboard-data.ts payload — no new fetch). Because that feed only carries
 * today-and-forward events, the swipe range is bounded to
 * [today … last day present in the feed] — a past or beyond-feed day would
 * render a false "Nothing scheduled" for days that may well have events, so
 * those days are unreachable here; the header's Calendar link is the full
 * view. Row markup mirrors DaySchedule's rows 1:1 (shared EVENT_TONE /
 * EVENT_LABEL / dayKeyInTz / dayLabel helpers) so the two schedule surfaces
 * can never drift apart visually.
 * ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { m, useReducedMotion } from 'framer-motion';
import { CalendarClock, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { Surface } from '@/components/fairway/surfaces/surface';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { cn } from '@/lib/utils';
import { formatTimeInTz } from '@/lib/utils/timezone';
import {
  EVENT_LABEL,
  EVENT_TONE,
  dayKeyInTz,
  dayLabel,
  type DayScheduleEvent,
} from './DaySchedule';

export interface DayScheduleSwipeProps {
  /** Today + upcoming events, any order (same feed as DaySchedule). */
  events: DayScheduleEvent[];
  /** IANA timezone for day bucketing + time labels (browser fallback). */
  timezone?: string;
  /** "Calendar" link in the header, e.g. `/golf/dashboard/calendar`. */
  viewAllHref?: string;
  /** Upstream fetch failed — show a distinct notice, never a fake clear day. */
  loadError?: boolean;
  className?: string;
}

/** Minimum horizontal drag (px) that counts as a day swipe. */
const SWIPE_THRESHOLD_PX = 48;

/** Day-key (YYYY-MM-DD) + `days` calendar days, pure UTC date math. */
function addDaysToKey(dayKey: string, days: number): string {
  const t = new Date(`${dayKey}T00:00:00Z`).getTime();
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

export function DayScheduleSwipe({
  events,
  timezone,
  viewAllHref,
  loadError = false,
  className,
}: DayScheduleSwipeProps) {
  // Hydration-safe clock/timezone resolution — same pattern as DaySchedule.
  const [tz, setTz] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  /** +1 → arrived by going forward, -1 backward — drives the slide direction. */
  const [direction, setDirection] = useState(1);
  const dragStartX = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const resolved = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTz(resolved);
    setTodayKey(dayKeyInTz(new Date().toISOString(), resolved));
  }, [timezone]);

  const isReady = tz != null && todayKey != null;

  // Events bucketed by day-key once; the swipe just picks a bucket.
  const byDay = useMemo(() => {
    if (!isReady) return new Map<string, DayScheduleEvent[]>();
    const map = new Map<string, DayScheduleEvent[]>();
    for (const event of [...events].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
      const key = dayKeyInTz(event.start_time, tz as string);
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [isReady, events, tz]);

  // Swipe range: today → the last day the feed actually knows about.
  const maxOffset = useMemo(() => {
    if (!isReady) return 0;
    let max = 0;
    for (const key of byDay.keys()) {
      const diff = Math.round(
        (new Date(`${key}T00:00:00Z`).getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) /
          86400000,
      );
      if (diff > max) max = diff;
    }
    return max;
  }, [isReady, byDay, todayKey]);

  // Offsets (from today) that actually hold events — the pager's real content.
  const eventOffsets = useMemo(() => {
    if (!isReady) return [] as number[];
    const out: number[] = [];
    for (const key of byDay.keys()) {
      const diff = Math.round(
        (new Date(`${key}T00:00:00Z`).getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) /
          86400000,
      );
      if (diff >= 0) out.push(diff);
    }
    return out.sort((a, b) => a - b);
  }, [isReady, byDay, todayKey]);

  // Land on the next day that HAS something rather than a blank today.
  //
  // The feed is sparse — measured 4 populated days across a 34-day reachable
  // range, so opening on today showed "Nothing scheduled" and the next real
  // event was six taps away (audit 2026-07-24, P-01). One-day-at-a-time paging
  // only works if it starts where the content is.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (!isReady || landed) return;
    setLanded(true);
    if ((byDay.get(todayKey as string) ?? []).length === 0 && eventOffsets.length > 0) {
      setOffset(eventOffsets[0]!);
    }
  }, [isReady, landed, byDay, todayKey, eventOffsets]);

  const clampedOffset = Math.min(offset, maxOffset);
  const dayKey = isReady ? addDaysToKey(todayKey as string, clampedOffset) : '';
  const dayEvents = byDay.get(dayKey) ?? [];
  const label = isReady ? dayLabel(dayKey, todayKey as string) : '';

  const goto = (next: number) => {
    const clamped = Math.max(0, Math.min(maxOffset, next));
    if (clamped === clampedOffset) return;
    setDirection(clamped > clampedOffset ? 1 : -1);
    setOffset(clamped);
  };

  const headerAction = viewAllHref ? (
    <Link
      href={viewAllHref}
      /* -my-2.5 keeps the visual rhythm while the padding lifts the hit area
         to 44px — it measured 72x20 at every viewport, failing both the touch
         minimum and WCAG 2.2 2.5.8 (audit 2026-07-24, P-15). */
      className="-my-2.5 inline-flex min-h-11 items-center gap-1 px-2 py-2.5 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
    >
      Calendar
      <ChevronRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  ) : undefined;

  return (
    <Surface id="day-schedule-swipe" padding="md" className={cn('flex flex-col', className)}>
      <Surface.Header title="Your schedule" actions={headerAction} />

      {loadError ? (
        <InlineNotice tone="warning" title="Couldn’t load the schedule">
          Refresh to try again, or open the calendar for the full view.
        </InlineNotice>
      ) : !isReady ? (
        <div aria-hidden="true" className="flex flex-col gap-2 py-1">
          <Skeleton className="h-8 w-40 rounded-fw-md" />
          <Skeleton className="h-11 w-full rounded-fw-md" />
          <Skeleton className="h-11 w-full rounded-fw-md" />
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {/* Day switcher row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="font-fw-display text-body font-semibold text-text-primary">
                {label}
              </span>
              {clampedOffset > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goto(0)}
                  className="px-2 text-caption font-medium text-accent-700 hover:text-accent-600"
                >
                  Back to today
                </Button>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {/*
                The feed only carries today-forward, so "previous" is disabled
                at offset 0 and a player tapping back for yesterday's practice
                hit a dead control with no explanation (audit P-29). The reason
                goes in `title` — which becomes the accessible DESCRIPTION —
                not in `aria-label`: the NAME of a control must stay stable
                ("Previous day") whatever state it is in, or the same button
                answers to a different name depending on where you are.
              */}
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Previous day"
                title={
                  clampedOffset === 0
                    ? 'This card only shows today onward. Open the calendar for past days.'
                    : undefined
                }
                disabled={clampedOffset === 0}
                onClick={() => goto(clampedOffset - 1)}
              >
                <ChevronLeft aria-hidden />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Next day"
                title={
                  clampedOffset >= maxOffset
                    ? 'End of the loaded schedule. Open the calendar for later dates.'
                    : undefined
                }
                disabled={clampedOffset >= maxOffset}
                onClick={() => goto(clampedOffset + 1)}
              >
                <ChevronRight aria-hidden />
              </IconButton>
            </div>
          </div>

          {/* Week map — a 7-day strip anchored on the day in view, each chip
              dotted when that day holds events.
              Without it the pager was blind: you could not tell whether the
              next day held anything, so a sparse feed read as an empty
              product, and on desktop the card was a wide box holding one
              centred line with its chevrons ~1,000px from the day label
              (audit 2026-07-24, P-01 / P-14). It doubles as the keyboard
              affordance the chevron-only version never had. */}
          <div
            role="toolbar"
            aria-label="Pick a day"
            aria-orientation="horizontal"
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goto(clampedOffset - 1);
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                goto(clampedOffset + 1);
              }
            }}
            className="-mx-1 flex min-w-0 items-stretch gap-1 overflow-x-auto px-1 pb-1"
          >
            {Array.from({ length: 7 }, (_, i) => {
              // Keep the selected day visible: window follows it once it
              // passes the 4th slot instead of scrolling off the left edge.
              const windowStart = Math.max(0, Math.min(clampedOffset - 3, maxOffset - 6));
              const dayOffset = windowStart + i;
              if (dayOffset > maxOffset) return null;
              const key = addDaysToKey(todayKey as string, dayOffset);
              const count = (byDay.get(key) ?? []).length;
              const selected = dayOffset === clampedOffset;
              const d = new Date(`${key}T00:00:00Z`);
              return (
                // eslint-disable-next-line helm/no-raw-button -- compact day cell inside a toolbar, not a <Button> pill (audit P-01)
                <button
                  key={key}
                  type="button"
                  onClick={() => goto(dayOffset)}
                  aria-current={selected ? 'true' : undefined}
                  aria-label={`${dayLabel(key, todayKey as string)}${
                    count > 0 ? ` — ${count} event${count === 1 ? '' : 's'}` : ' — nothing scheduled'
                  }`}
                  className={cn(
                    'flex min-h-11 flex-1 shrink-0 basis-0 flex-col items-center justify-center gap-1 rounded-fw-sm px-1 py-1.5 transition-colors',
                    selected
                      ? 'bg-accent-700 text-text-on-accent'
                      : 'text-text-tertiary hover:bg-surface-sunken',
                  )}
                >
                  <span className="font-fw-sans text-micro font-medium uppercase tracking-wide">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getUTCDay()]}
                  </span>
                  <span className="font-fw-mono text-caption font-semibold tabular-nums">
                    {d.getUTCDate()}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'h-1 w-1 rounded-full',
                      count > 0
                        ? selected
                          ? 'bg-text-on-accent'
                          : 'bg-accent-600'
                        : 'bg-transparent',
                    )}
                  />
                </button>
              );
            })}
          </div>

          {/* Swipeable day panel — pointer events, chevrons cover non-touch.
              Arrow keys page it for keyboard users. */}
          <div
            aria-live="polite"
            aria-label={`Schedule for ${label}`}
            className="min-w-0 touch-pan-y select-none overflow-hidden rounded-fw-sm"
            onPointerDown={(e) => {
              dragStartX.current = e.clientX;
            }}
            onPointerUp={(e) => {
              const start = dragStartX.current;
              dragStartX.current = null;
              if (start == null) return;
              const dx = e.clientX - start;
              if (dx <= -SWIPE_THRESHOLD_PX) goto(clampedOffset + 1);
              else if (dx >= SWIPE_THRESHOLD_PX) goto(clampedOffset - 1);
            }}
            onPointerCancel={() => {
              dragStartX.current = null;
            }}
          >
            <m.div
              key={dayKey}
              initial={reduce ? false : { opacity: 0, x: 28 * direction }}
              animate={reduce ? undefined : { opacity: 1, x: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              aria-live="polite"
              // Reserve the height of ~2 event rows. Measured heights walked
              // 258 -> 200 -> 271 as you paged, so every swipe shifted the
              // whole page below by up to 71px, and the card visibly SHRANK
              // the moment it finally had content — the empty state was taller
              // than a real day (audit P-17).
              className="min-h-[132px]"
            >
              {dayEvents.length === 0 ? (
                // One line, not a centred three-line illustration. A day with
                // nothing on it should occupy LESS room than a day with
                // something on it, not more.
                <div className="flex items-center gap-2 px-2 py-3">
                  <CalendarClock aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
                  <p className="font-fw-sans text-body-sm text-text-secondary">
                    Nothing scheduled
                    <span className="text-text-tertiary">
                      {clampedOffset === 0 ? ' — a clear day.' : ' for this day yet.'}
                    </span>
                  </p>
                </div>
              ) : (
                <ul aria-label={`Events — ${label}`} className="flex flex-col gap-1">
                  {dayEvents.map((event) => {
                    const tone = EVENT_TONE[event.event_type] ?? 'neutral';
                    const typeLabel = EVENT_LABEL[event.event_type] ?? 'Event';
                    return (
                      <li key={event.id} className="min-w-0">
                        <div className="flex min-w-0 items-start gap-3 rounded-fw-md px-2 py-2 transition-colors duration-base hover:bg-surface-hover">
                          <span
                            className="w-14 shrink-0 pt-0.5 font-fw-mono text-caption tabular-nums text-text-tertiary"
                            suppressHydrationWarning
                          >
                            {formatTimeInTz(event.start_time, tz as string)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                                {event.title}
                              </span>
                              <StatusPill tone={tone} dot={false} size="sm" className="shrink-0">
                                {typeLabel}
                              </StatusPill>
                            </div>
                            {event.location ? (
                              <span className="mt-0.5 flex min-w-0 items-center gap-1 font-fw-sans text-caption text-text-tertiary">
                                <MapPin aria-hidden className="h-3 w-3 shrink-0" />
                                <span className="truncate">{event.location}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </m.div>
          </div>
        </div>
      )}
    </Surface>
  );
}
