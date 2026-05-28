'use client';

/**
 * AgendaView — editorial scrollable list of events grouped by day.
 *
 * Used in two places:
 *   1. As the body when the GolfTabBar is set to "Agenda"
 *   2. Beneath the DayStrip in Day/Week mode to show the focused day's
 *      events in detail
 *
 * Empty period renders the shared `<EmptyState type="calendar" />` card;
 * empty single-day renders a softer inline message.
 */

import * as React from 'react';
import { format, isSameDay, addDays, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/ui/reveal';
import { EmptyState } from '@/components/ui/empty-state';
import { EventChip } from './EventChip';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';

interface AgendaViewProps {
  events: CalendarEvent[];
  /**
   * Mode controls grouping:
   *   - 'day' shows only events on `focusDate`, grouped under that one date.
   *   - 'range' groups all events by their date inside the visible window.
   */
  mode: 'day' | 'range';
  focusDate: Date;
  /** Range bounds (inclusive). Only used when mode === 'range'. */
  rangeStart?: Date;
  rangeEnd?: Date;
  isCoach: boolean;
  /** Map of eventId → user's RSVP status (player view). */
  userRsvpStatuses?: Map<string, RSVPStatus>;
  onEventClick?: (event: CalendarEvent) => void;
  /** Optional CTA on the empty state — e.g. "Create event" for coaches. */
  onCreateEvent?: () => void;
  /**
   * Reference "now" (parent-owned) used to label "Today" / "Tomorrow" day
   * headers without calling `Date.now()` inside this component. Keeping the
   * "now" frozen for the first render avoids hydration mismatches when the
   * server and client clocks straddle midnight.
   */
  nowRef?: Date;
  className?: string;
}

interface DayBucket {
  key: string;
  date: Date;
  label: string;
  events: CalendarEvent[];
}

function formatDayLabel(date: Date, nowRef?: Date): string {
  if (nowRef) {
    if (isSameDay(date, nowRef)) return 'Today';
    if (isSameDay(date, addDays(nowRef, 1))) return 'Tomorrow';
  }
  return format(date, 'EEEE, MMMM d');
}

function bucketEvents(
  events: CalendarEvent[],
  mode: 'day' | 'range',
  focusDate: Date,
  rangeStart?: Date,
  rangeEnd?: Date,
  nowRef?: Date,
): DayBucket[] {
  if (mode === 'day') {
    const dayEvents = events
      .filter((ev) => {
        const start = ev.start_date || ev.start_time;
        if (!start) return false;
        return isSameDay(new Date(start), focusDate);
      })
      .sort(sortByStart);
    return [{
      key: format(focusDate, 'yyyy-MM-dd'),
      date: focusDate,
      label: formatDayLabel(focusDate, nowRef),
      events: dayEvents,
    }];
  }

  // Range mode — group all events that fall in [rangeStart, rangeEnd].
  // Fall back to nowRef (or epoch-stable bounds) if range bounds aren't set,
  // never `new Date()` directly — that would diverge across SSR/CSR.
  const fallback = nowRef ?? focusDate;
  const start = rangeStart ? startOfDay(rangeStart) : startOfDay(addDays(fallback, -7));
  const end = rangeEnd ? startOfDay(rangeEnd) : startOfDay(addDays(fallback, 30));
  const buckets = new Map<string, DayBucket>();

  for (const ev of events) {
    const startStr = ev.start_date || ev.start_time;
    if (!startStr) continue;
    const evDate = startOfDay(new Date(startStr));
    if (evDate < start || evDate > end) continue;
    const key = format(evDate, 'yyyy-MM-dd');
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.events.push(ev);
    } else {
      buckets.set(key, {
        key,
        date: evDate,
        label: formatDayLabel(evDate, nowRef),
        events: [ev],
      });
    }
  }

  // Sort each bucket's events by start time, then sort buckets chronologically.
  const ordered = Array.from(buckets.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const b of ordered) b.events.sort(sortByStart);
  return ordered;
}

function sortByStart(a: CalendarEvent, b: CalendarEvent): number {
  const aT = new Date(a.start_time || a.start_date).getTime();
  const bT = new Date(b.start_time || b.start_date).getTime();
  return aT - bT;
}

export function AgendaView({
  events,
  mode,
  focusDate,
  rangeStart,
  rangeEnd,
  isCoach,
  userRsvpStatuses,
  onEventClick,
  onCreateEvent,
  nowRef,
  className,
}: AgendaViewProps) {
  const buckets = React.useMemo(
    () => bucketEvents(events, mode, focusDate, rangeStart, rangeEnd, nowRef),
    [events, mode, focusDate, rangeStart, rangeEnd, nowRef],
  );

  const totalEvents = buckets.reduce((sum, b) => sum + b.events.length, 0);

  // ---- Empty period (range mode, zero events) ----
  if (mode === 'range' && totalEvents === 0) {
    return (
      <div className={cn('mt-6', className)}>
        <Reveal>
          <div className="surface-stone rounded-3xl">
            <EmptyState
              type="calendar"
              variant="card"
              action={isCoach && onCreateEvent ? (
                <button
                  type="button"
                  onClick={onCreateEvent}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-5 py-2 text-body-sm font-medium text-white transition-all hover:bg-primary-700"
                >
                  Create event
                </button>
              ) : undefined}
            />
          </div>
        </Reveal>
      </div>
    );
  }

  // ---- Empty single day (softer inline message) ----
  if (mode === 'day' && totalEvents === 0) {
    return (
      <div className={cn('mt-4 md:mt-5', className)}>
        <Reveal>
          <div className="rounded-2xl border border-warm-200/45 bg-cream-50/55 px-5 py-8 text-center">
            <p className="font-serif uppercase text-eyebrow tracking-[0.16em] text-warm-500 mb-2">
              {formatDayLabel(focusDate, nowRef)}
            </p>
            <p className="text-body-sm text-warm-500 leading-[1.55]">
              Nothing on the books for this day.
              {isCoach && onCreateEvent && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={onCreateEvent}
                    className="text-primary-700 font-medium hover:text-primary-800 underline-offset-4 hover:underline"
                  >
                    Schedule something
                  </button>
                  .
                </>
              )}
            </p>
          </div>
        </Reveal>
      </div>
    );
  }

  // ---- Populated agenda ----
  return (
    <div className={cn('mt-4 md:mt-5 space-y-7', className)}>
      {buckets.map((bucket, bi) => (
        <Reveal key={bucket.key} staggerIndex={Math.min(bi, 4)}>
          <section aria-label={bucket.label}>
            {/* Day header — editorial eyebrow rule above each day. */}
            <div className="flex items-center gap-3 mb-3">
              <p className={cn(
                'font-serif uppercase text-eyebrow tracking-[0.16em]',
                nowRef && isSameDay(bucket.date, nowRef) ? 'text-primary-700' : 'text-warm-500',
              )}>
                {bucket.label}
              </p>
              <span className="flex-1 h-px bg-warm-200/55" aria-hidden />
              <span className="font-serif uppercase text-eyebrow tracking-[0.12em] text-warm-400 tabular-nums">
                {bucket.events.length} {bucket.events.length === 1 ? 'event' : 'events'}
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {bucket.events.map((ev) => (
                <EventChip
                  key={ev.id}
                  event={ev}
                  showRsvp={!isCoach}
                  rsvpStatus={userRsvpStatuses?.get(ev.id) ?? null}
                  onClick={onEventClick}
                />
              ))}
            </div>
          </section>
        </Reveal>
      ))}
    </div>
  );
}
