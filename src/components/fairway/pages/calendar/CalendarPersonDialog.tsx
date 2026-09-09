'use client';

import { ArrowLeft, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock, UserRound } from 'lucide-react';
import surfaces from './CalendarSurfaces.module.css';
import { cn } from '@/lib/utils';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button, Input, Skeleton } from '@/components/fairway';
import { getScheduleWindow } from '@/app/golf/actions/scheduling';
import { useScheduleWindow } from '@/hooks/golf/use-schedule-window';
import type { ScheduleInterval, ScheduleParticipant, ScheduleWindowRequest } from '@/lib/calendar/scheduling-contracts';

const DAY_START_MINUTE = 7 * 60;
const DAY_END_MINUTE = 21 * 60;

function timeInZone(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function minuteInZone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : DAY_START_MINUTE;
}

function intervalTone(interval: ScheduleInterval): string {
  if (interval.type === 'class') return 'border-accent-200 bg-accent-50 text-accent-800 shadow-flat';
  if (interval.type === 'event') return `border-accent-700 text-text-on-accent ${surfaces.selected}`;
  return 'border-border-strong bg-text-tertiary/85 text-white shadow-flat';
}

function ScheduleLane({ label, intervals, timeZone, type, dayStart, verified }: {
  label: string;
  intervals: ScheduleInterval[];
  timeZone: string;
  type: 'class' | 'commitment';
  dayStart: string;
  verified: boolean;
}) {
  const visible = intervals.flatMap((interval) => {
    const dateKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
    const start = Date.parse(interval.start) < Date.parse(dayStart) ? 0 : minuteInZone(interval.start, timeZone);
    const end = dateKey(interval.end) !== dateKey(dayStart) ? 1440 : minuteInZone(interval.end, timeZone);
    const clippedStart = Math.max(DAY_START_MINUTE, start);
    const clippedEnd = Math.min(DAY_END_MINUTE, end);
    if (clippedEnd <= DAY_START_MINUTE || clippedStart >= DAY_END_MINUTE) return [];
    return [{
      interval,
      left: ((clippedStart - DAY_START_MINUTE) / (DAY_END_MINUTE - DAY_START_MINUTE)) * 100,
      width: ((clippedEnd - clippedStart) / (DAY_END_MINUTE - DAY_START_MINUTE)) * 100,
    }];
  });
  const isClasses = type === 'class';

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">{label}</p>
        <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
          {intervals.length === 0 ? (verified ? 'No blocks' : 'Not verified') : `${intervals.length} ${intervals.length === 1 ? 'block' : 'blocks'}`}
        </span>
      </div>
      <div
        aria-label={`${label} schedule timeline`}
        className="relative h-14 overflow-hidden rounded-fw-md border border-border-subtle bg-surface-sunken/80"
      >
        <span aria-hidden className="absolute inset-y-0 left-1/4 border-l border-dashed border-border-subtle" />
        <span aria-hidden className="absolute inset-y-0 left-1/2 border-l border-dashed border-border-subtle" />
        <span aria-hidden className="absolute inset-y-0 left-3/4 border-l border-dashed border-border-subtle" />
        {visible.length === 0 ? (
          <span className="absolute inset-0 grid place-items-center font-fw-sans text-caption text-text-tertiary">
            {!verified ? 'Schedule not fully verified' : intervals.length ? 'Commitments outside 7 AM–9 PM' : isClasses ? 'No classes recorded in Helm' : 'No commitments recorded in Helm'}
          </span>
        ) : visible.map(({ interval, left, width }) => (
          <span
            key={interval.id}
            title={`${interval.title} · ${timeInZone(interval.start, timeZone)}–${timeInZone(interval.end, timeZone)}`}
            style={{ left: `${left}%`, width: `${width}%` }}
            className={cn(
              'absolute top-2 flex h-10 min-w-0 items-center rounded-fw-sm border px-2 font-fw-sans text-caption font-medium transition-transform duration-200 hover:-translate-y-px motion-reduce:transition-none',
              intervalTone(interval),
            )}
          >
            <span className="truncate">{interval.title || (interval.type === 'class' ? 'Class' : 'Busy')}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PersonScheduleVisual({ person, timeZone, dayStart }: { person: ScheduleParticipant; timeZone: string; dayStart: string }) {
  const intervals = [...person.intervals].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const classes = intervals.filter((interval) => interval.type === 'class');
  const commitments = intervals.filter((interval) => interval.type !== 'class');

  return (
    <section aria-labelledby="class-day-heading" className={cn("relative overflow-hidden rounded-card p-4", surfaces.paper)}>
      <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-accent-500/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-50 text-accent-700 ring-1 ring-accent-200">
            <BookOpen className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 id="class-day-heading" className="font-fw-display text-body-lg font-semibold text-text-primary">Class day</h3>
            <p className="mt-0.5 font-fw-sans text-caption text-text-secondary">
              Classes, team commitments, and personal blocks in one view.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-surface-sunken px-2.5 py-1 font-fw-mono text-caption font-semibold tabular-nums text-text-secondary">
          7 AM–9 PM
        </span>
      </div>

      <div className="relative mt-4 space-y-3">
        <ScheduleLane label="Classes" intervals={classes} timeZone={timeZone} type="class" dayStart={dayStart} verified={person.verification === 'complete'} />
        <ScheduleLane label="Team & personal" intervals={commitments} timeZone={timeZone} type="commitment" dayStart={dayStart} verified={person.verification === 'complete'} />
        <div aria-hidden className="relative h-4 font-fw-mono text-microbadge tabular-nums text-text-tertiary">
          {[{ minute: 420, label: '7 AM' }, { minute: 600, label: '10 AM' }, { minute: 780, label: '1 PM' }, { minute: 960, label: '4 PM' }, { minute: 1260, label: '9 PM' }].map(({ minute, label }, index) => (
            <span key={minute} className="absolute" style={{ left: `${100 * (minute - 420) / 840}%`, transform: index === 0 ? undefined : index === 4 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{label}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CalendarPersonDialog({ request, personId, onDateChange, onCompare, onClose, onEvent }: {
  request: ScheduleWindowRequest | null;
  personId: string | null;
  onDateChange: (date: string) => void;
  onCompare: () => void;
  onClose: () => void;
  onEvent: (id: string) => void;
}) {
  const { snapshot, loading, error, retry } = useScheduleWindow(request, getScheduleWindow);
  const person = snapshot?.participants.find((participant) => participant.id === personId);
  const timeZone = snapshot?.timeZone ?? 'UTC';
  const move = (days: number) => {
    if (!request) return;
    const date = new Date(`${request.date}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    onDateChange(date.toISOString().slice(0, 10));
  };

  return (
    <ModalShell
      open={Boolean(request)}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Player schedule"
      hideTitle
      hideClose
      size="xl"
      className={cn("h-[min(90dvh,850px)] !w-[calc(100vw-1rem)] sm:!w-auto", surfaces.panel)}
    >
      <header className={cn("relative z-10 flex shrink-0 items-center gap-3 border-b px-4 py-4 sm:px-6", surfaces.chrome)}>
        <Button variant="ghost" aria-label="Back to calendar" onClick={onClose} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {person?.avatarUrl ? (
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-border-subtle">
            <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
          </span>
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-secondary ring-1 ring-border-subtle">
            <UserRound className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">Schedule</p>
          <h2 className="truncate font-fw-display text-title font-semibold tracking-[-0.02em] text-text-primary">{person?.name || 'Player schedule'}</h2>
          <p className="mt-0.5 font-fw-sans text-caption text-text-secondary">{person?.isViewer ? 'Your schedule' : 'Team member schedule'} · {timeZone}</p>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5 sm:px-6">
        <Button variant="ghost" onClick={() => move(-1)} aria-label="Previous day"><ChevronLeft className="h-5 w-5" /></Button>
        <Input
          type="date"
          aria-label="Schedule date"
          value={request?.date ?? ''}
          onChange={(event) => { if (event.target.value) onDateChange(event.target.value); }}
          leading={<CalendarDays />}
          className="min-w-0 rounded-full bg-surface px-3 shadow-flat"
        />
        <Button variant="ghost" onClick={() => move(1)} aria-label="Next day"><ChevronRight className="h-5 w-5" /></Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto px-4 py-5 pb-6 sm:px-6">
        {loading ? (
          <div role="status" aria-label="Loading schedule" className="space-y-3"><Skeleton className="h-40 w-full rounded-card" /><Skeleton className="h-20 w-full" /></div>
        ) : null}
        {error ? (
          <div role="alert" className="rounded-card border border-fw-danger/30 bg-fw-danger-bg p-4"><p className="font-fw-sans text-body-sm font-medium text-fw-danger-ink">{error}</p><Button variant="secondary" className="mt-3" onClick={retry}>Retry</Button></div>
        ) : null}
        {!loading && !error && !person ? <p className="font-fw-sans text-body-sm text-text-secondary">Schedule unavailable.</p> : null}
        {person && person.verification !== 'complete' ? (
          <p role="status" className="rounded-fw-md border border-fw-warning-ring bg-fw-warning-bg p-3 font-fw-sans text-caption text-fw-warning-ink">This schedule could not be fully verified. Missing time is not confirmed availability.</p>
        ) : null}
        {person ? <PersonScheduleVisual person={person} timeZone={timeZone} dayStart={snapshot!.window.start} /> : null}
        {person && person.intervals.length > 0 ? (
          <section aria-labelledby="commitments-heading">
            <div className="mb-2 flex items-center justify-between gap-3"><h3 id="commitments-heading" className="font-fw-display text-body-lg font-semibold text-text-primary">Commitments</h3><span className="font-fw-mono text-caption tabular-nums text-text-tertiary">{person.intervals.length} total</span></div>
            <div className="relative space-y-3 border-l border-accent-200 pl-4 ml-4">
              {person.intervals.map((interval) => (
                <div key={interval.id} className={cn("group relative flex items-start gap-3 rounded-fw-lg p-4 transition-transform active:scale-[0.99] motion-reduce:transform-none", surfaces.paper, surfaces.enter)}>
                  <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full', interval.type === 'class' ? 'bg-accent-50 text-accent-700' : 'bg-accent-50 text-accent-700')}>
                    {interval.type === 'class' ? <BookOpen className="h-4 w-4" aria-hidden /> : <Clock className="h-4 w-4" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-fw-mono text-caption font-medium tabular-nums text-text-secondary">{timeInZone(interval.start, timeZone)} – {timeInZone(interval.end, timeZone)}</p>
                    {interval.eventId ? (
                      <Button variant="ghost" className="mt-0.5 h-auto min-h-11 justify-start px-0 py-1 text-left font-fw-sans text-body-sm font-semibold text-text-primary hover:bg-transparent hover:text-accent-700" onClick={() => onEvent(interval.eventId!)}>{interval.title}</Button>
                    ) : <p className="mt-0.5 font-fw-sans text-body-sm font-semibold text-text-primary">{interval.title}</p>}
                    <p className="mt-1 font-fw-sans text-caption capitalize text-text-tertiary">{interval.type === 'blocked' ? 'Personal block' : interval.type}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {person?.verification === 'complete' && person.intervals.length === 0 ? (
          <div className="py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-sunken text-accent-700 shadow-flat"><CalendarDays className="h-5 w-5" aria-hidden /></span><p className="mt-3 font-fw-display text-body-lg font-semibold text-text-primary">No commitments in Helm</p><p className="mx-auto mt-1.5 max-w-xs font-fw-sans text-body-sm text-text-secondary">There are no recorded classes, team events, or personal blocks for this day.</p></div>
        ) : null}
      </div>

      <footer className={cn("sticky bottom-0 shrink-0 border-t px-4 py-3 sm:px-6 sm:pb-4", surfaces.chrome)}>
        <p className="mb-3 text-center font-fw-sans text-caption text-text-secondary">Based on Helm schedules · {timeZone}</p>
        <Button className="w-full" onClick={onCompare} disabled={!person || loading}>Compare with my schedule</Button>
      </footer>
    </ModalShell>
  );
}
