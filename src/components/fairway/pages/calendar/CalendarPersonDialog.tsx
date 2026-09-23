'use client';

/**
 * ============================================================================
 * Fairway · Calendar · CalendarPersonDialog — one person's day, in context
 * ----------------------------------------------------------------------------
 * DESIGN-PLAN.md §8/§18 "Player schedule: see the person in context". A
 * compact identity header, a week strip, then a VERTICAL day timeline: hour
 * labels down the left, every Helm commitment placed by time — classes
 * (`.class`), team events (`.team`), personal blocks (`.personal`) — and,
 * only when the read was `complete`, the verified free gaps between 8 AM and
 * 6 PM drawn as dashed emerald "Available" cards. A partial or failed read
 * never draws a gap: missing information is not free time.
 *
 * The footer dock carries the ONE primary action ("Find a time with Cole");
 * on desktop the same action lives in a right-hand day-summary column and the
 * dock hides. Every prop and callback is unchanged from the lane-based
 * version this replaced.
 * ========================================================================== */

import * as React from 'react';
import { addDays, format, startOfWeek } from 'date-fns';
import { ArrowLeft, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock, UserRound } from 'lucide-react';
import surfaces from './CalendarSurfaces.module.css';
import { cn } from '@/lib/utils';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Avatar, Button, IconButton, Input, Skeleton } from '@/components/fairway';
import { getScheduleWindow } from '@/app/golf/actions/scheduling';
import { useScheduleWindow } from '@/hooks/golf/use-schedule-window';
import type { ScheduleInterval, ScheduleParticipant, ScheduleWindowRequest } from '@/lib/calendar/scheduling-contracts';

/** The working day the timeline always shows; it grows to include earlier
 * or later commitments but never shrinks below this. */
const BASE_START_MINUTE = 8 * 60;
const BASE_END_MINUTE = 18 * 60;
/** One hour of the vertical timeline, in px. */
const HOUR_PX = 64;
/** Vertical padding above the first hour line, in px. */
const TOP_PAD_PX = 12;
/** A free gap shorter than this is not offered as an opening. */
const MIN_GAP_MINUTES = 60;

function timeInZone(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

function dateKeyInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function minuteInZone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : BASE_START_MINUTE;
}

function hourLabel(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

/** Wall-clock label for a minute-of-day (the timeline's own coordinate). */
function clockLabel(minute: number): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, Math.floor(minute / 60) % 24, minute % 60));
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${hours.toFixed(1)} hours`;
}

/** `title` is absent when the server sent `access: 'free_busy'` (or, for
 * intervals produced before that field existed, genuinely missing). Never
 * fabricate a name here — show the same honest, type-keyed label every
 * free/busy-only viewer of this interval would see. */
function intervalTitle(interval: ScheduleInterval): string {
  return interval.title || (interval.type === 'class' ? 'Class' : 'Busy');
}

type IntervalKind = 'class' | 'team' | 'personal';

function intervalKind(interval: ScheduleInterval): IntervalKind {
  if (interval.type === 'class') return 'class';
  if (interval.type === 'event') return 'team';
  return 'personal';
}

function kindLabel(kind: IntervalKind): string {
  return kind === 'class' ? 'Class' : kind === 'team' ? 'Team event' : 'Personal block';
}

function kindSurface(kind: IntervalKind): string {
  return kind === 'class' ? surfaces.class! : kind === 'team' ? surfaces.team! : surfaces.personal!;
}

interface PlacedInterval {
  interval: ScheduleInterval;
  startMinute: number;
  endMinute: number;
  lane: number;
  lanes: number;
}

interface FreeGap {
  startMinute: number;
  endMinute: number;
}

/** Clip each interval to the request day (in the team zone), then pack
 * overlapping intervals into side-by-side lanes so nothing hides another. */
function placeIntervals(intervals: ScheduleInterval[], dayStart: string, timeZone: string): PlacedInterval[] {
  const dayKey = dateKeyInZone(new Date(dayStart), timeZone);
  const clipped = intervals
    .map((interval) => {
      const startsBefore = Date.parse(interval.start) < Date.parse(dayStart);
      const endsAfter = dateKeyInZone(new Date(interval.end), timeZone) !== dayKey;
      const startMinute = startsBefore ? 0 : minuteInZone(interval.start, timeZone);
      const endMinute = endsAfter ? 1440 : minuteInZone(interval.end, timeZone);
      return { interval, startMinute, endMinute };
    })
    .filter((item) => item.endMinute > item.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const placed: PlacedInterval[] = [];
  let cluster: PlacedInterval[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = laneEnds.length || 1;
    for (const item of cluster) item.lanes = lanes;
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const item of clipped) {
    if (cluster.length > 0 && item.startMinute >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.startMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMinute);
    } else {
      laneEnds[lane] = item.endMinute;
    }
    cluster.push({ ...item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.endMinute);
  }
  if (cluster.length > 0) flush();
  return placed;
}

/** Verified free gaps of at least an hour inside the working day. Only ever
 * called for a `complete` read. */
function freeGaps(placed: PlacedInterval[]): FreeGap[] {
  const gaps: FreeGap[] = [];
  let cursor = BASE_START_MINUTE;
  for (const block of placed) {
    if (block.endMinute <= cursor) continue;
    if (block.startMinute > cursor) {
      const end = Math.min(block.startMinute, BASE_END_MINUTE);
      if (end - cursor >= MIN_GAP_MINUTES) gaps.push({ startMinute: cursor, endMinute: end });
    }
    cursor = Math.max(cursor, block.endMinute);
    if (cursor >= BASE_END_MINUTE) break;
  }
  if (cursor < BASE_END_MINUTE && BASE_END_MINUTE - cursor >= MIN_GAP_MINUTES) {
    gaps.push({ startMinute: cursor, endMinute: BASE_END_MINUTE });
  }
  return gaps;
}

/** What a class interval hands back to open class detail (SCREEN-BUILD-PLAN.md
 * §2.4). Either id may be absent — an unsynced class carries no `eventId`,
 * and an interval from before `classId` existed carries neither — the
 * class-detail action resolves what it can and reports `not_found` rather
 * than the dialog guessing. */
export interface OpenClassRequest {
  classId?: string;
  eventId?: string;
  date: string;
}

function WeekStrip({ date, timeZone, onSelect }: { date: string; timeZone: string; onSelect: (date: string) => void }) {
  const selected = new Date(`${date}T12:00:00`);
  const weekStart = startOfWeek(selected, { weekStartsOn: 1 });
  const todayKey = dateKeyInZone(new Date(), timeZone);
  return (
    <div role="group" aria-label="Week" className="grid grid-cols-7 gap-1">
      {Array.from({ length: 7 }, (_, index) => {
        const day = addDays(weekStart, index);
        const key = format(day, 'yyyy-MM-dd');
        const isSelected = key === date;
        const isToday = key === todayKey;
        return (
          <Button
            key={key}
            type="button"
            variant="ghost"
            aria-pressed={isSelected}
            aria-current={isToday ? 'date' : undefined}
            aria-label={format(day, 'EEEE, MMMM d')}
            onClick={() => { if (!isSelected) onSelect(key); }}
            className={cn(
              'flex h-auto min-h-[52px] w-full flex-col items-center justify-center gap-0.5 rounded-fw-md px-0 py-1.5',
              isSelected
                ? 'bg-accent-650 text-text-on-accent shadow-soft hover:bg-accent-750'
                : isToday
                  ? 'bg-surface-sunken ring-2 ring-inset ring-accent-300 hover:bg-surface-tint'
                  : 'hover:bg-surface-tint',
            )}
          >
            <span className="flex flex-col items-center gap-0.5">
              <span className={cn('font-fw-sans text-eyebrow uppercase tracking-[0.1em]', isSelected ? 'text-text-on-accent/85' : isToday ? 'text-accent-700' : 'text-text-tertiary')}>
                {format(day, 'EEE')}
              </span>
              <span className={cn('font-fw-mono text-body-lg font-semibold leading-none tabular-nums', isSelected ? 'text-text-on-accent' : 'text-text-primary')}>
                {format(day, 'd')}
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}

function DayTimeline({ person, timeZone, dayStart, isToday, onOpenClass, onEvent }: {
  person: ScheduleParticipant;
  timeZone: string;
  dayStart: string;
  isToday: boolean;
  onOpenClass?: (interval: ScheduleInterval) => void;
  onEvent: (id: string) => void;
}) {
  const placed = React.useMemo(() => placeIntervals(person.intervals, dayStart, timeZone), [person.intervals, dayStart, timeZone]);
  const verified = person.verification === 'complete';
  const gaps = React.useMemo(() => (verified ? freeGaps(placed) : []), [placed, verified]);

  const rangeStart = Math.max(0, Math.min(BASE_START_MINUTE, ...placed.map((item) => Math.floor(item.startMinute / 60) * 60)));
  const rangeEnd = Math.min(1440, Math.max(BASE_END_MINUTE, ...placed.map((item) => Math.ceil(item.endMinute / 60) * 60)));
  const heightPx = ((rangeEnd - rangeStart) / 60) * HOUR_PX;
  const hours: number[] = [];
  for (let minute = rangeStart; minute <= rangeEnd; minute += 60) hours.push(minute);

  const nowMinute = isToday ? minuteInZone(new Date().toISOString(), timeZone) : null;
  const showNow = nowMinute !== null && nowMinute >= rangeStart && nowMinute <= rangeEnd;

  const top = (minute: number) => ((minute - rangeStart) / 60) * HOUR_PX + TOP_PAD_PX;
  const height = (startMinute: number, endMinute: number) => Math.max(28, ((endMinute - startMinute) / 60) * HOUR_PX);

  return (
    <div className={cn('overflow-hidden rounded-card', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5">
        <p className="font-fw-sans text-caption font-semibold uppercase tracking-[0.1em] text-text-tertiary">
          {hourLabel(rangeStart)}–{hourLabel(rangeEnd)}
        </p>
        <p className="font-fw-sans text-caption text-text-tertiary">
          {verified ? 'Verified · Helm schedules' : 'Not fully verified'}
        </p>
      </div>
      <div role="list" aria-label="Day timeline" className="relative flex" style={{ height: `${heightPx + TOP_PAD_PX * 2}px` }}>
        {/* Hour gutter */}
        <div aria-hidden className="relative w-14 shrink-0 select-none">
          {hours.map((minute) => (
            <span
              key={minute}
              className="absolute right-2 -translate-y-1/2 font-fw-mono text-caption tabular-nums text-text-tertiary"
              style={{ top: `${top(minute)}px` }}
            >
              {hourLabel(minute)}
            </span>
          ))}
        </div>
        {/* Day column */}
        <div
          className={cn('relative min-w-0 flex-1 border-l border-border-subtle', surfaces.dayGrid)}
          style={{ ['--cal-hour' as string]: `${HOUR_PX}px`, backgroundPosition: `0 ${TOP_PAD_PX}px` }}
        >
          {!verified ? (
            <div className={cn('absolute inset-x-2 z-10 rounded-fw-sm px-3 py-2 font-fw-sans text-caption', surfaces.hatch)} style={{ top: `${TOP_PAD_PX + 4}px` }}>
              Not verified — missing time is not confirmed availability.
            </div>
          ) : null}

          {gaps.map((gap) => (
            <div
              key={`gap-${gap.startMinute}`}
              role="listitem"
              aria-label={`Available, ${durationLabel(gap.endMinute - gap.startMinute)}, ${clockLabel(gap.startMinute)} to ${clockLabel(gap.endMinute)}`}
              className={cn('absolute inset-x-2 flex flex-col justify-start rounded-fw-md px-3 pt-2.5', surfaces.avail, surfaces.enter)}
              style={{ top: `${top(gap.startMinute) + 2}px`, height: `${height(gap.startMinute, gap.endMinute) - 4}px` }}
            >
              <span className="flex items-center gap-1.5 font-fw-sans text-body-sm font-semibold">
                <CalendarDays className="h-4 w-4" aria-hidden />
                Available · {durationLabel(gap.endMinute - gap.startMinute)}
              </span>
              <span className="font-fw-mono text-caption tabular-nums opacity-80">
                {clockLabel(gap.startMinute)} – {clockLabel(gap.endMinute)}
              </span>
            </div>
          ))}

          {placed.map(({ interval, startMinute, endMinute, lane, lanes }) => {
            const kind = intervalKind(interval);
            const title = intervalTitle(interval);
            const openable = kind === 'class' && Boolean(onOpenClass) && Boolean(interval.classId || interval.eventId);
            const eventOpenable = kind !== 'class' && Boolean(interval.eventId);
            const laneWidth = 100 / lanes;
            const style: React.CSSProperties = {
              top: `${top(startMinute) + 2}px`,
              height: `${height(startMinute, endMinute) - 4}px`,
              left: `calc(${lane * laneWidth}% + 8px)`,
              width: `calc(${laneWidth}% - ${lanes === 1 ? 16 : lane === lanes - 1 ? 12 : 8}px)`,
            };
            const timeLine = `${timeInZone(interval.start, timeZone)} – ${timeInZone(interval.end, timeZone)}`;
            const body = (
              <span className="flex min-w-0 flex-col items-start gap-0.5 overflow-hidden text-left">
                <span className="w-full truncate font-fw-sans text-body-sm font-semibold leading-tight">{title}</span>
                <span className="font-fw-mono text-caption tabular-nums leading-tight opacity-85">{timeLine}</span>
              </span>
            );
            const tone = kindSurface(kind);
            const tooltip = `${title} · ${timeLine}`;
            return (
              <div
                key={interval.id}
                role="listitem"
                aria-label={openable || eventOpenable ? undefined : `${kindLabel(kind)}, ${title}, ${timeLine}`}
                style={style}
                className={cn('absolute', surfaces.enter)}
              >
                {openable || eventOpenable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    title={tooltip}
                    aria-label={`${kindLabel(kind)}, ${title}, ${timeLine}`}
                    onClick={() => (openable ? onOpenClass!(interval) : onEvent(interval.eventId!))}
                    className={cn('h-full min-h-0 w-full items-start justify-start rounded-fw-md px-3 py-2 font-normal hover:brightness-[0.98]', tone)}
                  >
                    {body}
                  </Button>
                ) : (
                  <div title={tooltip} className={cn('flex h-full w-full items-start rounded-fw-md px-3 py-2', tone)}>
                    {body}
                  </div>
                )}
              </div>
            );
          })}

          {showNow ? (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20" style={{ top: `${top(nowMinute!)}px` }}>
              <span className="absolute -left-[5px] -top-[4px] h-2.5 w-2.5 rounded-full bg-accent-650 ring-2 ring-surface" />
              <span className="block h-0.5 w-full bg-accent-650" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CalendarPersonDialog({ request, personId, onDateChange, onCompare, onClose, onEvent, onOpenClass }: {
  request: ScheduleWindowRequest | null;
  personId: string | null;
  onDateChange: (date: string) => void;
  onCompare: () => void;
  onClose: () => void;
  onEvent: (id: string) => void;
  /** Opens class detail (S4) for a class interval — from a timeline block.
   * Omit to leave class intervals inert (no entry point mounted yet). */
  onOpenClass?: (request: OpenClassRequest) => void;
}) {
  const { snapshot, loading, error, retry } = useScheduleWindow(request, getScheduleWindow);
  const person = snapshot?.participants.find((participant) => participant.id === personId);
  const dayLabel = request ? format(new Date(`${request.date}T12:00:00`), 'EEE, MMM d') : '';
  const timeZone = snapshot?.timeZone ?? 'UTC';
  const handleOpenClass = onOpenClass && request
    ? (interval: ScheduleInterval) => onOpenClass({ classId: interval.classId, eventId: interval.eventId, date: request.date })
    : undefined;
  const move = (days: number) => {
    if (!request) return;
    const date = new Date(`${request.date}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    onDateChange(date.toISOString().slice(0, 10));
  };

  const firstName = person?.name?.split(' ')[0] || 'them';
  const primaryLabel = person?.isViewer ? 'Compare with the team' : `Find a time with ${firstName}`;
  const isToday = request ? dateKeyInZone(new Date(), timeZone) === request.date : false;
  const counts = React.useMemo(() => {
    const result: Record<IntervalKind, number> = { class: 0, team: 0, personal: 0 };
    for (const interval of person?.intervals ?? []) result[intervalKind(interval)] += 1;
    return result;
  }, [person?.intervals]);

  const primaryButton = (
    <Button size="lg" fullWidth onClick={onCompare} disabled={!person || loading}>
      {primaryLabel}
    </Button>
  );

  return (
    <ModalShell
      open={Boolean(request)}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Player schedule"
      hideTitle
      hideClose
      size="xl"
      className={cn('h-[min(92dvh,900px)] !w-[calc(100vw-1rem)] sm:!w-auto lg:!w-[880px] lg:!max-w-[calc(100vw-4rem)]', surfaces.scope, surfaces.panel)}
    >
      <header className={cn('relative z-10 shrink-0 border-b px-3 pb-3 pt-3 sm:px-5', 'fw-glass-chrome')}>
        <div className="flex items-center gap-3">
          <IconButton variant="ghost" size="md" aria-label="Back to calendar" onClick={onClose} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
          <Avatar
            src={person?.avatarUrl ?? undefined}
            name={person?.name ?? null}
            decorative
            size="xl"
            className="h-14 w-14 shrink-0 shadow-soft ring-2 ring-surface"
            fallback={person?.name ? undefined : <UserRound className="h-6 w-6" aria-hidden />}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-fw-display text-title font-semibold tracking-[-0.02em] text-text-primary">{person?.name || 'Player schedule'}</h2>
            <p className="font-fw-sans text-body-sm text-text-secondary">{person?.isViewer ? 'Your schedule' : 'Player schedule'}</p>
            <p className="mt-0.5 truncate font-fw-sans text-caption text-text-tertiary">
              {person?.kind === 'coach' ? 'Coach' : 'Player'} · {timeZone}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <IconButton variant="ghost" size="md" aria-label="Previous day" onClick={() => move(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <div className={cn('relative flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4', 'border border-border-subtle bg-surface')}>
            <CalendarDays className="h-4 w-4 shrink-0 text-accent-700" aria-hidden />
            <span className="truncate font-fw-sans text-body font-semibold text-text-primary">{dayLabel}</span>
            <Input
              type="date"
              aria-label="Schedule date"
              value={request?.date ?? ''}
              onChange={(event) => { if (event.target.value) onDateChange(event.target.value); }}
              className="absolute inset-0 h-full w-full cursor-pointer rounded-full border-0 bg-transparent opacity-0 focus-visible:opacity-0 focus-visible:ring-2 focus-visible:ring-accent-600"
            />
          </div>
          <IconButton variant="ghost" size="md" aria-label="Next day" onClick={() => move(1)}>
            <ChevronRight className="h-5 w-5" />
          </IconButton>
        </div>
        {request ? (
          <div className="mt-2">
            <WeekStrip date={request.date} timeZone={timeZone} onSelect={onDateChange} />
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-3 py-4 pb-6 sm:px-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          {loading ? (
            <div role="status" aria-label="Loading schedule" className={cn('overflow-hidden rounded-card', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
              <div className="border-b border-border-subtle px-4 py-3"><Skeleton className="h-3.5 w-24" /></div>
              <div className="flex gap-3 p-3">
                <div className="w-11 space-y-10 pt-1">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-3 w-9" />)}</div>
                <div className="flex-1 space-y-3"><Skeleton className="h-16 w-full rounded-fw-md" /><Skeleton className="h-24 w-full rounded-fw-md" /><Skeleton className="h-20 w-full rounded-fw-md" /></div>
              </div>
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="rounded-card border border-fw-danger/30 bg-fw-danger-bg p-4"><p className="font-fw-sans text-body-sm font-medium text-fw-danger-ink">{error}</p><Button variant="secondary" className="mt-3" onClick={retry}>Retry</Button></div>
          ) : null}
          {!loading && !error && !person ? (
            <div className={cn('rounded-card p-5 text-center', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
              <p className="font-fw-display text-body-lg font-semibold text-text-primary">Schedule unavailable</p>
              <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">This person’s schedule can’t be shown right now.</p>
            </div>
          ) : null}
          {person && person.verification !== 'complete' ? (
            <p role="status" className="rounded-fw-md border border-fw-warning-ring bg-fw-warning-bg p-3 font-fw-sans text-caption text-fw-warning-ink">This schedule could not be fully verified. Missing time is not confirmed availability.</p>
          ) : null}
          {person && snapshot ? (
            <DayTimeline
              person={person}
              timeZone={timeZone}
              dayStart={snapshot.window.start}
              isToday={isToday}
              onOpenClass={handleOpenClass}
              onEvent={onEvent}
            />
          ) : null}
          {person?.verification === 'complete' && person.intervals.length === 0 ? (
            <div className={cn('rounded-card px-5 py-6 text-center', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-50 text-accent-700"><CalendarDays className="h-5 w-5" aria-hidden /></span>
              <p className="mt-3 font-fw-display text-body-lg font-semibold text-text-primary">No commitments in Helm</p>
              <p className="mx-auto mt-1.5 max-w-xs font-fw-sans text-body-sm text-text-secondary">There are no recorded classes, team events, or personal blocks for this day.</p>
            </div>
          ) : null}
        </div>

        {person ? (
          <aside aria-label="Day summary" className={cn('sticky top-0 hidden w-[300px] shrink-0 self-start space-y-4 rounded-card p-4 lg:block', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
            <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">Day summary</p>
            <dl className="space-y-2">
              {([['class', BookOpen, 'Classes'], ['team', CalendarDays, 'Team events'], ['personal', Clock, 'Personal blocks']] as const).map(([key, Icon, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full', kindSurface(key))}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <dt className="flex-1 font-fw-sans text-body-sm text-text-secondary">{label}</dt>
                  <dd className="font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">{counts[key]}</dd>
                </div>
              ))}
            </dl>
            <p className="font-fw-sans text-caption text-text-tertiary">
              {person.verification === 'complete' ? 'Verified against Helm schedules' : 'Not fully verified'} · {timeZone}
            </p>
            {primaryButton}
          </aside>
        ) : null}
      </div>

      <footer className={cn('sticky bottom-0 shrink-0 rounded-t-fw-lg border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 lg:hidden', 'fw-glass-chrome')}>
        <p className="mb-2.5 text-center font-fw-sans text-caption text-text-secondary">Based on Helm schedules · {timeZone}</p>
        {primaryButton}
      </footer>
    </ModalShell>
  );
}
