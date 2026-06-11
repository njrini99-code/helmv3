'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayAgendaView
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy `editorial/AgendaView` — a scrollable list
 * of events bucketed by day, each rendered as a FairwayEventCard. The DEFAULT
 * body on the demo (current week is empty; Agenda surfaces the real Feb–Apr
 * events immediately).
 *
 * HONEST-EMPTY (never fabricate):
 *   - range mode, zero events → Fairway EmptyState (coach gets the "New event"
 *     CTA; player gets a calm "check back" line).
 *   - single-day mode, zero events → dim inline "Nothing on the books".
 *
 * The day-bucketing logic mirrors the legacy AgendaView verbatim so grouping +
 * "Today/Tomorrow" labelling stay consistent. `nowRef` is parent-owned (seeded
 * from serverNow) — labels never call Date.now().
 * ========================================================================== */

import * as React from 'react';
import { format, isSameDay, addDays, startOfDay, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';
import { Surface, EmptyState, Button } from '@/components/fairway';
import { CalendarDays } from 'lucide-react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { FairwayEventCard } from './FairwayEventCard';

export interface FairwayAgendaViewProps {
  events: CalendarEvent[];
  /**
   * 'day'   → only events on `focusDate`, under that one date header.
   * 'range' → all events inside [rangeStart, rangeEnd], grouped by day.
   */
  mode: 'day' | 'range';
  focusDate: Date;
  rangeStart?: Date;
  rangeEnd?: Date;
  isCoach: boolean;
  /** eventId → player's RSVP status (player view). */
  userRsvpStatuses?: Map<string, RSVPStatus>;
  onEventClick?: (event: CalendarEvent) => void;
  /** Coach-only CTA on the empty range state ("New event"). */
  onCreateEvent?: () => void;
  /** Parent-owned reference "now" for Today/Tomorrow labels. */
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

function sortByStart(a: CalendarEvent, b: CalendarEvent): number {
  const aT = new Date(a.start_time || a.start_date).getTime();
  const bT = new Date(b.start_time || b.start_date).getTime();
  return aT - bT;
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
    return [
      {
        key: format(focusDate, 'yyyy-MM-dd'),
        date: focusDate,
        label: formatDayLabel(focusDate, nowRef),
        events: dayEvents,
      },
    ];
  }

  // Range mode — group events that fall in [rangeStart, rangeEnd]. Fall back to
  // nowRef-derived bounds, never `new Date()` directly (SSR/CSR divergence).
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

  const ordered = Array.from(buckets.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const b of ordered) b.events.sort(sortByStart);
  return ordered;
}

export function FairwayAgendaView({
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
}: FairwayAgendaViewProps) {
  const buckets = React.useMemo(
    () => bucketEvents(events, mode, focusDate, rangeStart, rangeEnd, nowRef),
    [events, mode, focusDate, rangeStart, rangeEnd, nowRef],
  );

  const totalEvents = buckets.reduce((sum, b) => sum + b.events.length, 0);

  // ── HONEST-EMPTY: range mode, zero events ──────────────────────────────────
  if (mode === 'range' && totalEvents === 0) {
    return (
      <Surface elevation="border" padding="lg" className={className}>
        <EmptyState
          icon={CalendarDays}
          title={isCoach ? 'No upcoming events' : 'Nothing upcoming'}
          description={
            isCoach
              ? 'Schedule the next practice or tournament and it shows up here.'
              : 'Check back when your coach adds events.'
          }
          action={
            isCoach && onCreateEvent ? (
              <Button variant="primary" size="md" onClick={onCreateEvent}>
                New event
              </Button>
            ) : undefined
          }
        />
      </Surface>
    );
  }

  // ── HONEST-EMPTY: single day, zero events ──────────────────────────────────
  if (mode === 'day' && totalEvents === 0) {
    return (
      <div className={cn('rounded-card bg-inset px-5 py-8 text-center', className)}>
        <p className="mb-2 font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
          {formatDayLabel(focusDate, nowRef)}
        </p>
        <p className="font-fw-sans text-body-sm leading-[1.5] text-text-tertiary">
          Nothing on the books for this day.
          {isCoach && onCreateEvent ? (
            <>
              {' '}
              <button
                type="button"
                onClick={onCreateEvent}
                className="font-medium text-accent-600 underline-offset-4 outline-none hover:text-accent-700 hover:underline focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                Schedule something
              </button>
              .
            </>
          ) : null}
        </p>
      </div>
    );
  }

  // ── Populated agenda ───────────────────────────────────────────────────────
  return (
    <div className={cn('flex flex-col gap-7', className)}>
      {buckets.map((bucket) => {
        const bucketIsToday = nowRef ? isSameDay(bucket.date, nowRef) : false;
        // Days strictly before today are rendered at reduced opacity — they are
        // historical record, not actionable upcoming items. `nowRef` is the
        // server-seeded "now" so this stays stable across SSR/CSR.
        const bucketIsPast = nowRef
          ? !bucketIsToday && isBefore(bucket.date, startOfDay(nowRef))
          : false;
        return (
          <section key={bucket.key} aria-label={bucket.label}>
            {/* Day header — eyebrow rule + count. */}
            <div className="mb-3 flex items-center gap-3">
              <p
                className={cn(
                  'font-fw-display text-eyebrow uppercase tracking-[0.12em]',
                  bucketIsToday ? 'text-accent-700' : 'text-text-tertiary',
                )}
              >
                {bucket.label}
              </p>
              <span aria-hidden className="h-px flex-1 bg-border-subtle" />
              <span className="font-fw-mono text-eyebrow uppercase tabular-nums tracking-[0.1em] text-text-tertiary">
                {bucket.events.length} {bucket.events.length === 1 ? 'event' : 'events'}
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {bucket.events.map((ev) => (
                <FairwayEventCard
                  key={ev.id}
                  event={ev}
                  showRsvp={!isCoach}
                  rsvpStatus={userRsvpStatuses?.get(ev.id) ?? null}
                  onClick={onEventClick}
                  isPast={bucketIsPast}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default FairwayAgendaView;
