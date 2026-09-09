'use client';

import * as React from 'react';
import surfaces from '../CalendarSurfaces.module.css';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fwHaptic } from '@/lib/fairway/haptics';
import {
  Avatar,
  Button,
  IconButton,
  Input,
  PressTarget,
  Select,
} from '@/components/fairway';
import type {
  ScheduleInterval,
  ScheduleParticipant,
  ScheduleProposal,
  ScheduleEvaluation,
  ScheduleSnapshot,
} from '@/lib/calendar/scheduling-contracts';
import { acceptProposal, evaluateSchedule, suggestScheduleTimes } from '@/lib/calendar/scheduling/evaluate';
import { SchedulingTaskBoard } from './SchedulingTaskBoard';

const SLOT_MINUTES = 15;
const DEFAULT_DURATION = 60;
const DURATION_OPTIONS = [30, 60, 90, 120] as const;
/** A finger that moves further than this between down and up is a pan, not a tap. */
const TAP_SLOP_PX = 8;

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
  /** A static "Current" band (SCREEN-BUILD-PLAN.md §2.8, §17B) drawn on every
   * participant row — the event's OWN original time, distinct from the
   * movable selection band above. Dashed, no transition (`.reference`):
   * it marks a fact, not something being chosen, so it never competes
   * visually with the accent-filled selected band. Omit to render none. */
  referenceInterval?: { start: string; end: string; label?: string };
  /**
   * Participant ids to show by default when a fuller roster is present in
   * `snapshot.participants` — conflict detail (§2.8) passes only the people
   * whose OWN schedule produced the conflict, keeping "the shortest timeline
   * that explains the overlap" instead of every invited person. A "Show
   * everyone" control reveals the rest.
   *
   * Evaluation (`evaluateSelection`, `acceptProposal`, suggestions) always runs
   * against the FULL `snapshot.participants` regardless of this filter —
   * only which ROWS render changes. Hiding a person's row must never make a
   * proposed time look safer than it is.
   *
   * Ignored (no toggle rendered) when omitted, empty, or when it already
   * covers every participant in the snapshot — there is nothing left to
   * reveal, so a "Show everyone" control would be a no-op.
   */
  affectedParticipantIds?: string[];
  /** Hide the date `<Input>` in the header. A compact, single-day embedding
   * (like conflict detail) has no data for any day but the one it was built
   * for; changing the date field would relabel the header without changing
   * anything else on screen. Default true (unchanged behavior). */
  showDatePicker?: boolean;
  /** Footer CTA label. Default "Use this time"; conflict detail passes
   * "Review new time" — same `onChoose` wiring, different call to action. */
  primaryActionLabel?: string;
  /** Disables the board's confirm action regardless of acceptance — conflict detail
   * sets this while offline ("Resolve disabled", §2.8's offline state),
   * without borrowing `loading` (which would also relabel the button
   * "Publishing…"). Default false. */
  disablePrimaryAction?: boolean;
  /** Render without the sticky "Find a time" header — the host (conflict
   * detail) already provides its own chrome. Controls, timeline, status,
   * suggestions and the dock still render. Default false. */
  embedded?: boolean;
  /** What is being scheduled, shown in the header subtitle before the
   * duration (e.g. the draft event's title). Falls back to the people count. */
  contextLabel?: string;
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

/** "3 – 4 PM" / "11 AM – 12 PM" / "3:15 – 4:15 PM": minutes only when
 * needed, the period once when both ends share it. */
function formatWindowShort(start: string, end: string, timeZone: string): string {
  const parts = (value: string) => {
    const date = safeDate(value);
    if (!date) return null;
    const list = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).formatToParts(date);
    const hour = list.find((part) => part.type === 'hour')?.value ?? '';
    const minute = list.find((part) => part.type === 'minute')?.value ?? '00';
    const period = list.find((part) => part.type === 'dayPeriod')?.value ?? '';
    return { text: minute === '00' ? hour : `${hour}:${minute}`, period };
  };
  const a = parts(start);
  const b = parts(end);
  if (!a || !b) return 'Unknown time';
  if (a.period === b.period) return `${a.text} – ${b.text} ${b.period}`.trim();
  return `${a.text} ${a.period} – ${b.text} ${b.period}`.trim();
}

/** Short zone name ("EDT") for the status line. */
function shortZone(value: string, timeZone: string): string {
  const date = safeDate(value) ?? new Date();
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(date)
    .find((item) => item.type === 'timeZoneName');
  return part?.value ?? timeZone;
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
  referenceInterval,
  affectedParticipantIds,
  showDatePicker = true,
  primaryActionLabel = 'Use this time',
  disablePrimaryAction = false,
  embedded = false,
  contextLabel,
}: SchedulingWorkspaceProps) {
  const slots = React.useMemo(() => createSlots(snapshot), [snapshot]);
  const firstSlot = slots.find((slot) => slot.minuteOfDay >= 9 * 60)?.start ?? slots[0]?.start ?? snapshot.window.start;
  // Opening position: the caller's proposal when there is one; otherwise the
  // first window at or after 9 AM where everyone is free and verified, so a
  // fresh "Find a time" opens on a choosable slot instead of a busy one. Falls
  // back to 9 AM when the day has no such window (the timeline still shows why).
  const [selectedStart, setSelectedStart] = React.useState(() => {
    if (initialProposal?.start) return initialProposal.start;
    const wanted = durationBetween(undefined);
    const free = suggestScheduleTimes(snapshot, wanted, firstSlot).find((proposal) => {
      return acceptProposal(evaluateSelection(snapshot, proposal.start, addMinutes(proposal.start, wanted))).ok;
    });
    return free?.start ?? firstSlot;
  });
  const [duration, setDuration] = React.useState(durationBetween(initialProposal));
  const [dragging, setDragging] = React.useState(false);
  const timelineRef = React.useRef<HTMLDivElement>(null);
  const nameHeaderRef = React.useRef<HTMLDivElement>(null);
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

  // Affected-only filter (§2.8): only rendered when the filter would
  // actually hide someone — otherwise "Show everyone" would be a no-op.
  const hasAffectedFilter = Boolean(
    affectedParticipantIds
    && affectedParticipantIds.length > 0
    && affectedParticipantIds.length < snapshot.participants.length,
  );
  const [showEveryone, setShowEveryone] = React.useState(false);
  const visibleParticipants = hasAffectedFilter && !showEveryone
    ? snapshot.participants.filter((participant) => affectedParticipantIds!.includes(participant.id))
    : snapshot.participants;

  // Toggling the row count shrinks/grows the scrollable body under
  // `overflow-y-auto`, which the browser clamps `scrollTop` against — so
  // switching back restores a smaller value than the viewer left it at
  // unless it is captured and reapplied explicitly (never inferred from
  // "it usually just works"; verified in SchedulingWorkspace.test.tsx).
  const bodyScrollRef = React.useRef<HTMLDivElement>(null);
  const pendingScrollTopRef = React.useRef<number | null>(null);
  const toggleShowEveryone = () => {
    pendingScrollTopRef.current = bodyScrollRef.current?.scrollTop ?? null;
    setShowEveryone((current) => !current);
  };
  React.useLayoutEffect(() => {
    if (pendingScrollTopRef.current === null) return;
    if (bodyScrollRef.current) bodyScrollRef.current.scrollTop = pendingScrollTopRef.current;
    pendingScrollTopRef.current = null;
  }, [showEveryone]);

  React.useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const index = slots.findIndex((slot) => slot.start === (initialStart ?? firstSlot));
    const slotWidth = window.innerWidth < 768 ? 24 : 40;
    timeline.scrollLeft = Math.max(0, index - 2) * slotWidth;
  }, [firstSlot, initialStart, slots]);

  const selectedEnd = React.useMemo(() => addMinutes(selectedStart, duration), [duration, selectedStart]);
  const evaluation = React.useMemo(
    () => evaluateSelection(snapshot, selectedStart, selectedEnd),
    [selectedEnd, selectedStart, snapshot],
  );
  const dateLabel = formatDate(dateValue, snapshot.timeZone);

  const windowStartMs = Date.parse(snapshot.window.start);
  const windowEndMs = Date.parse(snapshot.window.end);
  const windowMs = Math.max(1, windowEndMs - windowStartMs);
  const lensLeft = 100 * (Date.parse(selectedStart) - windowStartMs) / windowMs;
  const lensWidth = 100 * duration * 60_000 / windowMs;
  /** Whether a start would be choosable — the shared acceptance rule. */
  const canChooseAt = (start: string) => acceptProposal(evaluateSelection(snapshot, start, addMinutes(start, duration))).ok;

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

  // ── Drag engine ──────────────────────────────────────────────────────────
  // While a finger is down the lens and its readout follow the pointer
  // continuously (free position written straight to the DOM inside one
  // animation frame, no React render, no transition) and the snapped slot is
  // committed to state only when the finger crosses a slot boundary. On
  // release the free offset is cleared and the band settles onto the snapped
  // slot through `.settle` (200ms). Grabbing the band keeps the grab offset,
  // so the window never jumps under the finger; grabbing the readout places
  // the window's start at the pointer (the keyboard/AT handle semantics the
  // drag test relies on).
  const lensRef = React.useRef<HTMLDivElement>(null);
  const labelRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ grabOffsetPx: number; frame: number | null; lastX: number }>({ grabOffsetPx: 0, frame: null, lastX: 0 });

  const trackMetrics = () => {
    const timeline = timelineRef.current;
    if (!timeline) return null;
    const rect = timeline.getBoundingClientRect();
    const nameWidth = nameHeaderRef.current?.offsetWidth || 96;
    // The schedule can be much wider than the viewport. Account for its
    // horizontal scroll position so dragging after a pan still lands on the
    // time under the finger rather than jumping back to the visible viewport.
    const trackWidth = Math.max(1, timeline.scrollWidth - nameWidth);
    return { rect, nameWidth, trackWidth, scrollLeft: timeline.scrollLeft };
  };

  /** Pointer x → px from the track's left edge (scroll-aware). */
  const trackX = (clientX: number) => {
    const metrics = trackMetrics();
    if (!metrics) return 0;
    return clientX - metrics.rect.left + metrics.scrollLeft - metrics.nameWidth;
  };

  const paintFreeLens = (startPx: number) => {
    const metrics = trackMetrics();
    if (!metrics) return;
    const slotPx = metrics.trackWidth / Math.max(1, slots.length);
    const maxStartPx = Math.max(0, (validStarts.length - 1) * slotPx);
    const clamped = Math.max(0, Math.min(maxStartPx, startPx));
    const leftPct = (100 * clamped) / metrics.trackWidth;
    // `--lens-free` is owned by the gesture, `--lens-left` by React; the
    // element's `left` reads the free value first (`.follow`), so a React
    // render mid-drag never yanks the band back to the snapped slot.
    lensRef.current?.style.setProperty('--lens-free', `${leftPct}%`);
    // The readout stays inside the visible part of the scroller so the time
    // under the finger is always legible, even with the band half off-screen.
    const timeline = timelineRef.current;
    const halfLabelPx = (labelRef.current?.offsetWidth ?? 96) / 2 + 8;
    const visibleStart = metrics.scrollLeft + halfLabelPx;
    const visibleEnd = metrics.scrollLeft + (timeline?.clientWidth ?? metrics.trackWidth) - metrics.nameWidth - halfLabelPx;
    const centerPx = clamped + (lensWidth / 100) * metrics.trackWidth / 2;
    const labelPx = visibleEnd > visibleStart ? Math.max(visibleStart, Math.min(visibleEnd, centerPx)) : centerPx;
    labelRef.current?.style.setProperty('--lens-free', `${(100 * labelPx) / metrics.trackWidth}%`);
  };

  /** The valid start a track position snaps to, or null when there is none. */
  const snappedStart = (startPx: number): string | null => {
    const metrics = trackMetrics();
    if (!metrics || validStarts.length === 0) return null;
    const fraction = Math.max(0, Math.min(0.999, startPx / metrics.trackWidth));
    const nextIndex = Math.min(validStarts.length - 1, Math.round(fraction * slots.length));
    return validStarts[nextIndex]?.start ?? null;
  };

  const commitSnapped = (startPx: number) => {
    const next = snappedStart(startPx);
    if (next && next !== selectedStart) setSelectedStart(next);
  };

  const selectFromPointer = (clientX: number) => {
    const startPx = trackX(clientX) - dragRef.current.grabOffsetPx;
    paintFreeLens(startPx);
    commitSnapped(startPx);
  };

  const scheduleFollow = (clientX: number) => {
    dragRef.current.lastX = clientX;
    if (dragRef.current.frame !== null) return;
    dragRef.current.frame = requestAnimationFrame(() => {
      dragRef.current.frame = null;
      selectFromPointer(dragRef.current.lastX);
    });
  };

  /** Finish the gesture. The release position (or, on cancel, the last
   * position a frame was queued for) is committed synchronously: a pending
   * animation frame is cancelled, never dropped, so the snapped time always
   * reflects where the finger actually let go — not the previous frame. */
  const endDrag = (finalX?: number) => {
    let pending: number | null = null;
    if (dragRef.current.frame !== null) {
      cancelAnimationFrame(dragRef.current.frame);
      dragRef.current.frame = null;
      pending = dragRef.current.lastX;
    }
    const commitX = finalX ?? pending;
    if (commitX !== null && commitX !== undefined) selectFromPointer(commitX);
    // Clear the free offset: React's snapped `left` takes over and `.settle`
    // eases the band onto the slot.
    lensRef.current?.style.removeProperty('--lens-free');
    labelRef.current?.style.removeProperty('--lens-free');
    setDragging(false);
  };

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>, mode: 'band' | 'handle') => {
    if (validStarts.length === 0) return;
    const metrics = trackMetrics();
    const lensStartPx = metrics ? (lensLeft / 100) * metrics.trackWidth : 0;
    dragRef.current.grabOffsetPx = mode === 'band' ? trackX(event.clientX) - lensStartPx : 0;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectFromPointer(event.clientX);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => beginDrag(event, 'handle');
  const handleBandPointerDown = (event: React.PointerEvent<HTMLDivElement>) => beginDrag(event, 'band');

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) scheduleFollow(event.clientX);
  };

  const cancelDrag = () => {
    if (dragging) endDrag();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    // Read the landing slot from the release position, not from `selectedStart`
    // (state — one render behind the commit endDrag is about to make).
    const landed = snappedStart(trackX(event.clientX) - dragRef.current.grabOffsetPx) ?? selectedStart;
    endDrag(event.clientX);
    fwHaptic(canChooseAt(landed) ? 'success' : 'selection');
  };

  // Lane taps: a pointer that goes down and comes up in the same place
  // places the window there. A pan (scrolling the schedule sideways, or the
  // page vertically) also ends in pointerup and must not.
  const tapRef = React.useRef<{ id: number; x: number; y: number } | null>(null);
  const handleLanePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    tapRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const handleLanePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const tap = tapRef.current;
    tapRef.current = null;
    if (dragging || !tap || tap.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP_PX) return;
    placeAtPointer(event.clientX);
  };
  const handleLanePointerCancel = () => {
    tapRef.current = null;
  };

  React.useEffect(() => () => {
    if (dragRef.current.frame !== null) cancelAnimationFrame(dragRef.current.frame);
  }, []);

  // Keep the selected band in view after any settled change (release, a
  // suggestion tap, the stepper): scroll the timeline, smoothly unless the
  // viewer prefers reduced motion. Never while a finger is down.
  React.useEffect(() => {
    if (dragging) return;
    const timeline = timelineRef.current;
    const metrics = trackMetrics();
    if (!timeline || !metrics) return;
    const lensStartPx = (lensLeft / 100) * metrics.trackWidth;
    const lensEndPx = lensStartPx + (lensWidth / 100) * metrics.trackWidth;
    const viewStart = timeline.scrollLeft;
    const viewEnd = viewStart + timeline.clientWidth - metrics.nameWidth;
    if (lensStartPx >= viewStart && lensEndPx <= viewEnd) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const target = Math.max(0, lensStartPx - metrics.trackWidth / Math.max(1, slots.length) * 2);
    if (typeof timeline.scrollTo === 'function') timeline.scrollTo({ left: target, behavior: reduce ? 'auto' : 'smooth' });
    else timeline.scrollLeft = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometry is read live; only the settled selection matters
  }, [dragging, lensLeft, lensWidth]);

  /** Tap on an empty part of a lane: centre the window under the finger. */
  const placeAtPointer = (clientX: number) => {
    const metrics = trackMetrics();
    if (!metrics) return;
    commitSnapped(trackX(clientX) - (lensWidth / 100) * metrics.trackWidth / 2);
    fwHaptic('selection');
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
      ? `${evaluation.requiredFree} of ${evaluation.requiredTotal} available · ${evaluation.unknown} unverified`
      : `${evaluation.requiredFree} of ${evaluation.requiredTotal} available`;

  const selectedWindowText = `${formatTime(selectedStart, snapshot.timeZone)}–${formatTime(selectedEnd, snapshot.timeZone)}`;
  // ONE acceptance rule (shared with the dialog's final recheck) drives the
  // board's state and the confirm action — see acceptProposal.
  const acceptance = acceptProposal(evaluation);
  const busyNames = snapshot.participants
    .filter((participant) => participant.required && evaluation.states.get(participant.id) === 'busy')
    .map(participantLabel);
  const unverifiedNames = snapshot.participants
    .filter((participant) => evaluation.states.get(participant.id) === 'unknown')
    .map(participantLabel);


  // Rows: the viewer first, then everyone else in snapshot order.
  const orderedParticipants = React.useMemo(() => {
    const viewer = visibleParticipants.filter((participant) => participant.isViewer);
    const others = visibleParticipants.filter((participant) => !participant.isViewer);
    return [...viewer, ...others];
  }, [visibleParticipants]);

  const hourPercent = `${100 * 60 / Math.max(1, slots.length * SLOT_MINUTES)}%`;
  const anyUnverified = snapshot.participants.some((participant) => participant.verification !== 'complete');
  const viewerIncluded = snapshot.participants.some((participant) => participant.isViewer);
  const peopleLine = viewerIncluded
    ? `You + ${snapshot.participants.length - 1} ${snapshot.participants.length - 1 === 1 ? 'player' : 'players'}`
    : `${snapshot.participants.length} ${snapshot.participants.length === 1 ? 'person' : 'people'}`;
  const checkedLine = `${peopleLine} · Team time (${shortZone(snapshot.checkedAt, snapshot.timeZone)}) · checked ${formatTime(snapshot.checkedAt, snapshot.timeZone)}`;
  const lensText = formatWindowShort(selectedStart, selectedEnd, snapshot.timeZone);
  const subtitle = `${contextLabel ?? `${snapshot.participants.length} ${snapshot.participants.length === 1 ? 'person' : 'people'}`} · ${duration} min`;
  const suggestionCards = [
    ...(evaluation.allAvailable
      ? [{ slot: { start: selectedStart, end: selectedEnd, minuteOfDay: minutesSinceMidnight(selectedStart, snapshot.timeZone) }, evaluation, current: true }]
      : []),
    ...suggestions.map((suggestion) => ({ ...suggestion, current: false })),
  ];

  const datePill = showDatePicker ? (
    <label className="relative flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border-subtle bg-surface px-3.5 font-fw-sans text-body-sm font-medium text-text-primary">
      <CalendarDays className="h-4 w-4 text-text-secondary" aria-hidden="true" />
      <span className="whitespace-nowrap">{dateLabel}</span>
      <ChevronDown className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
      <Input
        type="date"
        aria-label="Date"
        value={dateValue}
        onChange={(event) => setDate(event.target.value)}
        className="absolute inset-0 h-full w-full min-h-0 cursor-pointer rounded-full border-0 bg-transparent p-0 opacity-0 shadow-none"
      />
    </label>
  ) : null;

  return (
    <section
      aria-labelledby={embedded ? undefined : 'scheduling-workspace-title'}
      aria-label={embedded ? 'Find a time' : undefined}
      className={cn('flex min-h-0 w-full flex-1 flex-col text-text-primary', surfaces.scope, surfaces.panel)}
      data-testid="scheduling-workspace"
    >
      {!embedded ? (
        <header className="fw-glass-chrome sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:px-5">
          <IconButton variant="ghost" size="md" aria-label="Close scheduling workspace" onClick={onClose} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
          <div className="min-w-0 flex-1">
            <h1 id="scheduling-workspace-title" className="truncate font-fw-display text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] text-text-primary">
              Find a time
            </h1>
            <p className="mt-0.5 truncate font-fw-sans text-body-sm text-text-secondary">{subtitle}</p>
          </div>
          {datePill}
        </header>
      ) : null}

      <div
        ref={bodyScrollRef}
        data-testid="scheduling-body"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 pb-6 sm:px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6"
      >
        <div className="flex min-w-0 shrink-0 flex-col gap-4">
          {/* Controls: duration and start time, two quiet bordered groups. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="flex h-11 items-center gap-1.5 rounded-full border border-border-subtle bg-surface pl-3.5 pr-1">
              <Clock3 className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              <span className="font-fw-sans text-caption font-medium text-text-secondary">Duration</span>
              <Select
                aria-label="Duration"
                value={String(duration)}
                onValueChange={(value) => value && setDuration(Number(value))}
                size="sm"
                options={DURATION_OPTIONS.map((option) => ({ value: String(option), label: `${option} min` }))}
                className="min-w-[84px] border-0 bg-transparent px-1 shadow-none"
              />
            </div>
            <div className="flex h-11 items-center gap-0.5 rounded-full border border-border-subtle bg-surface p-1">
              <IconButton variant="ghost" size="sm" aria-label="Earlier time" onClick={() => moveSelection(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <Select
                aria-label="Start time"
                value={selectedStart}
                onValueChange={(value) => value && setStart(value)}
                size="sm"
                options={validStarts.map((slot) => ({ value: slot.start, label: formatTime(slot.start, snapshot.timeZone) }))}
                className="min-w-[104px] border-0 bg-transparent px-1 shadow-none"
              />
              <IconButton variant="ghost" size="sm" aria-label="Later time" onClick={() => moveSelection(1)}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
            {embedded ? datePill : null}
          </div>

          {hasAffectedFilter ? (
            <div className="flex shrink-0 items-center justify-between gap-3">
              <p className="font-fw-sans text-caption text-text-tertiary">
                {showEveryone ? 'Showing everyone invited.' : 'Showing only the people this overlap affects.'}
              </p>
              <Button variant="ghost" size="sm" aria-pressed={showEveryone} onClick={toggleShowEveryone}>
                {showEveryone
                  ? `Show affected only (${affectedParticipantIds!.length})`
                  : `Show everyone (${snapshot.participants.length})`}
              </Button>
            </div>
          ) : null}

          {/* ── The timeline: aligned rows under one selection lens ─────────── */}
          <div className="shrink-0 overflow-hidden rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]">
            <div
              ref={timelineRef}
              data-testid="scheduling-timeline"
              className="overflow-x-auto overscroll-x-contain touch-pan-x touch-pan-y"
              data-dragging={dragging || undefined}
            >
              <div
                className="relative grid min-w-max [--name-width:96px] [--slot-width:24px] md:[--name-width:104px] md:[--slot-width:40px]"
                style={{ gridTemplateColumns: `var(--name-width) repeat(${slots.length}, minmax(var(--slot-width), 1fr))` }}
              >
                {/* Row 1: the floating readout above the ruler. */}
                <div ref={nameHeaderRef} className="sticky left-0 z-20 bg-surface" aria-hidden="true" style={{ gridColumn: 1, gridRow: 1 }} />
                <div className="relative h-12" style={{ gridColumn: `2 / span ${slots.length}`, gridRow: 1 }}>
                  <div
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
                    onPointerUp={handlePointerUp}
                    onPointerCancel={cancelDrag}
                    ref={labelRef}
                    className={cn(
                      '!absolute top-1.5 z-30 flex h-9 w-max min-w-[88px] -translate-x-1/2 cursor-grab touch-none select-none items-center justify-center gap-1 rounded-full px-3.5 font-fw-sans text-body-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-border-focus active:cursor-grabbing',
                      surfaces.lensLabel,
                      surfaces.follow,
                      surfaces.settle,
                      dragging && surfaces.dragging,
                    )}
                    style={{ '--lens-left': `${lensLeft + lensWidth / 2}%` } as React.CSSProperties}
                  >
                    <GripVertical className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                    {lensText}
                  </div>
                </div>

                {/* Row 2: hour ruler. */}
                <div className="sticky left-0 z-20 border-b border-r border-border-subtle bg-surface" aria-hidden="true" style={{ gridColumn: 1, gridRow: 2 }} />
                {slots.map((slot, slotIndex) => {
                  const selected = slot.start >= selectedStart && slot.start < selectedEnd;
                  const isHour = slot.minuteOfDay % 60 === 0;
                  return (
                    <PressTarget
                      key={slot.start}
                      aria-label={`Choose ${formatTime(slot.start, snapshot.timeZone)} start`}
                      aria-pressed={selected}
                      style={{ gridColumn: slotIndex + 2, gridRow: 2 }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setStart(slot.start);
                      }}
                      className={cn(
                        'relative h-8 w-full border-b border-border-subtle px-0 font-fw-mono text-caption text-text-tertiary hover:bg-surface-sunken focus-visible:z-30 focus-visible:ring-inset focus-visible:ring-offset-0',
                        isHour && 'border-l border-l-border-subtle',
                        selected && 'text-accent-700',
                      )}
                    >
                      {isHour ? <span className="absolute left-1.5 top-1/2 -translate-y-1/2 whitespace-nowrap">{formatTime(slot.start, snapshot.timeZone).replace(':00', '')}</span> : null}
                    </PressTarget>
                  );
                })}

                {/* Rows 3+: one person per row. */}
                {orderedParticipants.map((participant, rowIndex) => (
                  <React.Fragment key={participant.id}>
                    <PressTarget
                      style={{ gridColumn: 1, gridRow: rowIndex + 3 }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPersonClick?.(participant.id);
                      }}
                      className="sticky left-0 z-20 flex min-h-[60px] w-full items-center gap-2 border-b border-r border-border-subtle bg-surface px-2.5 text-left hover:bg-surface-sunken focus-visible:z-30 focus-visible:ring-inset focus-visible:ring-offset-0 md:min-h-[64px]"
                      aria-label={`Open ${participantLabel(participant)} schedule`}
                    >
                      <Avatar
                        src={participant.avatarUrl ?? undefined}
                        name={participant.avatarUrl ? participantLabel(participant) : null}
                        alt={participantLabel(participant)}
                        fallback={<UserRound className="h-4 w-4" />}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">{participantLabel(participant)}</span>
                    </PressTarget>
                    <div
                      className={cn('relative min-h-[60px] border-b border-border-subtle md:min-h-[64px]', surfaces.laneGrid)}
                      style={{ gridColumn: `2 / span ${slots.length}`, gridRow: rowIndex + 3, ['--cal-slot' as string]: hourPercent }}
                      data-testid="scheduling-lane"
                      // Pointer-only convenience: tapping empty lane space
                      // centres the window there. The keyboard/AT path is the
                      // slider handle above; this adds no second control.
                      onPointerDown={handleLanePointerDown}
                      onPointerUp={handleLanePointerUp}
                      onPointerCancel={handleLanePointerCancel}
                    >
                      {participant.verification !== 'complete' ? (
                        <div className={cn('absolute inset-2 flex items-center rounded-fw-sm px-3 font-fw-sans text-caption', surfaces.hatch)}>Not verified</div>
                      ) : null}
                      {participant.intervals.map((interval) => {
                        const start = Math.max(windowStartMs, Date.parse(interval.start));
                        const end = Math.min(windowEndMs, Date.parse(interval.end));
                        if (end <= start) return null;
                        return (
                          <div
                            key={interval.id}
                            title={intervalLabel(interval, snapshot.timeZone)}
                            aria-label={intervalLabel(interval, snapshot.timeZone)}
                            className={cn(
                              'absolute inset-y-2 overflow-hidden rounded-fw-sm px-2.5 py-1.5',
                              interval.type === 'class' ? surfaces.class : interval.type === 'event' ? surfaces.team : interval.type === 'blocked' ? surfaces.personal : surfaces.busy,
                            )}
                            style={{ left: `${100 * (start - windowStartMs) / windowMs}%`, width: `${100 * (end - start) / windowMs}%` }}
                          >
                            <span className="block truncate font-fw-sans text-caption font-medium">{interval.title || 'Busy'}</span>
                            <span className="hidden truncate font-fw-mono text-microbadge opacity-75 md:block">{formatTime(interval.start, snapshot.timeZone)}–{formatTime(interval.end, snapshot.timeZone)}</span>
                          </div>
                        );
                      })}
                      {referenceInterval ? (() => {
                        const start = Math.max(windowStartMs, Date.parse(referenceInterval.start));
                        const end = Math.min(windowEndMs, Date.parse(referenceInterval.end));
                        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
                        const label = referenceInterval.label ?? 'Current';
                        const text = `${label}, ${formatTime(referenceInterval.start, snapshot.timeZone)}–${formatTime(referenceInterval.end, snapshot.timeZone)}`;
                        return (
                          <div
                            key="reference"
                            title={text}
                            aria-label={text}
                            className={cn('pointer-events-none absolute inset-y-2 overflow-hidden rounded-fw-sm px-2.5 py-1.5', surfaces.reference)}
                            style={{ left: `${100 * (start - windowStartMs) / windowMs}%`, width: `${100 * (end - start) / windowMs}%` }}
                          >
                            <span className="block truncate font-fw-sans text-caption font-semibold text-text-secondary">{label}</span>
                          </div>
                        );
                      })() : null}
                    </div>
                  </React.Fragment>
                ))}

                {/* The lens: one band over every row, clipped to the lanes. */}
                {orderedParticipants.length > 0 ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none relative z-10 overflow-visible"
                    style={{ gridColumn: `2 / span ${slots.length}`, gridRow: `3 / span ${orderedParticipants.length}` }}
                  >
                    <div
                      data-testid="scheduling-lens"
                      ref={lensRef}
                      onPointerDown={handleBandPointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={cancelDrag}
                      className={cn(
                        'pointer-events-auto absolute inset-y-0 cursor-grab touch-none select-none rounded-sm active:cursor-grabbing',
                        surfaces.lens,
                        surfaces.follow,
                        surfaces.settle,
                        dragging && surfaces.dragging,
                      )}
                      style={{ '--lens-left': `${lensLeft}%`, width: `${lensWidth}%` } as React.CSSProperties}
                    >
                      <span className={cn('absolute -left-[6px] -top-[6px] h-3 w-3 rounded-full', surfaces.lensGrip)} />
                      <span className={cn('absolute -right-[6px] -top-[6px] h-3 w-3 rounded-full', surfaces.lensGrip)} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Legend. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle px-4 py-2.5 font-fw-sans text-caption text-text-secondary">
              <span className="inline-flex items-center gap-1.5"><span className={cn('h-3.5 w-3.5 rounded-sm', surfaces.busy)} aria-hidden="true" /> Busy</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-sm border border-border-strong bg-surface" aria-hidden="true" /> Available</span>
              <span className="inline-flex items-center gap-1.5"><span className={cn('h-3.5 w-3.5 rounded-sm', surfaces.lens)} aria-hidden="true" /> Selected</span>
              {anyUnverified ? (
                <span className="inline-flex items-center gap-1.5"><span className={cn('h-3.5 w-3.5 rounded-sm', surfaces.hatch)} aria-hidden="true" /> Not verified</span>
              ) : null}
              {referenceInterval ? (
                <span className="inline-flex items-center gap-1.5"><span className={cn('h-3.5 w-3.5 rounded-sm', surfaces.reference)} aria-hidden="true" /> {referenceInterval.label ?? 'Current'}</span>
              ) : null}
              <span className="basis-full text-text-tertiary sm:ml-auto sm:basis-auto">{checkedLine}</span>
            </div>
          </div>
        </div>

        {/* ── Suggested times ──────────────────────────────────────────────── */}
        <aside className="flex min-w-0 shrink-0 flex-col gap-3 lg:sticky lg:top-0" aria-labelledby="scheduling-suggestions-heading">
          <div className="flex items-end justify-between gap-3">
            <h2 id="scheduling-suggestions-heading" className="font-fw-display text-title font-semibold tracking-[-0.01em] text-text-primary">Suggested times</h2>
            {suggestions.length > 0 ? <span className="font-fw-sans text-caption text-text-tertiary">{suggestions.length} {suggestions.length === 1 ? 'alternative' : 'alternatives'}</span> : null}
          </div>
          {suggestionCards.length > 0 ? (
            <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 lg:flex lg:flex-col">
              {suggestionCards.map(({ slot, evaluation: candidate, current }) => (
                <PressTarget
                  key={slot.start}
                  aria-pressed={current}
                  onClick={() => { if (!current) setStart(slot.start); }}
                  className={cn(
                    'group flex min-h-[64px] w-full items-center gap-3 rounded-fw-md border border-border-subtle bg-surface px-4 py-3 text-left [box-shadow:var(--fw-shadow-card)] hover:bg-surface-sunken',
                    current && 'border-accent-650 ring-1 ring-inset ring-accent-650',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-full',
                      current ? 'bg-accent-650 text-text-on-accent' : 'border-2 border-border-strong bg-surface',
                    )}
                  >
                    {current ? <Check className="h-4 w-4" strokeWidth={2.5} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-fw-sans text-body-lg font-semibold tabular-nums text-text-primary">{formatTime(slot.start, snapshot.timeZone)} – {formatTime(addMinutes(slot.start, duration), snapshot.timeZone)}</span>
                    <span className="mt-0.5 block font-fw-sans text-caption text-text-secondary">{candidate.requiredFree} of {candidate.requiredTotal} available{candidate.unknown ? ` · ${candidate.unknown} unverified` : ''}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                </PressTarget>
              ))}
            </div>
          ) : (
            <div className="rounded-card border border-dashed border-border-subtle bg-surface-sunken px-4 py-4">
              <p className="font-fw-sans text-body-sm font-medium text-text-primary">No other verified openings in this window.</p>
              <p className="mt-1 font-fw-sans text-caption text-text-secondary">Try another date or adjust the duration.</p>
            </div>
          )}
        </aside>
      </div>

      {/* The frame reserves the board's space below the scrolling body, so the
          board floats over nothing it could hide. */}
      <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-2 sm:px-5 sm:pb-4">
        <SchedulingTaskBoard
          className="mx-auto max-w-5xl"
          dateLabel={dateLabel}
          windowLabel={lensText}
          acceptance={acceptance}
          summary={availableSummary}
          busyNames={busyNames}
          unverifiedNames={unverifiedNames}
          error={error}
          onRetry={onRetry}
          nextOpen={suggestions[0] ? { start: suggestions[0].slot.start, label: formatWindowShort(suggestions[0].slot.start, addMinutes(suggestions[0].slot.start, duration), snapshot.timeZone) } : null}
          onJumpTo={setStart}
          primaryActionLabel={primaryActionLabel}
          onConfirm={() => onChoose({ start: selectedStart, end: selectedEnd })}
          loading={loading}
          disablePrimaryAction={disablePrimaryAction}
        />
      </div>
    </section>
  );
}

export default SchedulingWorkspace;
