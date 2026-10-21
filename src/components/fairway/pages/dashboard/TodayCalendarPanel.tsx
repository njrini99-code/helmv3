'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · TodayCalendarPanel
 * ----------------------------------------------------------------------------
 * The coach home's "Today" card as a mini calendar: a deep-green header with
 * today's date, a 7-day strip that starts TODAY (not Mon to Sun) with a dot
 * under any day that has an event, then today's agenda as a clean list. On
 * the common empty day it says so plainly and points at the next thing on
 * the calendar ("Next up: …"), built from the first upcoming event.
 *
 * Reads ONLY what dashboard-data.ts already fetched (`todayEvents` and
 * `calendarEvents`, the next 20 future events): no fetch, no mutation.
 *
 * Every calendar-day decision (which day is today, which strip cell an event
 * falls on, the header date) depends on the TEAM timezone, and Intl can differ
 * between the server and the browser. So `tz` and `todayKey` resolve in a
 * `useEffect` after mount, exactly like DaySchedule, and the card paints
 * shape-matched placeholders until then (React #418 hydration guard).
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { IconArrowRight, IconMapPin } from '@/components/icons';
import { InlineNotice, Skeleton, StatusPill } from '@/components/fairway';
import { formatTimeInTz } from '@/lib/utils/timezone';
import { cn } from '@/lib/utils';
import type { TodayEvent } from '@/app/golf/actions/dashboard-data';
import { EVENT_LABEL, EVENT_TONE, dayKeyInTz, dayLabel } from './DaySchedule';

/** Structural shape of `CoachDashboardPayload['calendarEvents'][number]`:
 *  only the fields this card reads. */
export interface UpcomingCalendarEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time?: string | null;
  location?: string | null;
}

export interface TodayCalendarPanelProps {
  /** Today's schedule (coach RPC), with `rsvp_yes` / `rsvp_total`. */
  todayEvents: TodayEvent[];
  /** `enhancedData.calendarEvents`: future events from now, ascending, at
   *  most 20. Feeds the strip dots and the empty state's "Next up". */
  upcomingEvents: UpcomingCalendarEvent[];
  /** True when the today-schedule RPC failed: a distinct "couldn't load"
   *  state, never mistaken for a genuinely clear day. */
  scheduleError?: boolean;
  /** IANA team timezone; falls back to the browser's after mount. */
  timezone?: string;
  className?: string;
}

const CALENDAR_HREF = '/golf/dashboard/calendar';
const STRIP_DAYS = 7;

/** `dateKey` shifted by `days`: pure UTC-anchored calendar math on a
 *  YYYY-MM-DD key, so the strip never drifts with the local clock or DST. */
function shiftDayKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayKey(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

function dayNumber(dateKey: string): string {
  return String(Number(dateKey.slice(8, 10)));
}

export function TodayCalendarPanel({
  todayEvents,
  upcomingEvents,
  scheduleError = false,
  timezone,
  className,
}: TodayCalendarPanelProps) {
  const [tz, setTz] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState<string | null>(null);

  useEffect(() => {
    const resolved = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTz(resolved);
    setTodayKey(dayKeyInTz(new Date().toISOString(), resolved));
  }, [timezone]);

  const sortedToday = useMemo(
    () => [...todayEvents].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [todayEvents],
  );

  // Day keys that carry at least one event (today's + the fetched upcoming).
  const busyDays = useMemo(() => {
    const keys = new Set<string>();
    if (tz == null) return keys;
    for (const e of todayEvents) keys.add(dayKeyInTz(e.start_time, tz));
    for (const e of upcomingEvents) keys.add(dayKeyInTz(e.start_time, tz));
    return keys;
  }, [tz, todayEvents, upcomingEvents]);

  const strip = useMemo(() => {
    if (todayKey == null) return [];
    return Array.from({ length: STRIP_DAYS }, (_, i) => {
      const key = shiftDayKey(todayKey, i);
      return {
        key,
        letter: formatDayKey(key, { weekday: 'narrow' }),
        spoken: formatDayKey(key, { weekday: 'long', month: 'long', day: 'numeric' }),
        day: dayNumber(key),
        busy: busyDays.has(key),
      };
    });
  }, [todayKey, busyDays]);

  // First fetched event that is NOT today (today's own events, if any, are the
  // agenda). `upcomingEvents` is already ascending.
  const nextUp = useMemo(() => {
    if (tz == null || todayKey == null) return null;
    return upcomingEvents.find((e) => dayKeyInTz(e.start_time, tz) !== todayKey) ?? null;
  }, [tz, todayKey, upcomingEvents]);

  return (
    <section
      aria-label="Today's schedule"
      className={cn(
        'flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft',
        className,
      )}
    >
      {/* Deep green header: same plinth as Latest / Team performance / Recent Rounds. */}
      <div className="fw-plinth-green flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Today</h2>
          {todayKey != null ? (
            <span className="truncate font-fw-sans text-body-sm text-text-secondary">
              {formatDayKey(todayKey, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          ) : (
            <Skeleton aria-hidden="true" className="h-3.5 w-20 rounded-fw-sm" />
          )}
        </div>
        <Link
          href={CALENDAR_HREF}
          className="-my-3 inline-flex shrink-0 items-center gap-1 py-3 font-fw-sans text-body-sm font-medium text-text-primary hover:text-accent-ink"
        >
          Calendar
          <IconArrowRight size={14} />
        </Link>
      </div>

      {/* 7-day strip, starting today. Each day is spoken as one phrase; the
          letter / number / dot are its visual parts. */}
      <div className="border-b border-border-subtle px-3 py-3">
        <ol aria-label="Next seven days" className="grid grid-cols-7 gap-1">
          {strip.length > 0
            ? strip.map((cell, i) => {
                const isToday = i === 0;
                return (
                  <li
                    key={cell.key}
                    aria-current={isToday ? 'date' : undefined}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className="sr-only">
                      {cell.spoken}
                      {isToday ? ', today' : ''}
                      {cell.busy ? ', has events' : ''}
                    </span>
                    <span aria-hidden="true" className="font-fw-sans text-caption text-text-tertiary">
                      {cell.letter}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-flex h-8 w-8 items-center justify-center rounded-full font-fw-sans text-body-sm font-semibold tabular-nums',
                        isToday ? 'bg-accent-fill text-text-on-accent-fill shadow-flat' : 'text-text-primary',
                      )}
                    >
                      {cell.day}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-1 w-1 rounded-full',
                        cell.busy ? (isToday ? 'bg-accent-fill' : 'bg-text-secondary') : 'bg-transparent',
                      )}
                    />
                  </li>
                );
              })
            : Array.from({ length: STRIP_DAYS }, (_, i) => (
                <li key={i} aria-hidden="true" className="flex flex-col items-center gap-1">
                  <Skeleton className="h-4 w-3 rounded-fw-sm" />
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <span className="h-1 w-1" />
                </li>
              ))}
        </ol>
      </div>

      {scheduleError ? (
        // Degraded state: the schedule RPC failed. Never let a failed fetch
        // read as a genuinely empty day (P009 honesty rule).
        <div className="p-3">
          <InlineNotice tone="warning" title="Couldn’t load today’s schedule">
            Refresh to try again, or open the calendar for the full schedule.
          </InlineNotice>
        </div>
      ) : sortedToday.length === 0 ? (
        <EmptyToday nextUp={nextUp} tz={tz} todayKey={todayKey} />
      ) : (
        <ul aria-label="Today's agenda" className="flex flex-col divide-y divide-border-subtle">
          {sortedToday.map((event) => {
            const tone = EVENT_TONE[event.event_type] ?? 'neutral';
            const typeLabel = EVENT_LABEL[event.event_type] ?? 'Event';
            // "0/0 confirmed" on an event nobody was asked to RSVP to is noise.
            const hasRsvps = event.rsvp_total != null && event.rsvp_total > 0;
            return (
              <li key={event.id} className="flex items-start gap-3 px-4 py-3">
                {/* Time column: fixed width so titles line up down the list. */}
                <div className="flex w-[4.5rem] shrink-0 flex-col pt-px font-fw-sans text-body-sm tabular-nums">
                  {tz ? (
                    <>
                      <span className="font-medium text-text-primary">{formatTimeInTz(event.start_time, tz)}</span>
                      {event.end_time ? (
                        <span className="text-caption text-text-tertiary">{formatTimeInTz(event.end_time, tz)}</span>
                      ) : null}
                    </>
                  ) : (
                    <Skeleton aria-hidden="true" className="h-3.5 w-14 rounded-fw-sm" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate font-fw-sans text-body font-medium text-text-primary">
                      {event.title}
                    </span>
                    <StatusPill tone={tone} dot={false} size="sm" className="shrink-0">
                      {typeLabel}
                    </StatusPill>
                  </div>
                  {event.location || hasRsvps ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-fw-sans text-caption text-text-tertiary">
                      {event.location ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <IconMapPin size={12} />
                          <span className="truncate">{event.location}</span>
                        </span>
                      ) : null}
                      {hasRsvps ? (
                        <span className="tabular-nums">
                          {event.rsvp_yes ?? 0}/{event.rsvp_total} confirmed
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * The everyday state (most days have nothing booked), sized to the message:
 * an icon, one line that says the day is clear, and the next thing on the
 * calendar so the card still answers "what's coming". Same anatomy as the
 * Latest card's "You're all caught up" state beside it.
 */
function EmptyToday({
  nextUp,
  tz,
  todayKey,
}: {
  nextUp: UpcomingCalendarEvent | null;
  tz: string | null;
  todayKey: string | null;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-4">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-surface-sunken text-text-secondary ring-1 ring-inset ring-border-subtle"
      >
        <CalendarDays size={18} strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-fw-sans text-body font-semibold text-text-primary">Nothing scheduled today</p>
        {tz == null || todayKey == null ? (
          <Skeleton aria-hidden="true" className="my-1 h-3.5 w-48 max-w-full rounded-fw-sm" />
        ) : nextUp ? (
          <p className="font-fw-sans text-body-sm text-text-secondary">
            Next up: <span className="font-medium text-text-primary">{nextUp.title}</span>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            <span className="whitespace-nowrap tabular-nums">
              {dayLabel(dayKeyInTz(nextUp.start_time, tz), todayKey)} {formatTimeInTz(nextUp.start_time, tz)}
            </span>
          </p>
        ) : (
          <p className="font-fw-sans text-body-sm text-text-secondary">No upcoming events on the calendar.</p>
        )}
        <Link
          href={CALENDAR_HREF}
          // py-3 makes a 44px touch target; the negative margins give the
          // padding back so the link sits close under the line above.
          className="-mb-3 -mt-1 inline-flex w-fit items-center gap-1 py-3 font-fw-sans text-body-sm font-medium text-text-primary underline decoration-border-strong underline-offset-4 hover:decoration-text-secondary"
        >
          Add to calendar
          <IconArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
