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
      className="inline-flex items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
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
                  className="min-h-0 px-2 py-0.5 text-caption font-medium text-accent-700 hover:text-accent-600"
                >
                  Back to today
                </Button>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Previous day"
                disabled={clampedOffset === 0}
                onClick={() => goto(clampedOffset - 1)}
              >
                <ChevronLeft aria-hidden />
              </IconButton>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Next day"
                disabled={clampedOffset >= maxOffset}
                onClick={() => goto(clampedOffset + 1)}
              >
                <ChevronRight aria-hidden />
              </IconButton>
            </div>
          </div>

          {/* Swipeable day panel — pointer events, chevrons cover non-touch. */}
          <div
            className="min-w-0 touch-pan-y select-none overflow-hidden"
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
            >
              {dayEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 py-6 text-center">
                  <CalendarClock aria-hidden className="h-5 w-5 text-text-tertiary" />
                  <p className="font-fw-sans text-body-sm font-medium text-text-secondary">
                    Nothing scheduled
                  </p>
                  <p className="font-fw-sans text-caption text-text-tertiary">
                    {clampedOffset === 0
                      ? 'A clear day — new events will show up here.'
                      : 'Nothing on the books for this day yet.'}
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

export default DayScheduleSwipe;
