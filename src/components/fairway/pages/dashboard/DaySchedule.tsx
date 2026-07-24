'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · DaySchedule
 * ----------------------------------------------------------------------------
 * Replaces the player's "Action center" (tasks/RSVP/announcements/trips) and
 * the coach's "Action Items" (tasks/deadlines/announcements) cards on both
 * home dashboards with one honest agenda: a scrollable timeline of the day's
 * events plus what's coming up, grouped by day. Full task/RSVP/trip
 * management still lives at Team Hub, and the full calendar at Calendar —
 * this card answers one question fast: "what's happening, and when."
 *
 * Reads ONLY events already fetched by dashboard-data.ts (today's schedule +
 * upcoming calendar events, merged/deduped by the caller) — no new fetch, no
 * mutation, no write path.
 *
 * Grouping ("Today" / "Tomorrow" / a dated later-group) resolves the caller's
 * `timezone` (falling back to the browser's) on the CLIENT after mount, same
 * hydration-safe pattern as TodayPanel/ActionItemsPanel elsewhere in this
 * folder — the list itself renders immediately; only the day labels + time
 * text wait one client render for a stable "today" reference.
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight, MapPin } from 'lucide-react';
import { Surface } from '@/components/fairway/surfaces/surface';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import type { FwStatusTone } from '@/components/fairway/controls/_internal';
import { cn } from '@/lib/utils';
import { formatTimeInTz } from '@/lib/utils/timezone';

export interface DayScheduleEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time?: string | null;
  location?: string | null;
}

export interface DayScheduleProps {
  /** The day's + upcoming events, any order — sorted here by start_time. */
  events: DayScheduleEvent[];
  /** IANA timezone for day-bucketing + time labels. Falls back to the
   *  browser's own resolved timezone when omitted. */
  timezone?: string;
  title?: string;
  subtitle?: string;
  /** "Calendar" link in the header, e.g. `/golf/dashboard/calendar`. */
  viewAllHref?: string;
  /** True when the upstream schedule fetch failed — a distinct "couldn't
   *  load" notice, never mistaken for a genuinely clear schedule. */
  loadError?: boolean;
  className?: string;
}

const EVENT_TONE: Record<string, FwStatusTone> = {
  practice: 'info',
  tournament: 'warning',
  qualifier: 'accent',
  meeting: 'neutral',
  travel: 'info',
  workout: 'warning',
  game: 'accent',
  scrimmage: 'accent',
  class: 'info',
  other: 'neutral',
};

const EVENT_LABEL: Record<string, string> = {
  practice: 'Practice',
  tournament: 'Tournament',
  qualifier: 'Qualifier',
  meeting: 'Meeting',
  travel: 'Travel',
  workout: 'Workout',
  game: 'Match',
  scrimmage: 'Scrimmage',
  class: 'Class',
  other: 'Event',
};

/** More rows than this and the list caps its height + fades at the bottom —
 *  a subtle "there's more, scroll" affordance rather than an unbounded card. */
const VISIBLE_ROW_THRESHOLD = 5;

/** YYYY-MM-DD for the given instant, in `tz`. Used only to bucket events by
 *  calendar day — never rendered raw. */
function dayKeyInTz(iso: string, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(iso));
    const y = parts.find((p) => p.type === 'year')?.value ?? '';
    const m = parts.find((p) => p.type === 'month')?.value ?? '';
    const d = parts.find((p) => p.type === 'day')?.value ?? '';
    return y && m && d ? `${y}-${m}-${d}` : iso.slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

/** "Today" / "Tomorrow" / a short dated label ("Wed, Jul 24") for a day-key
 *  relative to `todayKey`. Both are UTC-anchored date-only strings so the
 *  diff is pure calendar-day math, never local-clock drift. */
function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  const d = new Date(`${dateKey}T00:00:00Z`).getTime();
  const t = new Date(`${todayKey}T00:00:00Z`).getTime();
  if (Number.isNaN(d) || Number.isNaN(t)) return dateKey;
  const diffDays = Math.round((d - t) / 86400000);
  if (diffDays === 1) return 'Tomorrow';
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

interface DayGroup {
  key: string;
  label: string;
  events: DayScheduleEvent[];
}

function groupByDay(events: DayScheduleEvent[], tz: string, todayKey: string): DayGroup[] {
  const groups = new Map<string, DayScheduleEvent[]>();
  for (const event of events) {
    const key = dayKeyInTz(event.start_time, tz);
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, evs]) => ({ key, label: dayLabel(key, todayKey), events: evs }));
}

export function DaySchedule({
  events,
  timezone,
  title = 'Schedule',
  subtitle = 'Today & upcoming',
  viewAllHref,
  loadError = false,
  className,
}: DayScheduleProps) {
  // Resolve the display timezone + "today" on the client after mount — same
  // hydration-safe pattern TodayPanel uses (server clock ≠ browser clock).
  const [tz, setTz] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState<string | null>(null);

  useEffect(() => {
    const resolved = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTz(resolved);
    setTodayKey(dayKeyInTz(new Date().toISOString(), resolved));
  }, [timezone]);

  const sorted = useMemo(
    () => [...events].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [events],
  );

  const isReady = tz != null && todayKey != null;
  const groups = useMemo(
    () => (isReady ? groupByDay(sorted, tz as string, todayKey as string) : []),
    [isReady, sorted, tz, todayKey],
  );

  const isEmpty = isReady && sorted.length === 0;
  const showFade = sorted.length > VISIBLE_ROW_THRESHOLD;

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
    <Surface id="day-schedule" padding="md" className={cn('flex flex-col', className)}>
      <Surface.Header title={title} subtitle={loadError ? undefined : subtitle} actions={headerAction} />

      {loadError ? (
        <InlineNotice tone="warning" title="Couldn’t load the schedule">
          Refresh to try again, or open the calendar for the full view.
        </InlineNotice>
      ) : !isReady ? (
        <div aria-hidden="true" className="flex flex-col gap-2 py-1">
          <Skeleton className="h-11 w-full rounded-fw-md" />
          <Skeleton className="h-11 w-full rounded-fw-md" />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
          <CalendarClock aria-hidden className="h-5 w-5 text-text-tertiary" />
          <p className="font-fw-sans text-body-sm font-medium text-text-secondary">
            Nothing scheduled
          </p>
          <p className="font-fw-sans text-caption text-text-tertiary">
            New practices, matches and events will show up here.
          </p>
        </div>
      ) : (
        <div className="relative min-w-0">
          {/* Capped height + its own scroll region once the agenda outgrows a
              calm at-a-glance size (VISIBLE_ROW_THRESHOLD) — CONTAIN, not an
              ever-growing card. `overscroll-contain` keeps a mouse-wheel
              scroll here from bleeding into the page behind it. */}
          <ul
            aria-label={`${title} — day groups`}
            className="flex max-h-[360px] flex-col gap-4 overflow-y-auto overscroll-contain pr-1"
          >
            {groups.map((group) => (
              <li key={group.key} className="flex min-w-0 flex-col gap-1.5">
                <span className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
                  {group.label}
                </span>
                <ul className="flex flex-col gap-1">
                  {group.events.map((event) => {
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
              </li>
            ))}
          </ul>
          {showFade ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-fw-md bg-gradient-to-t from-surface to-transparent"
            />
          ) : null}
        </div>
      )}
    </Surface>
  );
}

export default DaySchedule;
