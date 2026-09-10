'use client';

/**
 * TodayPanel: the home ledger's schedule column (today's agenda strip, the
 * featured event, the rest of today, then the next three days). Lifted out
 * of FairwayCoachDashboard unchanged in logic when the home was rebuilt on
 * the field-sheet language (docs/design/fairway-facelift/LANGUAGE.md).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Inset, StatusPill, InlineNotice } from '@/components/fairway';
import { AgendaStrip, type AgendaStripEvent } from '@/components/fairway/modules';
import { IconArrowRight, IconClock, IconMapPin } from '@/components/icons';
import { formatTimeInTz, getCurrentDecimalHourInTz } from '@/lib/utils/timezone';
import { cn } from '@/lib/utils';
import type { TodayEvent } from '@/app/golf/actions/dashboard-data';
import { type DayScheduleEvent, dayKeyInTz, dayLabel } from './DaySchedule';

function minutesOfDayInTz(iso: string, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return (hour * 60 + minute) % 1440;
  } catch {
    return 0;
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * One fact in the opener's `meta` row — a leading icon and a count.
 *
 * The ViewHeader `meta` slot already sets the row's voice (caption size,
 * `text-text-tertiary`, wrap + gap), so this adds only the icon pairing and
 * `tabular-nums`. The figures sit next to each other and change between loads;
 * proportional digits would make them shuffle sideways as the numbers move.
 */

const EVENT_TONE: Record<string, 'accent' | 'warning' | 'neutral' | 'info'> = {
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

/** Fields both `TodayEvent` and `DayScheduleEvent` carry — the common shape
 *  the two row renderers below need, so one component serves either source. */
interface ScheduleRowData {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time?: string | null;
  location?: string | null;
  rsvp_yes?: number;
  rsvp_total?: number;
}

/** The single "now/next" event, rendered large (SCREEN "Dominant object"). */
function FeaturedEventRow({ event, tz }: { event: ScheduleRowData; tz: string | null }) {
  const tone = EVENT_TONE[event.event_type] ?? 'neutral';
  const typeLabel = EVENT_LABEL[event.event_type] ?? 'Event';
  return (
    <Inset padding="md" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate font-fw-sans text-h3 font-semibold text-text-primary">
          {event.title}
        </span>
        <StatusPill tone={tone} dot={false}>
          {typeLabel}
        </StatusPill>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-fw-sans text-body-sm text-text-secondary">
        <span className="inline-flex items-center gap-1.5 font-fw-mono tabular-nums" suppressHydrationWarning>
          <IconClock size={14} />
          {tz ? (
            <>
              {formatTimeInTz(event.start_time, tz)}
              {event.end_time ? ` – ${formatTimeInTz(event.end_time, tz)}` : ''}
            </>
          ) : null}
        </span>
        {event.location ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <IconMapPin size={14} />
            <span className="truncate">{event.location}</span>
          </span>
        ) : null}
        {event.rsvp_total !== undefined ? (
          <span className="tabular-nums">
            {event.rsvp_yes ?? 0}/{event.rsvp_total} confirmed
          </span>
        ) : null}
      </div>
    </Inset>
  );
}

/** A compact seam row — used for both "later today" and "next 3 days". */
function QuietEventRow({ event, tz }: { event: ScheduleRowData; tz: string | null }) {
  const tone = EVENT_TONE[event.event_type] ?? 'neutral';
  const typeLabel = EVENT_LABEL[event.event_type] ?? 'Event';
  return (
    <div className="flex min-w-0 items-start gap-3 border-t border-border-subtle px-0.5 py-2 first:border-t-0">
      <span
        className="w-14 shrink-0 pt-0.5 font-fw-mono text-caption tabular-nums text-text-tertiary"
        suppressHydrationWarning
      >
        {tz ? formatTimeInTz(event.start_time, tz) : ''}
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
            <IconMapPin size={12} />
            <span className="truncate">{event.location}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface NextDayGroup {
  key: string;
  label: string;
  events: DayScheduleEvent[];
}

/** Group `events` (today inclusive) into the earliest `limit` day-buckets
 *  AFTER today, using the exact same `dayKeyInTz`/`dayLabel` helpers
 *  DaySchedule's own grouping is built on — so "Tomorrow" / a dated label
 *  here can never disagree with what that primitive would have shown. */
function useNextDayGroups(events: DayScheduleEvent[], tz: string | null, limit: number): NextDayGroup[] {
  return useMemo(() => {
    if (!tz) return [];
    const todayKey = dayKeyInTz(new Date().toISOString(), tz);
    const groups = new Map<string, DayScheduleEvent[]>();
    for (const e of events) {
      const key = dayKeyInTz(e.start_time, tz);
      if (key === todayKey) continue;
      const bucket = groups.get(key);
      if (bucket) bucket.push(e);
      else groups.set(key, [e]);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, limit)
      .map(([key, evs]) => ({
        key,
        label: dayLabel(key, todayKey),
        events: evs.slice().sort((a, b) => a.start_time.localeCompare(b.start_time)),
      }));
  }, [events, tz, limit]);
}

export function TodayPanel({
  todayEvents,
  scheduleEvents,
  scheduleError = false,
  timezone,
}: {
  todayEvents: TodayEvent[];
  scheduleEvents: DayScheduleEvent[];
  scheduleError?: boolean;
  timezone?: string;
}) {
  // Resolve the display timezone on the client (Intl may differ between server
  // and browser); render time labels only after mount to avoid React #418.
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => {
    setTz(timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [timezone]);

  const sortedToday = useMemo(
    () => todayEvents.slice().sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [todayEvents],
  );
  const featured = sortedToday[0];
  const restToday = sortedToday.slice(1);
  const nextDayGroups = useNextDayGroups(scheduleEvents, tz, 3);

  const todayIsClear = sortedToday.length === 0;
  const nothingAtAll = todayIsClear && nextDayGroups.length === 0;

  // AgendaStrip feed (home.v2.md §4) — mount-gated on `tz` exactly like the
  // row labels below (`formatTimeInTz`/`getCurrentDecimalHourInTz`), so
  // server and client never disagree. Same `EVENT_TONE` map every row below
  // already uses — no new tone vocabulary.
  const agendaEvents: AgendaStripEvent[] = useMemo(() => {
    if (!tz) return [];
    return sortedToday.map((event) => {
      const startMinutes = minutesOfDayInTz(event.start_time, tz);
      const endMinutes = event.end_time ? minutesOfDayInTz(event.end_time, tz) : startMinutes;
      return {
        id: event.id,
        label: event.title,
        startMinutes,
        endMinutes: endMinutes >= startMinutes ? endMinutes : startMinutes,
        tone: EVENT_TONE[event.event_type] ?? 'neutral',
      };
    });
  }, [sortedToday, tz]);
  const nowMinutes = tz ? Math.round(getCurrentDecimalHourInTz(tz) * 60) : null;

  return (
    <section aria-label="Today's schedule" className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Today</h2>
          {!scheduleError && sortedToday.length > 0 ? (
            <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              {sortedToday.length}
            </span>
          ) : null}
        </div>
        <Link
          href="/golf/dashboard/calendar"
          className="inline-flex items-center gap-1 py-3 -my-3 font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-600"
        >
          Calendar
          <IconArrowRight size={14} />
        </Link>
      </div>
      {/* Section hairline — more-green ruling: a green rule under the section
          title, not a plain gray one. */}
      <div aria-hidden="true" className="h-px w-full bg-accent-300" />

      {scheduleError ? (
        // Degraded state — the schedule RPC failed. Surface a distinct, quiet
        // "couldn't load" notice so a failed fetch is never mistaken for a
        // genuinely empty day (P009 honesty rule).
        <InlineNotice tone="warning" title="Couldn’t load today’s schedule">
          We hit a snag fetching today’s events. Refresh to try again, or open the
          calendar to see the full schedule.
        </InlineNotice>
      ) : nothingAtAll ? (
        // Right-sized for the COMMON case (audit #64): most days have nothing
        // on the books. coach-home.md: a quiet inline line, never a notice
        // card — no icon, no border, no fill.
        <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">
          Clear schedule today — a good window for practice or recovery.
        </p>
      ) : (
        // BARE seam section end to end (home.v2.md §4 — the Surface wrapper
        // is removed): a genuinely clear day above renders as one quiet
        // line at this same `px-0.5` inset, so "Clear schedule today." below
        // shares that inset too rather than sitting at a boxed card's own
        // indent (REVIEW.md phone row 1 — two left edges in one card).
        <div className="flex flex-1 flex-col gap-3">
          {sortedToday.length > 0 ? (
            <AgendaStrip events={agendaEvents} nowMinutes={nowMinutes} hourLabels={6} />
          ) : null}
          {todayIsClear ? (
            <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">
              Clear schedule today.
            </p>
          ) : (
            <>
              {/* Provably defined here: this branch only renders when
                  `!todayIsClear`, i.e. `sortedToday.length > 0`. */}
              <FeaturedEventRow event={featured!} tz={tz} />
              {restToday.map((event) => (
                <QuietEventRow key={event.id} event={event} tz={tz} />
              ))}
            </>
          )}
          {nextDayGroups.length > 0 ? (
            <div className={cn('flex flex-col gap-2', !todayIsClear && 'mt-2 border-t border-border-subtle pt-2')}>
              <span className="px-0.5 font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
                Next 3 days
              </span>
              {nextDayGroups.map((group) => (
                <div key={group.key} className="flex flex-col">
                  <span className="px-0.5 py-1 font-fw-sans text-caption font-medium text-text-secondary">
                    {group.label}
                  </span>
                  {group.events.map((event) => (
                    <QuietEventRow key={event.id} event={event} tz={tz} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
