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
 *
 * NATIVE LIST DETAILS: each day is a raised group card of hairline-divided
 * rows; its heading pins under the masthead while the day scrolls (the
 * masthead publishes `--fw-calendar-hero-h`); today's group carries a
 * now-line at its sorted position, ticking by the minute after mount.
 * ========================================================================== */

import * as React from 'react';
import { format, isSameDay, addDays, startOfDay, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';
import { Surface, EmptyState, Button } from '@/components/fairway';
import { CalendarDays, History } from 'lucide-react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { eventDaySpan, formatEventTime } from '@/lib/calendar/timezone';
import { FairwayEventCard } from './FairwayEventCard';

/** The raised day group: THE card material — hairline, lit top edge, and the
 *  raised whisper — so each day's schedule sits up off the canvas. */
const DAY_GROUP_CLASS =
  'overflow-hidden rounded-xl border border-border-subtle bg-surface [box-shadow:inset_0_1px_0_oklch(1_0_0/0.55),var(--fw-shadow-soft)]';

/** Hairline dividers between rows: 1px, and a true half-pixel on 2x+ screens. */
const ROW_DIVIDERS_CLASS =
  '[&>*+*]:border-t [&>*+*]:border-border-subtle [@media(min-resolution:2dppx)]:[&>*+*]:border-t-[0.5px]';

/** Day headings pin under the masthead while their day scrolls — the same
 *  pinned section header a native list has. The masthead publishes its own
 *  height (`--fw-calendar-hero-h`); the shell publishes the bar offsets. */
const STICKY_HEADING_CLASS =
  'sticky z-[8] top-[calc(var(--golf-mobile-header-offset,0px)+var(--fw-hub-subnav-offset,0px)+var(--fw-calendar-hero-h,0px))] ' +
  '-mx-4 px-4 md:-mx-6 md:px-6 ' +
  'bg-[color-mix(in_oklch,var(--fw-color-canvas)_88%,transparent)] backdrop-blur-md ' +
  '[@media(prefers-reduced-transparency:reduce)]:bg-canvas [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-0';

/** A minute-resolution clock that only starts AFTER mount, so the server and
 *  the first client render agree (they both see `null` and fall back to the
 *  parent's seeded `nowRef`). */
function useMinuteClock(): Date | null {
  const [clock, setClock] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setClock(new Date());
    const id = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return clock;
}

function eventStartMs(event: CalendarEvent): number {
  return new Date(event.start_time || event.start_date).getTime();
}

/** The "now" rule inside today's group: a dot, a hairline, the current time in
 *  the team's zone — sitting between what has started and what is next. */
function NowLine({ now, timezone }: { now: Date; timezone?: string | null }) {
  return (
    <div
      role="separator"
      data-testid="agenda-now-line"
      aria-label={`Now, ${formatEventTime(now.toISOString(), timezone)}`}
      className="flex items-center gap-2 bg-surface px-3 py-1 md:px-4"
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent-600 ring-2 ring-surface" />
      <span aria-hidden className="h-px flex-1 bg-accent-600/60" />
      <span className="font-fw-sans text-caption font-semibold tabular-nums text-accent-700">
        {formatEventTime(now.toISOString(), timezone)}
      </span>
    </div>
  );
}

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
  /** Human name of the range ("September 2026") for the honest-empty copy,
   *  so an empty month never reads as "nothing upcoming, ever". */
  periodLabel?: string;
  isCoach: boolean;
  /** eventId → player's RSVP status (player view). */
  userRsvpStatuses?: Map<string, RSVPStatus>;
  /** Team's canonical IANA timezone — forwarded to each FairwayEventCard so
   *  displayed times are deterministic across server/client (audit W1). */
  timezone?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  /** Coach-only CTA on the empty range state ("New event"). */
  onCreateEvent?: () => void;
  /** Parent-owned reference "now" for Today/Tomorrow labels. */
  nowRef?: Date;
  /**
   * True while the fetch covering the CURRENTLY VISIBLE range is still in
   * flight. Without it, "zero events" and "haven't asked yet" are the same
   * observation here: an uncovered range genuinely holds no matching rows
   * until its fetch resolves, so the honest-empty branch fires immediately and
   * the user reads "Check back when your coach adds events" while a "Loading
   * events for this date range…" banner sits directly above it. Suppress the
   * confirmed-empty COPY while this is true; the parent's banner already says
   * what is happening.
   */
  isLoadingRange?: boolean;
  className?: string;
}

interface DayBucket {
  key: string;
  date: Date;
  label: string;
  events: CalendarEvent[];
}

/** A quiet "in 3 days" beside a heading within the coming week (Today and
 *  Tomorrow are already the heading itself). */
function relativeDayCue(date: Date, nowRef?: Date): string | null {
  if (!nowRef) return null;
  const days = Math.round((startOfDay(date).getTime() - startOfDay(nowRef).getTime()) / 86_400_000);
  if (days === -1) return 'Yesterday';
  if (days >= 2 && days <= 6) return `in ${days} days`;
  return null;
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
  timezone?: string | null,
): DayBucket[] {
  if (mode === 'day') {
    const dayEvents = events
      .filter((ev) => {
        const span = eventDaySpan(ev, timezone);
        if (!span) return false;
        // An event belongs to every day it RUNS, not only the day it starts.
        // This used to be `isSameDay(startDay, focusDate)`, so the Saturday of
        // a four-day tournament rendered "Nothing on the books for this day".
        return (
          (isSameDay(span.first, focusDate) || span.first < focusDate) &&
          (isSameDay(span.last, focusDate) || span.last > focusDate)
        );
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
    // `eventDaySpan` uses `eventCalendarDay`, not `startOfDay(new Date(...))`
    // — the DEFAULT agenda view (mode="range") is what's actually SSR'd on
    // first paint (see FairwayCalendar's initial `view` state), so this bucket
    // key/date is directly hydration-sensitive: reading the CALLING PROCESS's
    // own local zone put an event within ~4-5h of midnight ET in a DIFFERENT
    // day bucket — with a DIFFERENT rendered header string via `formatDayLabel`
    // below — between the SSR pass (Vercel, UTC) and the first client render,
    // tripping React #418.
    const span = eventDaySpan(ev, timezone);
    if (!span) continue;

    // Every day the event runs gets a row, clamped to the requested window so
    // the loop is bounded by the range rather than by the event.
    let cursor = span.first < start ? start : span.first;
    const stop = span.last > end ? end : span.last;
    while (cursor <= stop) {
      const key = format(cursor, 'yyyy-MM-dd');
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.events.push(ev);
      } else {
        buckets.set(key, {
          key,
          date: cursor,
          label: formatDayLabel(cursor, nowRef),
          events: [ev],
        });
      }
      cursor = addDays(cursor, 1);
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
  periodLabel,
  isCoach,
  userRsvpStatuses,
  timezone,
  onEventClick,
  onCreateEvent,
  nowRef,
  isLoadingRange = false,
  className,
}: FairwayAgendaViewProps) {
  const buckets = React.useMemo(
    () => bucketEvents(events, mode, focusDate, rangeStart, rangeEnd, nowRef, timezone),
    [events, mode, focusDate, rangeStart, rangeEnd, nowRef, timezone],
  );

  const totalEvents = buckets.reduce((sum, b) => sum + b.events.length, 0);
  const clock = useMinuteClock();

  // Past/upcoming split for the "Show earlier" affordance (audit P-05).
  // Day mode is a single explicit date, so it never hides anything.
  const [showPast, setShowPast] = React.useState(false);
  const todayStartRef = nowRef ? startOfDay(nowRef) : null;
  const pastBuckets = React.useMemo(
    () =>
      mode === 'range' && todayStartRef
        ? buckets.filter((b) => isBefore(b.date, todayStartRef))
        : [],
    [buckets, mode, todayStartRef],
  );
  // Counted as UNIQUE events, not day appearances: a three-day tournament in
  // history is one earlier event, not three.
  const pastEventCount = new Set(pastBuckets.flatMap((b) => b.events.map((e) => e.id))).size;
  // If EVERYTHING in range is past (the all-past demo season), collapsing would
  // leave an empty list under a "Show earlier" button — show them instead.
  const allPast = pastBuckets.length === buckets.length;
  const visibleBuckets =
    mode === 'range' && !showPast && !allPast
      ? buckets.filter((b) => !pastBuckets.includes(b))
      : buckets;

  // ── Anchor scroll to today/next-upcoming on genuine navigation ─────────────
  // Range mode's window spans months back AND forward (up to ±3 for Agenda),
  // so with no anchor the DOM's natural scroll position is simply the TOP of
  // the list — the oldest bucket in range, which can easily be six-plus weeks
  // in the past. That reads as "the event list skips to a stale event"
  // because a real near-term event is buried below a wall of history the
  // user never asked to see first. We anchor to the first bucket at/after
  // today whenever the visible range actually changes (not on every data
  // refresh — `navKey` below is deliberately narrower than `buckets`' own
  // deps so a realtime-triggered refetch mid-read can't yank the scroll
  // position back to the anchor).
  const bucketNodesRef = React.useRef<Map<string, HTMLElement>>(new Map());
  const lastAnchoredNavKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (mode !== 'range') return;
    const navKey = [
      mode,
      focusDate.getTime(),
      rangeStart?.getTime() ?? '',
      rangeEnd?.getTime() ?? '',
    ].join('|');
    if (lastAnchoredNavKeyRef.current === navKey) return;
    lastAnchoredNavKeyRef.current = navKey;
    if (!nowRef) return;
    const todayStart = startOfDay(nowRef);
    const anchorBucket = buckets.find((b) => !isBefore(b.date, todayStart));
    if (!anchorBucket) return; // all-past range (e.g. the honest-empty demo) — top is correct.
    // Past buckets are collapsed by default, so on a fresh load the anchor is
    // usually already the FIRST visible bucket — there is nothing to scroll
    // past, and scrolling the document anyway only hid the calendar masthead
    // (audit 2026-09-02, UI-2/UI-3: fresh loads landed 130–386px down).
    if (visibleBuckets[0]?.key === anchorBucket.key) return;
    const node = bucketNodesRef.current.get(anchorBucket.key);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'start' });
    }
  }, [mode, focusDate, rangeStart, rangeEnd, nowRef, buckets, visibleBuckets]);

  // ── STILL ASKING: the visible range's fetch has not resolved ───────────────
  // Zero events here does not mean empty, it means unqueried. Render neutral
  // placeholder rows rather than the confirmed-empty copy below.
  if (totalEvents === 0 && isLoadingRange) {
    return (
      <Surface elevation="border" padding="lg" className={cn('[box-shadow:inset_0_1px_0_oklch(1_0_0/0.55),var(--fw-shadow-soft)]', className)}>
        <div aria-hidden="true" className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 rounded-fw-md bg-surface-sunken px-4 py-3">
              <div className="mt-0.5 h-4 w-4 shrink-0 animate-pulse rounded-full bg-border-subtle" />
              <div className="flex flex-1 flex-col gap-2">
                <div
                  className="h-3.5 animate-pulse rounded bg-border-subtle"
                  style={{ maxWidth: `${68 - i * 14}%` }}
                />
                <div className="h-3 w-24 animate-pulse rounded bg-border-subtle" />
              </div>
            </div>
          ))}
        </div>
      </Surface>
    );
  }

  // ── HONEST-EMPTY: range mode, zero events ──────────────────────────────────
  if (mode === 'range' && totalEvents === 0) {
    return (
      // Compact on purpose: a phone never gets a full-screen monolith card
      // for "nothing here" (design-system quality bar).
      <Surface elevation="border" padding="md" className={cn('rounded-xl [box-shadow:inset_0_1px_0_oklch(1_0_0/0.55),var(--fw-shadow-soft)]', className)}>
        <EmptyState
          variant="subtle"
          icon={CalendarDays}
          title={periodLabel ? `Nothing in ${periodLabel}` : isCoach ? 'No upcoming events' : 'Nothing upcoming'}
          description={
            isCoach
              ? 'Schedule a practice or tournament and it shows up here.'
              : 'Check back when your coach adds events.'
          }
          action={
            isCoach && onCreateEvent ? (
              // From md up this is the empty state's own call; on a phone the
              // floating "+" is already the one primary action on screen.
              <Button variant="primary" size="md" onClick={onCreateEvent} className="hidden md:inline-flex">
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
      <div className={cn('rounded-xl border border-dashed border-border-strong px-5 py-6 text-center', className)}>
        <p className="mb-2 font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
          {formatDayLabel(focusDate, nowRef)}
        </p>
        <p className="font-fw-sans text-body-sm leading-[1.5] text-text-tertiary">
          Nothing on the books for this day.
          {isCoach && onCreateEvent ? (
            <>
              {' '}
              <Button
                type="button"
                variant="ghost"
                onClick={onCreateEvent}
                className="inline h-auto min-h-0 w-auto border-0 p-0 font-medium text-accent-600 underline-offset-4 outline-none hover:bg-transparent hover:text-accent-700 hover:underline focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                Schedule something
              </Button>
              .
            </>
          ) : null}
        </p>
      </div>
    );
  }

  // ── Populated agenda ───────────────────────────────────────────────────────
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/*
        Past days are COLLAPSED behind an explicit affordance in range mode.
        The agenda's fetch window runs from three months back (deliberately —
        it is load-bearing for the all-past demo season), so the list used to
        OPEN six weeks in the past under a masthead reading "5 upcoming"
        (audit P-05 / M11). The scroll anchor above helps, but past events
        still sat above the fold and any scroll-up walked into history the
        reader never asked for. Collapsing them makes the list agree with its
        own header while keeping every past event one tap away.
      */}
      {mode === 'range' && pastBuckets.length > 0 ? (
        // History is a secondary action: a quiet ghost control at the list's
        // own gutter, never a raised chip competing with the schedule.
        <div className="-mt-1 flex">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<History className="h-4 w-4" aria-hidden />}
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            className="-ml-2"
          >
            {showPast
              ? 'Hide earlier events'
              : `Show ${pastEventCount} earlier ${pastEventCount === 1 ? 'event' : 'events'}`}
          </Button>
        </div>
      ) : null}
      {visibleBuckets.map((bucket) => {
        const bucketIsToday = nowRef ? isSameDay(bucket.date, nowRef) : false;
        // Days strictly before today are rendered at reduced opacity — they are
        // historical record, not actionable upcoming items. `nowRef` is the
        // server-seeded "now" so this stays stable across SSR/CSR.
        const bucketIsPast = nowRef
          ? !bucketIsToday && isBefore(bucket.date, startOfDay(nowRef))
          : false;
        // Today / Tomorrow are the heading; the calendar date rides beside them
        // so the reader never has to count.
        const headingIsRelative = bucket.label === 'Today' || bucket.label === 'Tomorrow';
        const cue = relativeDayCue(bucket.date, nowRef);
        // Today's group carries the now-line at its sorted position: after
        // everything that has started, before what is next.
        const now = bucketIsToday ? (clock ?? nowRef ?? null) : null;
        const nowIndex = now ? bucket.events.findIndex((ev) => eventStartMs(ev) > now.getTime()) : -1;
        const nowSlot = now ? (nowIndex === -1 ? bucket.events.length : nowIndex) : -1;
        return (
          <section
            key={bucket.key}
            aria-label={bucket.label}
            ref={(el) => {
              if (el) bucketNodesRef.current.set(bucket.key, el);
              else bucketNodesRef.current.delete(bucket.key);
            }}
          >
            {/* Day heading — pinned under the masthead while its day scrolls. */}
            <div className={cn(STICKY_HEADING_CLASS, 'mb-2 flex items-baseline gap-2 py-1.5')}>
              <h2
                className={cn(
                  'font-fw-sans text-body font-semibold leading-5 tracking-[-0.01em]',
                  bucketIsToday ? 'text-accent-700' : 'text-text-primary',
                )}
              >
                {bucket.label}
              </h2>
              {headingIsRelative ? (
                <span className="font-fw-sans text-caption text-text-tertiary">{format(bucket.date, 'EEEE, MMMM d')}</span>
              ) : cue ? (
                <span className="font-fw-sans text-caption text-text-tertiary">{cue}</span>
              ) : null}
              {bucket.events.length > 1 ? (
                <span className="ml-auto font-fw-sans text-caption tabular-nums text-text-tertiary">
                  {bucket.events.length} events
                </span>
              ) : null}
            </div>

            <div className={cn(DAY_GROUP_CLASS, ROW_DIVIDERS_CLASS)}>
              {bucket.events.map((ev, index) => (
                <React.Fragment key={ev.id}>
                  {now && index === nowSlot ? <NowLine now={now} timezone={timezone} /> : null}
                  <FairwayEventCard
                    event={ev}
                    enterIndex={index}
                    showRsvp={!isCoach}
                    rsvpStatus={userRsvpStatuses?.get(ev.id) ?? null}
                    onClick={onEventClick}
                    isPast={bucketIsPast}
                    timezone={timezone}
                  />
                </React.Fragment>
              ))}
              {now && nowSlot === bucket.events.length ? <NowLine now={now} timezone={timezone} /> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
