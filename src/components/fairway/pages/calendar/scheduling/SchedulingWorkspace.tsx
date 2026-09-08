'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  UserRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Avatar,
  Button,
  GlassSurface,
  IconButton,
  Input,
  Select,
} from '@/components/fairway';
import type {
  ScheduleInterval,
  ScheduleParticipant,
  ScheduleProposal,
  ScheduleEvaluation,
  ScheduleSnapshot,
} from '@/lib/calendar/scheduling-contracts';
import { evaluateSchedule, suggestScheduleTimes } from '@/lib/calendar/scheduling/evaluate';

const SLOT_MINUTES = 15;
const DEFAULT_DURATION = 60;
const DURATION_OPTIONS = [30, 60, 90, 120] as const;

type ParticipantState = 'available' | 'busy' | 'unknown';

interface TimeSlot {
  start: string;
  end: string;
  minuteOfDay: number;
}

interface EvaluationSummary {
  requiredFree: ScheduleEvaluation['requiredFree'];
  requiredTotal: ScheduleEvaluation['requiredTotal'];
  optionalFree: ScheduleEvaluation['optionalFree'];
  optionalTotal: ScheduleEvaluation['optionalTotal'];
  unknown: ScheduleEvaluation['unknown'];
  allAvailable: ScheduleEvaluation['allAvailable'];
  states: Map<string, ParticipantState>;
}

export interface SchedulingWorkspaceProps {
  snapshot: ScheduleSnapshot;
  initialProposal?: ScheduleProposal;
  onChoose: (proposal: ScheduleProposal) => void;
  onClose: () => void;
  onDateChange: (date: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onPersonClick?: (id: string) => void;
}

function safeDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function zonedParts(value: string, timeZone: string) {
  const date = safeDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

function dateKey(value: string, timeZone: string): string {
  const parts = zonedParts(value, timeZone);
  if (!parts) return value.slice(0, 10);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatTime(value: string, timeZone: string): string {
  const date = safeDate(value);
  if (!date) return 'Unknown time';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDate(value: string, timeZone: string): string {
  const date = safeDate(`${value}T12:00:00Z`);
  if (!date) return value;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatDateInput(value: string, timeZone: string): string {
  return dateKey(value, timeZone);
}

function minutesSinceMidnight(value: string, timeZone: string): number {
  const parts = zonedParts(value, timeZone);
  return parts ? parts.hour * 60 + parts.minute : 0;
}

function intervalOverlaps(interval: ScheduleInterval, start: string, end: string): boolean {
  const intervalStart = safeDate(interval.start)?.getTime();
  const intervalEnd = safeDate(interval.end)?.getTime();
  const proposalStart = safeDate(start)?.getTime();
  const proposalEnd = safeDate(end)?.getTime();
  if ([intervalStart, intervalEnd, proposalStart, proposalEnd].some((value) => value == null)) return false;
  return intervalStart! < proposalEnd! && intervalEnd! > proposalStart!;
}

function participantState(participant: ScheduleParticipant, start: string, end: string): ParticipantState {
  if (participant.verification !== 'complete') return 'unknown';
  return participant.intervals.some((interval) => intervalOverlaps(interval, start, end)) ? 'busy' : 'available';
}

function evaluateSelection(
  snapshot: ScheduleSnapshot,
  start: string,
  end: string,
): EvaluationSummary {
  const states = new Map<string, ParticipantState>();
  for (const participant of snapshot.participants) {
    const state = participantState(participant, start, end);
    states.set(participant.id, state);
  }
  const evaluation = evaluateSchedule(snapshot, { start, end });
  return {
    ...evaluation,
    states,
  };
}

function addMinutes(value: string, minutes: number): string {
  const date = safeDate(value);
  if (!date) return value;
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

function createSlots(snapshot: ScheduleSnapshot): TimeSlot[] {
  const start = safeDate(snapshot.window.start);
  const end = safeDate(snapshot.window.end);
  if (!start || !end || end <= start) return [];
  const slots: TimeSlot[] = [];
  for (let cursor = start; cursor < end; cursor = new Date(cursor.getTime() + SLOT_MINUTES * 60_000)) {
    const slotEnd = new Date(Math.min(cursor.getTime() + SLOT_MINUTES * 60_000, end.getTime()));
    slots.push({
      start: cursor.toISOString(),
      end: slotEnd.toISOString(),
      minuteOfDay: minutesSinceMidnight(cursor.toISOString(), snapshot.timeZone),
    });
  }
  return slots;
}

function durationBetween(proposal?: ScheduleProposal): number {
  if (!proposal) return DEFAULT_DURATION;
  const start = safeDate(proposal.start)?.getTime();
  const end = safeDate(proposal.end)?.getTime();
  if (start == null || end == null || end <= start) return DEFAULT_DURATION;
  const minutes = Math.round((end - start) / 60_000);
  return DURATION_OPTIONS.includes(minutes as (typeof DURATION_OPTIONS)[number]) ? minutes : DEFAULT_DURATION;
}

function participantLabel(participant: ScheduleParticipant): string {
  if (participant.isViewer) return 'You';
  return participant.name || 'Unnamed participant';
}

function intervalLabel(interval: ScheduleInterval, timeZone: string): string {
  const title = interval.title || (interval.type === 'blocked' ? 'Busy' : 'Scheduled');
  return `${title}, ${formatTime(interval.start, timeZone)}–${formatTime(interval.end, timeZone)}`;
}

export function SchedulingWorkspace({
  snapshot,
  initialProposal,
  onChoose,
  onClose,
  onDateChange,
  loading = false,
  error = null,
  onRetry,
  onPersonClick,
}: SchedulingWorkspaceProps) {
  const slots = React.useMemo(() => createSlots(snapshot), [snapshot]);
  const firstSlot = slots[0]?.start ?? snapshot.window.start;
  const [selectedStart, setSelectedStart] = React.useState(initialProposal?.start ?? firstSlot);
  const [duration, setDuration] = React.useState(durationBetween(initialProposal));
  const [dragging, setDragging] = React.useState(false);
  const timelineRef = React.useRef<HTMLDivElement>(null);
  const initialStart = initialProposal?.start;
  const initialEnd = initialProposal?.end;
  const [dateValue, setDateValue] = React.useState(formatDateInput(initialStart ?? firstSlot, snapshot.timeZone));

  React.useEffect(() => {
    if (initialStart) {
      setSelectedStart(initialStart);
      setDuration(durationBetween(initialEnd ? { start: initialStart, end: initialEnd } : undefined));
      return;
    }
    setSelectedStart((current) => (slots.some((slot) => slot.start === current) ? current : firstSlot));
  }, [firstSlot, initialEnd, initialStart, slots]);

  React.useEffect(() => {
    setDateValue(formatDateInput(initialStart ?? firstSlot, snapshot.timeZone));
  }, [firstSlot, initialStart, snapshot.timeZone]);

  const selectedEnd = React.useMemo(() => addMinutes(selectedStart, duration), [duration, selectedStart]);
  const evaluation = React.useMemo(
    () => evaluateSelection(snapshot, selectedStart, selectedEnd),
    [selectedEnd, selectedStart, snapshot],
  );
  const dateLabel = formatDate(dateValue, snapshot.timeZone);

  const validStarts = React.useMemo(
    () => slots.filter((slot) => safeDate(addMinutes(slot.start, duration))! <= safeDate(snapshot.window.end)!),
    [duration, slots, snapshot.window.end],
  );

  const suggestions = React.useMemo(
    () => suggestScheduleTimes(snapshot, duration, selectedStart)
      .filter((proposal) => proposal.start !== selectedStart)
      .slice(0, 3)
      .map((proposal) => ({
        slot: { start: proposal.start, end: addMinutes(proposal.start, SLOT_MINUTES), minuteOfDay: minutesSinceMidnight(proposal.start, snapshot.timeZone) },
        evaluation: evaluateSchedule(snapshot, proposal),
      })),
    [duration, selectedStart, snapshot],
  );

  const setStart = React.useCallback((start: string) => {
    if (validStarts.some((slot) => slot.start === start)) setSelectedStart(start);
  }, [validStarts]);

  const setDate = (nextDate: string) => {
    if (!nextDate) return;
    setDateValue(nextDate);
    onDateChange(nextDate);
  };

  const moveSelection = (direction: -1 | 1) => {
    const index = validStarts.findIndex((slot) => slot.start === selectedStart);
    const next = validStarts[Math.max(0, Math.min(validStarts.length - 1, index + direction))];
    if (next) setSelectedStart(next.start);
  };

  const selectFromPointer = (clientX: number) => {
    const timeline = timelineRef.current;
    if (!timeline || validStarts.length === 0) return;
    const rect = timeline.getBoundingClientRect();
    const nameWidth = window.innerWidth < 768 ? 96 : 128;
    // The schedule can be much wider than the viewport. Account for its
    // horizontal scroll position so dragging after a pan still lands on the
    // time under the finger rather than jumping back to the visible viewport.
    const trackWidth = timeline.scrollWidth - nameWidth;
    const position = clientX - rect.left + timeline.scrollLeft - nameWidth;
    const fraction = Math.max(0, Math.min(0.999, position / trackWidth));
    const nextIndex = Math.round(fraction * Math.max(0, validStarts.length - 1));
    const next = validStarts[nextIndex];
    if (next) setSelectedStart(next.start);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    selectFromPointer(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) selectFromPointer(event.clientX);
  };

  const selectedIndex = Math.max(0, validStarts.findIndex((slot) => slot.start === selectedStart));
  const handleDragKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    moveSelection(event.key === 'ArrowLeft' ? -1 : 1);
  };

  const availableSummary = evaluation.allAvailable
    ? 'Everyone is available'
    : evaluation.unknown > 0
      ? `${evaluation.requiredFree} of ${evaluation.requiredTotal} required free · ${evaluation.unknown} unverified`
      : `${evaluation.requiredFree} of ${evaluation.requiredTotal} required free`;

  const selectedWindowText = `${formatTime(selectedStart, snapshot.timeZone)}–${formatTime(selectedEnd, snapshot.timeZone)}`;
  const canChoose = evaluation.unknown === 0 && evaluation.requiredFree === evaluation.requiredTotal;

  return (
    <section
      aria-labelledby="scheduling-workspace-title"
      className="flex min-h-0 w-full flex-col bg-canvas text-text-primary"
      data-testid="scheduling-workspace"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-6">
        <div className="min-w-0">
          <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Scheduling
          </p>
          <h1 id="scheduling-workspace-title" className="mt-1 font-fw-display text-[clamp(1.75rem,5vw,2.5rem)] font-semibold tracking-[-0.03em] text-text-primary">
            Find a time
          </h1>
          <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">
            {snapshot.participants.length} {snapshot.participants.length === 1 ? 'person' : 'people'} · {duration} min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Date"
            value={dateValue}
            onChange={(event) => setDate(event.target.value)}
            leading={<CalendarDays />}
            size="md"
            className="w-auto min-w-[170px] rounded-full bg-surface px-3.5 shadow-flat"
          />
          <IconButton variant="ghost" size="md" aria-label="Close scheduling workspace" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 pb-32 sm:px-6">
        {error ? (
          <div role="alert" className="flex items-start gap-3 rounded-card border border-fw-danger/30 bg-fw-danger-bg px-4 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-fw-danger-ink" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-fw-sans text-body-sm font-medium text-fw-danger-ink">Schedule could not be checked</p>
              <p className="mt-1 font-fw-sans text-caption text-fw-danger-ink/90">{error}</p>
            </div>
            {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex min-h-11 items-center gap-2 rounded-full border border-border-subtle bg-surface px-3.5 shadow-flat">
              <Clock3 className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              <span className="font-fw-sans text-caption font-medium text-text-secondary">Duration</span>
              <Select
                aria-label="Duration"
                value={String(duration)}
                onValueChange={(value) => value && setDuration(Number(value))}
                size="sm"
                options={DURATION_OPTIONS.map((option) => ({ value: String(option), label: `${option} min` }))}
                className="min-w-[84px] border-0 bg-transparent px-0 shadow-none"
              />
            </div>
            <span className="hidden font-fw-sans text-caption text-text-tertiary sm:inline">{dateLabel}</span>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border-subtle bg-surface p-1 shadow-flat">
            <IconButton variant="ghost" size="sm" aria-label="Earlier time" onClick={() => moveSelection(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <Select
              aria-label="Start time"
              value={selectedStart}
              onValueChange={(value) => value && setStart(value)}
              size="sm"
              options={validStarts.map((slot) => ({ value: slot.start, label: formatTime(slot.start, snapshot.timeZone) }))}
              className="min-w-[112px] border-0 bg-transparent px-0 shadow-none"
            />
            <IconButton variant="ghost" size="sm" aria-label="Later time" onClick={() => moveSelection(1)}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-fw-sans text-body-sm font-semibold text-text-primary">Compare schedules</p>
            <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">{snapshot.timeZone} · checked {formatTime(snapshot.checkedAt, snapshot.timeZone)}</p>
          </div>
          <div className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-fw-sans text-caption font-semibold',
            evaluation.allAvailable ? 'bg-fw-success-bg text-fw-success-ink' : evaluation.unknown ? 'bg-fw-warning-bg text-fw-warning-ink' : 'bg-fw-danger-bg text-fw-danger-ink',
          )} role="status">
            {evaluation.allAvailable ? <Check className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            {availableSummary}
          </div>
        </div>

        <div className="overflow-hidden rounded-card border border-border-subtle bg-surface shadow-flat">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div>
              <p className="font-fw-sans text-caption font-semibold uppercase tracking-[0.1em] text-text-tertiary">{duration}-min windows</p>
              <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">Drag the window or choose a start time below.</p>
            </div>
            <GlassSurface
              surface="chrome"
              padding="none"
              animateIn={false}
              role="slider"
              tabIndex={0}
              aria-label="Move selected time window"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, validStarts.length - 1)}
              aria-valuenow={selectedIndex}
              aria-valuetext={selectedWindowText}
              onKeyDown={handleDragKeyDown}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
              className="flex min-h-11 touch-none items-center gap-1.5 px-3 py-1.5 font-fw-sans text-caption font-medium text-accent-700 shadow-flat outline-none transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-border-focus motion-reduce:transition-none"
            >
              <GripVertical className="h-4 w-4" aria-hidden="true" />
              {selectedWindowText}
            </GlassSurface>
          </div>
          <div
            ref={timelineRef}
            className="overflow-x-auto overscroll-x-contain touch-pan-x"
            data-dragging={dragging || undefined}
          >
            <div
              className="grid min-w-max [--slot-width:24px] md:[--slot-width:44px]"
              style={{ gridTemplateColumns: `96px repeat(${slots.length}, minmax(var(--slot-width), 1fr))` }}
            >
              <div className="sticky left-0 z-20 border-b border-r border-border-subtle bg-surface px-3 py-3 font-fw-sans text-caption font-semibold text-text-tertiary">People</div>
              {slots.map((slot, index) => {
                const selected = slot.start >= selectedStart && slot.start < selectedEnd;
                const showLabel = slot.minuteOfDay % 60 === 0;
                return (
                  <Button
                    variant="ghost"
                    size="md"
                    type="button"
                    key={slot.start}
                    aria-label={`Choose ${formatTime(slot.start, snapshot.timeZone)} start`}
                    aria-pressed={selected}
                    onClick={(event) => {
                      event.stopPropagation();
                      setStart(slot.start);
                    }}
                    className={cn(
                      'relative min-h-14 w-full !rounded-none !border-0 border-b border-r border-border-subtle px-2 text-left font-fw-mono text-caption text-text-tertiary transition-colors hover:bg-surface-tint focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
                      selected && 'bg-accent-50 text-accent-700',
                      index === 0 && 'border-l-0',
                    )}
                  >
                    {showLabel ? formatTime(slot.start, snapshot.timeZone) : null}
                  </Button>
                );
              })}

              {snapshot.participants.map((participant) => (
                <React.Fragment key={participant.id}>
                  <Button
                    variant="ghost"
                    size="md"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPersonClick?.(participant.id);
                    }}
                    className="sticky left-0 z-20 flex min-h-[76px] w-full !rounded-none !border-0 border-b border-r border-border-subtle bg-surface px-3 text-left hover:bg-surface-tint focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
                    aria-label={`Open ${participantLabel(participant)} schedule`}
                  >
                    <span className="flex min-w-0 w-full items-center gap-2">
                      <Avatar
                        src={participant.avatarUrl ?? undefined}
                        name={participant.avatarUrl ? participantLabel(participant) : null}
                        alt={participantLabel(participant)}
                        fallback={<UserRound className="h-4 w-4" />}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">{participantLabel(participant)}</span>
                    </span>
                  </Button>
                  {slots.map((slot) => {
                    const selected = slot.start >= selectedStart && slot.start < selectedEnd;
                    const state = evaluation.states.get(participant.id) ?? 'unknown';
                    const interval = participant.intervals.find((candidate) => intervalOverlaps(candidate, slot.start, slot.end));
                    return (
                      <div
                        key={`${participant.id}-${slot.start}`}
                        className={cn(
                          'relative min-h-[76px] border-b border-r border-border-subtle p-1',
                          selected && 'bg-accent-50/70',
                          selected && slot.start === selectedStart && 'border-l-2 border-l-accent-500',
                          selected && slot.end >= selectedEnd && 'border-r-2 border-r-accent-500',
                        )}
                      >
                        {interval ? (
                          <div
                            className={cn(
                              'h-full min-h-[62px] rounded-fw-sm px-2 py-1.5 font-fw-sans text-microbadge',
                              interval.type === 'blocked' ? 'bg-text-tertiary/15 text-text-secondary' : 'bg-slate-200/80 text-slate-700',
                              selected && 'ring-1 ring-inset ring-fw-warning/70',
                            )}
                            title={intervalLabel(interval, snapshot.timeZone)}
                          >
                            <span className="block truncate">{interval.title || (interval.type === 'blocked' ? 'Busy' : 'Scheduled')}</span>
                          </div>
                        ) : state === 'unknown' ? (
                          <div className="flex h-full min-h-[62px] items-center justify-center rounded-fw-sm border border-dashed border-border-subtle bg-surface-sunken/70 px-1 text-center font-fw-sans text-microbadge text-text-tertiary">
                            Not verified
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle px-4 py-3 font-fw-sans text-caption text-text-secondary">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-slate-200" aria-hidden="true" /> Busy</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-dashed border-border-strong bg-surface-sunken" aria-hidden="true" /> Not verified</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-accent-100 ring-1 ring-inset ring-accent-500" aria-hidden="true" /> Selected</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-fw-display text-body-lg font-semibold text-text-primary">Suggested times</h2>
            <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">Based on the checked schedule window.</p>
          </div>
          {suggestions.length > 0 ? <span className="font-fw-sans text-caption text-text-tertiary">{suggestions.length} alternatives</span> : null}
        </div>
        {suggestions.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {suggestions.map(({ slot, evaluation: candidate }) => (
              <Button
                variant="ghost"
                size="md"
                type="button"
                key={slot.start}
                onClick={() => setStart(slot.start)}
                className="group min-h-20 w-full !rounded-card border border-border-subtle bg-surface px-4 py-3 text-left shadow-flat transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-accent-300 hover:bg-surface-tint hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus motion-reduce:transition-none"
              >
                <span className="flex w-full min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">{formatTime(slot.start, snapshot.timeZone)}–{formatTime(addMinutes(slot.start, duration), snapshot.timeZone)}</span>
                    <span className="mt-1 block font-fw-sans text-caption text-text-secondary">{candidate.requiredFree} of {candidate.requiredTotal} required free{candidate.unknown ? ` · ${candidate.unknown} unverified` : ''}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-border-subtle bg-surface-sunken px-4 py-4">
            <p className="font-fw-sans text-body-sm font-medium text-text-primary">No other verified openings in this window.</p>
            <p className="mt-1 font-fw-sans text-caption text-text-secondary">Try another date or adjust the duration.</p>
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-30 border-t border-border-subtle bg-canvas/95 px-4 py-3 shadow-[0_-8px_24px_rgba(35,33,29,0.06)] backdrop-blur-md sm:px-6 sm:pb-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-fw-sans text-caption font-semibold uppercase tracking-[0.1em] text-text-tertiary">Selected time</p>
            <p className="mt-0.5 truncate font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">{dateLabel} · {selectedWindowText}</p>
          </div>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            busy={loading}
            disabled={!canChoose || loading}
            onClick={() => onChoose({ start: selectedStart, end: selectedEnd })}
            className="sm:w-auto sm:min-w-[220px]"
          >
            Use this time
          </Button>
        </div>
      </footer>
    </section>
  );
}

export default SchedulingWorkspace;
