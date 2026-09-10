'use client';

import surfaces from './CalendarSurfaces.module.css';

/** Event form with preserved drafts and explicit schedule verification. */

import * as React from 'react';
import {
  AlertTriangle,
  Trash2,
  Ban,
} from 'lucide-react';

import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { DiscardChangesModal } from '@/components/fairway/overlays/DiscardChangesModal';
import { Button } from '@/components/fairway/controls/button';
import { fwHaptic } from '@/lib/fairway/haptics';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type {
  GolfEventFormData,
  RecurringEditScope,
} from '@/components/golf/calendar/EventDetailModal';
import {
  computeAttendeeChanges,
  summarizeAttendeeChanges,
  toDateTimeLocalValue,
  buildRecurrenceRule,
  recurrenceFieldsFromRule,
} from '@/components/golf/calendar/event-form-helpers';
import { parseRecurrenceRule, describeRecurrenceRule } from '@/lib/golf/recurrence';
import { localDayIso } from '@/lib/golf/local-day';
import type { TeamPlayer } from './editor/types';
import type { PeoplePickerPerson } from './people/CalendarPeoplePicker';
import { EventEssentialsFields } from './editor/EventEssentialsFields';
import { EventPeopleTimeFields } from './editor/EventPeopleTimeFields';
import { EventReviewReceipt } from './editor/EventReviewReceipt';
import { EventEditorStageDots, EventEditorStageRail } from './editor/EventEditorStages';
import { useEventEditorStages, type EditorStageKey } from './editor/useEventEditorStages';
import { buildChangeSummary, isMoveOnlyChange } from './editor/changeDetection';
import type { ConflictData, VerificationStatus } from './editor/EventVerificationPanel';

export interface FairwayEventTimeRequest {
  date: string;
  attendeeIds: string[];
  startTime: string;
  endTime: string;
  endDate: string;
  eventId?: string;
}

export interface FairwayEventSuggestedTime {
  start: string;
  end: string;
  token: number;
}

export interface FairwayEventEditorProps {
  open: boolean;
  /** Keep the draft mounted while the shared scheduling workspace is open. */
  suspended?: boolean;
  onFindTime?: (request: FairwayEventTimeRequest) => void;
  suggestedTime?: FairwayEventSuggestedTime | null;
  onClose: () => void;
  /** null = create; an event = edit. */
  event: CalendarEvent | null;
  isCoach: boolean;
  onSave: (data: GolfEventFormData) => Promise<void>;
  /** Soft-cancel (status → 'cancelled', RSVPs kept, attendees notified). */
  onDelete?: (scope?: RecurringEditScope) => Promise<void>;
  /**
   * Restore a soft-cancelled event (status back to confirmed). When the
   * event is cancelled, editing is disabled and this is one of the two
   * actions offered (alongside `onDeletePermanently`). Optional — the
   * affordance only renders when wired.
   */
  onRestore?: () => Promise<void>;
  /**
   * Permanently erase a cancelled event (deleteGolfEventPermanently — a hard
   * DELETE that also removes every RSVP/attendance row; server-gated to
   * already-cancelled events). Only offered once the event is cancelled, next
   * to Restore — cancel and permanently-delete are now one coherent two-step
   * story instead of a single ambiguous control. Optional — hidden when unwired.
   */
  onDeletePermanently?: () => Promise<void>;
  isSaving: boolean;
  teamPlayers?: TeamPlayer[];
  currentUserId?: string;
  timezone?: string | null;
  /**
   * Seam for the real people picker (§2.3, W-People). Until the coordinator
   * wires it, the invite grid stays inline — passing this prop swaps the
   * grid for a summary button that opens the picker instead.
   */
  onOpenPeoplePicker?: () => void;
}

/**
 * Hand-rolled here and identical to `localDayIso()`, which the two legacy
 * editors already call. Three copies of one date rule is three chances to fix
 * two of them.
 */
function getTodayDate(): string {
  return localDayIso();
}

/** "HH:MM" -> minutes since midnight, or null if unparseable. */
function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function fromMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** "2026-08-14" -> "2026-08-15", via local parts (new Date(iso) is UTC-midnight). */
function addOneDay(iso: string): string | null {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** "2026-08-14" + n days, via local parts for the same reason addOneDay uses them. */
function addDays(iso: string, days: number): string | null {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Whole days from `from` to `to`, negative if `to` is earlier. */
function daysBetween(from: string, to: string): number | null {
  const [fy, fm, fd] = from.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = to.slice(0, 10).split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return null;
  const a = new Date(fy, fm - 1, fd).getTime();
  const b = new Date(ty, tm - 1, td).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Move the start DATE and carry the end date with it, preserving the span.
 *
 * The exact twin of shiftStartTime below, for the field that had no such
 * helper. Editing an event ALWAYS prefills a concrete endDate — every read-side
 * mapper falls back `end_time || start_time`, so even a single-day event opens
 * with endDate === startDate, behind a placeholder reading "Same day" that
 * never shows because the value is populated. Rescheduling via the Start date
 * picker alone therefore moved start PAST a stale end, and the first thing that
 * noticed was the server: golf.ts refineEventEndAfterStart answering "End date
 * must be on or after the start date" for a coach whose intent — move the event
 * later — was entirely valid.
 *
 * Measured: the Guilford head coach hit exactly this on 2026-09-01 02:36:24Z.
 *
 * Same restraint as shiftStartTime: with no usable end, the start moves alone
 * rather than inventing a date the coach never entered.
 */
export function shiftStartDate(form: GolfEventFormData, nextStartDate: string | null): GolfEventFormData {
  if (!nextStartDate) return { ...form, startDate: '' };
  if (!form.startDate || !form.endDate) return { ...form, startDate: nextStartDate };
  const span = daysBetween(form.startDate, form.endDate);
  if (span === null) return { ...form, startDate: nextStartDate };
  if (span <= 0) {
    // Single-day (or already-inverted): keep it single-day rather than
    // preserving a span that was never meaningful.
    return { ...form, startDate: nextStartDate, endDate: nextStartDate };
  }
  return { ...form, startDate: nextStartDate, endDate: addDays(nextStartDate, span) ?? nextStartDate };
}

/**
 * Move the start time and carry the end time with it, preserving duration.
 *
 * Start and end were two independent `<input type="time">`s: dragging a 9–11am
 * practice to 2pm left the end at 11am, so the coach submitted an inverted
 * window. Nothing client-side caught it — the first complaint came from the
 * server (zod superRefine in golf.ts, with a 23514 CHECK behind it), surfaced
 * as a banner at the top of the modal rather than on the field. This is
 * standard calendar behaviour and removes the most common way to produce that
 * error at all.
 *
 * Only shifts when BOTH times parse and a real duration exists. If the end is
 * unset, unparseable, or the event is all-day, the start moves alone — guessing
 * an end the coach never entered would be worse than leaving it blank.
 */
export function shiftStartTime(form: GolfEventFormData, nextStart: string | null): GolfEventFormData {
  const prevStartMin = toMinutes(form.startTime);
  const nextStartMin = toMinutes(nextStart);
  const endMin = toMinutes(form.endTime);

  if (form.allDay || prevStartMin === null || nextStartMin === null || endMin === null) {
    return { ...form, startTime: nextStart };
  }

  // Duration is measured forward, so an event already crossing midnight keeps
  // its length rather than collapsing to a negative span.
  const durationMin = (endMin - prevStartMin + 1440) % 1440;
  const endTotal = nextStartMin + durationMin;

  /**
   * Wrapping the CLOCK is not enough — the end DATE has to move with it.
   * Shifting a 9-11am practice to 11:30pm produced startTime 23:30 /
   * endTime 01:30 with endDate still null, and the pre-submit guard below
   * only compares clock times when there is no end date. It read 01:30 <=
   * 23:30 and rejected the event with "End time must be after the start
   * time" — the helper written to prevent that error was causing it.
   *
   * ADD ONLY, never remove. Adding a date when the shift newly crosses
   * midnight is unambiguous. Removing one is a guess: an endDate equal to
   * startDate+1 could be the wrap-shaped date this helper added, or a date
   * the coach chose deliberately for an overnight event, and nothing here can
   * tell those apart. Clearing it would silently collapse a span the coach
   * configured, so a no-longer-wrapping event keeps its end date — visible in
   * the End date field and the span summary, and correctable — rather than
   * being quietly shortened.
   */
  let endDate = form.endDate;
  if (endTotal >= 1440 && !endDate && form.startDate) {
    endDate = addOneDay(form.startDate);
  }

  return { ...form, startTime: nextStart, endTime: fromMinutes(endTotal), endDate };
}

/**
 * The wire shape of `checkScheduleConflicts`, which is NOT `ConflictData`.
 *
 * The action deliberately serializes the alternative slots to ISO strings
 * (`s.start.toISOString()`), and its own return type says so — `Date | string`.
 * Everything below this line treats them as Dates: the chips call
 * `toLocaleTimeString`, `selectSuggestedTime` calls `toISOString`/`toTimeString`.
 * The old `as ConflictData` assertion claimed the strings were already Dates.
 *
 * That lie was harmless only while the list was always empty. `suggestions`
 * had been reading a key the library never returned, so no chip ever rendered;
 * when that one-word mismatch was fixed the chips appeared and immediately
 * threw `e.start.toLocaleTimeString is not a function` inside `.map()` —
 * production, /golf/dashboard/calendar, 2026-08-19.
 */
type WireConflictData = Omit<ConflictData, 'suggestions'> & {
  suggestions?: Array<{ start: Date | string; end: Date | string }>;
};

/**
 * Convert the wire shape ONCE, at the boundary, so both consumers keep working.
 *
 * Patching only the render would have left `selectSuggestedTime` throwing on
 * click instead of on paint — a chip that appears and then breaks when used is
 * worse than one that never appears.
 *
 * Unparseable slots are dropped rather than rendered: `new Date('nonsense')`
 * does not throw, it yields an Invalid Date that formats as the literal string
 * "Invalid Date" and then produces a NaN timestamp the moment somebody picks it.
 */
function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeConflictData(raw: WireConflictData): ConflictData {
  return {
    hasConflict: raw.hasConflict,
    partial: raw.partial ?? false,
    conflicts: raw.conflicts ?? [],
    suggestions: (raw.suggestions ?? [])
      .map((s) => ({ start: toDate(s.start), end: toDate(s.end) }))
      .filter((s) => !Number.isNaN(s.start.getTime()) && !Number.isNaN(s.end.getTime())),
  };
}

const DEFAULT_FORM: GolfEventFormData = {
  title: '',
  eventType: 'practice',
  startDate: getTodayDate(),
  endDate: null,
  startTime: '09:00',
  endTime: '11:00',
  allDay: false,
  location: null,
  courseName: null,
  description: null,
  isMandatory: false,
  requiresRsvp: false,
  rsvpDeadline: null,
  maxAttendees: null,
  attendeeIds: [],
  recurrence: 'none',
  recurrenceCount: 10,
  recurrenceWeekdays: [],
  recurrenceEndMode: 'count',
  recurrenceUntil: null,
};

export function FairwayEventEditor({
  open,
  suspended = false,
  onFindTime,
  suggestedTime,
  onClose,
  event,
  isCoach,
  onSave,
  onDelete,
  onRestore,
  onDeletePermanently,
  isSaving,
  teamPlayers = [],
  currentUserId,
  onOpenPeoplePicker,
}: FairwayEventEditorProps) {
  const isCreating = !event;
  const availablePlayers = teamPlayers.filter((p) => p.id !== currentUserId);
  // The people picker (§2.3) owns its own search, so it gets the whole
  // roster rather than the query-filtered `visiblePlayers` the inline grid
  // shows; applying replaces the selection outright — that is what the
  // picker's Apply means, unlike the grid's per-avatar toggles.
  const pickerPeople = React.useMemo<PeoplePickerPerson[]>(
    () => availablePlayers.map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`.trim() || 'Player', avatarUrl: p.avatar_url ?? null })),
    [availablePlayers],
  );
  const applyAttendees = React.useCallback((ids: string[]) => {
    setFormData((prev) => ({ ...prev, attendeeIds: ids }));
  }, []);

  // Desktop means ≥1024px (SCREEN-BUILD-PLAN.md §2 shared rules): a
  // two-column layout with the review receipt always visible, no stage
  // stepper. Below that, the mobile staged flow (dots + Back/Continue dock)
  // applies — see EventEditorStages.tsx for why staging doesn't hide fields.
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Offline (§2.1 states): Publish and Find a time are disabled with an
  // explicit reason; every other field stays editable so the draft isn't
  // locked just because the network is down. `navigator.onLine` defaults to
  // `true` in every browser and in jsdom, so this never fires in existing
  // tests unless they explicitly flip it.
  const [isOffline, setIsOffline] = React.useState(
    () => typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine,
  );
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const [formData, setFormData] = React.useState<GolfEventFormData>(DEFAULT_FORM);
  /**
   * The event-name input carries a DOM `required` attribute, but this form has
   * no enclosing <form> to submit, so that attribute was purely decorative —
   * the primary button stayed clickable (`disabled: false`) against an empty
   * title. Computed early (not just near the footer) because the mobile
   * stage machine also needs it to gate Continue off the essentials stage.
   */
  const isTitleValid = formData.title.trim().length > 0;
  const tzAbbrev = React.useMemo(() => {
    const date = new Date(`${formData.startDate}T12:00:00`);
    if (!Number.isFinite(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? null;
  }, [formData.startDate]);
  // Roster filter. Only surfaced above 8 players (see the search box below);
  // the state is unconditional so clearing it can't strand a stale filter.
  const [attendeeQuery, setAttendeeQuery] = React.useState('');
  const visiblePlayers = React.useMemo(() => {
    const q = attendeeQuery.trim().toLowerCase();
    if (!q) return availablePlayers;
    return availablePlayers.filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q),
    );
  }, [availablePlayers, attendeeQuery]);
  // "Select all" acts on what the coach can SEE — selecting filtered-out
  // players would be an invisible side effect — and merges rather than
  // replaces, so it can't drop someone already invited.
  const allPlayersSelected =
    visiblePlayers.length > 0 && visiblePlayers.every((p) => formData.attendeeIds.includes(p.id));
  /**
   * The form as it was when the editor opened. Closing used to call onClose()
   * unconditionally from onOpenChange, so Escape, a scrim tap or the X silently
   * destroyed a fully-filled event — and the prefill effect overwrites formData
   * on the next open, so reopening could not recover it.
   */
  const pristineRef = React.useRef<GolfEventFormData | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // The banner renders at the top of a body the coach has usually scrolled to
  // the bottom of to reach Save — measured at y: -7, i.e. above the fold, so
  // "Create event" looked like a silent no-op (audit 2026-09-02, UI-5 / P1-8).
  const errorRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  const [conflicts, setConflicts] = React.useState<ConflictData | null>(null);
  const [conflictStatus, setConflictStatus] = React.useState<VerificationStatus>('idle');
  const [conflictRetry, setConflictRetry] = React.useState(0);
  const lastSuggestionToken = React.useRef<number | null>(null);
  // Two DISTINCT destructive confirms, matching weight (a real ModalShell
  // confirm dialog with consequence copy — same pattern as Delete Task),
  // never a bare inline tap-to-confirm:
  //   - pendingCancelConfirm  → soft-cancel a one-off event (onDelete()).
  //   - pendingHardDeleteConfirm → permanently erase an already-cancelled
  //     event (onDeletePermanently) — the previously-unwired
  //     deleteGolfEventPermanently action now has a real entry point.
  const [pendingCancelConfirm, setPendingCancelConfirm] = React.useState(false);
  const [pendingHardDeleteConfirm, setPendingHardDeleteConfirm] = React.useState(false);
  // Existing golf_event_attendance baseline for the event being edited.
  // null = not hydrated (loading or failed) — removals are NEVER computed
  // against a null baseline, so a slow/failed fetch can't wipe attendees.
  const [existingAttendeeIds, setExistingAttendeeIds] = React.useState<string[] | null>(null);
  const [attendeeHydration, setAttendeeHydration] = React.useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [attendeeRetry, setAttendeeRetry] = React.useState(0);

  // Edit prefill / create reset — verbatim from the legacy modal.
  React.useEffect(() => {
    if (!open) return;
    if (event && !isCreating) {
      const startDateTime = event.start_date || '';
      const endDateTime = event.end_date || '';
      let startDate = getTodayDate();
      let startTime: string | null = null;
      if (startDateTime) {
        const startD = new Date(startDateTime);
        if (!Number.isNaN(startD.getTime())) {
          startDate = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-${String(startD.getDate()).padStart(2, '0')}`;
          startTime = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`;
        }
      }
      let endDate: string | null = null;
      let endTime: string | null = null;
      if (endDateTime) {
        const endD = new Date(endDateTime);
        if (!Number.isNaN(endD.getTime())) {
          endDate = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
          endTime = `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`;
        }
      }
      // Convert to the user's LOCAL wall-clock for the datetime-local input
      // (the old toISOString prefill displayed UTC wall-time — audit #15).
      const rsvpDeadline = toDateTimeLocalValue(event.rsvp_deadline);
      const isAllDay = event.all_day ?? false;
      // All-day values represent calendar dates, not viewer-local instants.
      if (isAllDay) {
        startDate = startDateTime.slice(0, 10) || getTodayDate();
        endDate = endDateTime.slice(0, 10) || null;
      }
      const prefilled: GolfEventFormData = {
        title: event.title || '',
        eventType: (event.event_type as GolfEventFormData['eventType']) || 'practice',
        startDate,
        endDate,
        startTime: isAllDay ? null : startTime,
        endTime: isAllDay ? null : endTime,
        allDay: isAllDay,
        location: event.location || null,
        courseName: null,
        description: event.description || null,
        isMandatory: false,
        requiresRsvp: event.requires_rsvp ?? false,
        rsvpDeadline,
        maxAttendees: event.max_attendees ?? null,
        attendeeIds: [],
        recurrence: 'none',
        recurrenceCount: 10,
        recurrenceWeekdays: [],
        recurrenceEndMode: 'count',
        recurrenceUntil: null,
      };
      setFormData(prefilled);
      // Snapshot the SAME object the form starts from. `isDirty` compares
      // against this, so "dirty" means the coach changed something — not
      // merely that the editor opened.
      pristineRef.current = prefilled;
    } else {
      const blank: GolfEventFormData = { ...DEFAULT_FORM, startDate: getTodayDate() };
      setFormData(blank);
      pristineRef.current = blank;
    }
    setError(null);
    setPendingCancelConfirm(false);
    setPendingHardDeleteConfirm(false);
    setConflicts(null);
  }, [open, event, isCreating]);

  // Hydrate the attendee selection from the event's EXISTING attendance rows
  // (audit #4 — the edit form used to seed attendeeIds:[] and the save path
  // then deleted every invitee that wasn't re-selected). Toggles stay
  // disabled until this resolves so the selection always reflects reality.
  // Keyed on `event` IDENTITY to stay in lockstep with the reset effect above.
  React.useEffect(() => {
    if (!open || !event || isCreating) {
      setExistingAttendeeIds(null);
      setAttendeeHydration('idle');
      return;
    }
    let cancelled = false;
    setAttendeeHydration('loading');
    setExistingAttendeeIds(null);
    (async () => {
      try {
        const { getEventRSVP } = await import('@/app/golf/actions/golf');
        const result = await getEventRSVP(event.id);
        if (cancelled) return;
        if (result.success && result.data) {
          const ids = result.data.summary.attendees.map((a) => a.playerId);
          setExistingAttendeeIds(ids);
          setFormData((prev) => ({ ...prev, attendeeIds: Array.from(new Set([...ids, ...prev.attendeeIds])) }));
          // Hydration is not a coach edit. pristineRef was snapshotted when
          // the editor opened, before these ids arrived, so without
          // re-baselining, opening an event that HAS attendees and closing it
          // untouched raised the discard-changes warning over nothing.
          if (pristineRef.current) {
            pristineRef.current = { ...pristineRef.current, attendeeIds: ids };
          }
          setAttendeeHydration('loaded');
        } else {
          setAttendeeHydration('error');
        }
      } catch {
        if (!cancelled) setAttendeeHydration('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, event, isCreating, attendeeRetry]);

  // Series-root edits: prefill the recurrence pattern from the stored rule so
  // the series can be extended (more occurrences / later end date) or
  // re-shaped (e.g. add Wednesdays to a M/F practice).
  const isSeriesRoot = !isCreating && Boolean(event?.recurrence_rule) && !event?.parent_event_id;
  React.useEffect(() => {
    if (!open || !isSeriesRoot || !event?.recurrence_rule) return;
    const rule = parseRecurrenceRule(event.recurrence_rule);
    if (rule) {
      const fields = recurrenceFieldsFromRule(rule);
      setFormData((prev) => ({ ...prev, ...fields, recurrenceRule: rule }));
      // Same re-baseline as the attendee hydration above: prefilling a stored
      // pattern is not an edit the coach made.
      if (pristineRef.current) {
        pristineRef.current = { ...pristineRef.current, ...fields, recurrenceRule: rule };
      }
    }
  }, [open, isSeriesRoot, event]);

  // Pending attendee delta vs the hydrated baseline. Null until hydration
  // succeeds — removals are only ever computed from a loaded baseline.
  const attendeeChanges = React.useMemo(() => {
    if (isCreating || existingAttendeeIds === null) return null;
    return computeAttendeeChanges(existingAttendeeIds, formData.attendeeIds);
  }, [isCreating, existingAttendeeIds, formData.attendeeIds]);
  const attendeeChangeSummary = attendeeChanges ? summarizeAttendeeChanges(attendeeChanges) : null;

  // The excluded event ID prevents self-overlap; every selected person must
  // be checked again when the event moves, including existing invitees.
  const conflictCheckIds = formData.attendeeIds;

  React.useEffect(() => {
    if (!open || !suggestedTime || suggestedTime.token === lastSuggestionToken.current) return;
    const start = new Date(suggestedTime.start);
    const end = new Date(suggestedTime.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return;
    lastSuggestionToken.current = suggestedTime.token;
    setFormData((prev) => ({
      ...prev,
      startDate: localDayIso(start),
      endDate: localDayIso(end),
      startTime: start.toTimeString().slice(0, 5),
      endTime: end.toTimeString().slice(0, 5),
      allDay: false,
    }));
  }, [open, suggestedTime]);

  // Live human-readable summary of the pattern being built, e.g.
  // "Every 2 weeks on Mon, Wed, Fri until Aug 15, 2026".
  const recurrencePreview = React.useMemo(() => {
    if (formData.recurrence === 'none') return null;
    const rule = buildRecurrenceRule(formData, formData.startDate);
    return rule ? describeRecurrenceRule(rule) : null;
  }, [formData]);

  // Invalidate the previous result as soon as the proposal changes. Requests
  // include all-day windows and an empty player list (the server adds You).
  React.useEffect(() => {
    let cancelled = false;
    setConflicts(null);
    if (!open || event?.status === 'cancelled' || !formData.startDate ||
        (!formData.allDay && (!formData.startTime || !formData.endTime))) {
      setConflictStatus('idle');
      return;
    }
    if (!isCreating && attendeeHydration !== 'loaded') {
      setConflictStatus(attendeeHydration === 'error' ? 'error' : 'checking');
      return;
    }
    setConflictStatus('checking');
    async function check() {
      try {
        const { checkScheduleConflicts } = await import('@/app/golf/actions/golf');
        const result = await checkScheduleConflicts(
          formData.startDate,
          formData.allDay ? '00:00' : formData.startTime!,
          formData.endDate || formData.startDate,
          formData.allDay ? '23:59' : formData.endTime!,
          conflictCheckIds,
          event?.id,
          new Date(`${formData.startDate}T${formData.startTime || '00:00'}`).getTimezoneOffset(),
          formData.allDay,
        );
        if (cancelled) return;
        if (result.success && result.data) {
          setConflicts(normalizeConflictData(result.data as WireConflictData));
          setConflictStatus('ready');
        } else {
          setConflictStatus('error');
        }
      } catch {
        if (!cancelled) setConflictStatus('error');
      }
    }
    const timer = setTimeout(check, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, isCreating, event?.id, event?.status, attendeeHydration, conflictCheckIds, formData.startDate, formData.startTime, formData.endTime, formData.endDate, formData.allDay, conflictRetry]);

  const isInSeries = !isCreating && Boolean(event && (event.parent_event_id || event.recurrence_rule));
  const [pendingScopeAction, setPendingScopeAction] = React.useState<null | 'edit' | 'delete'>(null);

  /**
   * Assemble the outgoing payload (mirrors the legacy EventDetailModal):
   * - recurrenceRule: structured rule built from the form's pattern fields
   *   (create, or series-root edit where the pattern can be extended).
   * - addAttendeeIds / removeAttendeeIds: explicit delta vs the hydrated
   *   attendance baseline. If hydration failed, everything selected is sent
   *   as an add and NO removals are sent (additive-only fail-safe).
   */
  const buildSubmitData = (): GolfEventFormData => {
    const rule = (isCreating || isSeriesRoot)
      ? buildRecurrenceRule(formData, formData.startDate)
      : null;
    const data: GolfEventFormData = { ...formData, recurrenceRule: rule };
    if (!isCreating) {
      if (attendeeChanges) {
        data.addAttendeeIds = attendeeChanges.addAttendeeIds;
        data.removeAttendeeIds = attendeeChanges.removeAttendeeIds;
      } else {
        data.addAttendeeIds = formData.attendeeIds;
        data.removeAttendeeIds = [];
      }
    }
    return data;
  };

  const submitWithScope = async (scope: RecurringEditScope) => {
    setError(null);
    try {
      if (pendingScopeAction === 'edit') {
        await onSave({ ...buildSubmitData(), editScope: scope });
        fwHaptic('success');
      } else if (pendingScopeAction === 'delete' && onDelete) {
        await onDelete(scope);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setPendingScopeAction(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.title.trim()) {
      setError('Event title is required');
      return;
    }
    // react-day-picker in single-select mode lets a coach DESELECT the chosen
    // day by clicking it again, which reaches DateChooser as null and lands
    // here as ''. Nothing checked it, so the empty string travelled all the way
    // to zod's dateString regex and came back as "Date must be YYYY-MM-DD" —
    // a format complaint about a field the coach had simply cleared. Measured
    // on 2026-09-01 02:39:34Z.
    if (!formData.startDate) {
      setError('Start date is required');
      return;
    }
    // Catch an inverted window here rather than letting the server do it. The
    // only previous check was zod's superRefine (golf.ts) with a 23514 CHECK
    // behind it, so the coach filled the whole form, submitted, and got a
    // top-of-modal banner back. Same-day only: an event that legitimately runs
    // past midnight has an end DATE, and comparing clock times alone would
    // reject it.
    if (!formData.allDay && !formData.endDate) {
      const startMin = toMinutes(formData.startTime);
      const endMin = toMinutes(formData.endTime);
      if (startMin !== null && endMin !== null && endMin <= startMin) {
        setError('End time must be after the start time.');
        return;
      }
    }
    if (isInSeries) {
      setPendingScopeAction('edit');
      return;
    }
    try {
      await onSave(buildSubmitData());
      fwHaptic('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    }
  };

  const handleRestore = async () => {
    if (!onRestore) return;
    setError(null);
    try {
      await onRestore();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore event');
    }
  };

  // Series events already get consequence-copy per scope in the scope picker
  // (submitWithScope); one-off events get a real confirm modal below instead
  // of a bare inline "Tap to confirm" toggle (finding #45/#113/#181).
  const handleDelete = () => {
    if (!onDelete) return;
    setError(null);
    if (isInSeries) {
      setPendingScopeAction('delete');
      return;
    }
    setPendingCancelConfirm(true);
  };

  const confirmCancelEvent = async () => {
    if (!onDelete) return;
    setError(null);
    try {
      await onDelete();
      setPendingCancelConfirm(false);
    } catch (err) {
      setPendingCancelConfirm(false);
      setError(err instanceof Error ? err.message : 'Failed to cancel event');
    }
  };

  const confirmHardDelete = async () => {
    if (!onDeletePermanently) return;
    setError(null);
    try {
      await onDeletePermanently();
      setPendingHardDeleteConfirm(false);
    } catch (err) {
      setPendingHardDeleteConfirm(false);
      setError(err instanceof Error ? err.message : 'Failed to delete event');
    }
  };

  const toggleAttendee = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      attendeeIds: prev.attendeeIds.includes(id)
        ? prev.attendeeIds.filter((x) => x !== id)
        : [...prev.attendeeIds, id],
    }));
  };

  const selectSuggestedTime = (s: { start: Date; end: Date }) => {
    // ONE instant, ONE zone. This paired `toISOString()` — which renders the
    // instant in UTC — with `toTimeString()`, which renders it locally. West of
    // Greenwich those disagree for the last hours of every day: at 22:36 EDT
    // the date said tomorrow while the time said 22:36 tonight, so accepting a
    // conflict suggestion silently moved the event a day.
    //
    // localDayIso's own docblock is about exactly this shape
    // (`new Date().toISOString().split('T')[0]`) and exactly this consequence.
    const startDate = localDayIso(s.start);
    const startTime = s.start.toTimeString().slice(0, 5);
    const endTime = s.end.toTimeString().slice(0, 5);
    setFormData((prev) => ({ ...prev, startDate: startDate || prev.startDate, endDate: localDayIso(s.end), startTime, endTime, allDay: false }));
    setConflicts(null);
  };

  // Soft-cancelled events are read-only — the only offered action is
  // Restore (when wired). Re-cancelling is a no-op, so Delete is hidden too.
  const isCancelled = !isCreating && event?.status === 'cancelled';
  const locked = isSaving || isCancelled;
  const attendeesLoading = attendeeHydration === 'loading';

  /**
   * Has the coach actually changed anything since the editor opened?
   *
   * Structural compare against the prefill snapshot rather than a per-field
   * check: GolfEventFormData is a flat bag of primitives plus two string
   * arrays, so key order is stable across a spread and this cannot drift out
   * of sync the way an enumerated field list would every time a field is added.
   */
  const isDirty = React.useMemo(() => {
    if (!pristineRef.current) return false;
    return JSON.stringify(formData) !== JSON.stringify(pristineRef.current);
  }, [formData]);

  /**
   * Changed-field diff vs the prefill snapshot (§2.2 review receipt) and the
   * §7 "Move event" rule: the primary label becomes "Move event" only when
   * every changed field is a time field (start/end date or time, all-day),
   * never on create and never when anything else changed alongside the time.
   */
  const changedFields = React.useMemo(
    () => buildChangeSummary(pristineRef.current, formData),
    [formData],
  );
  const isMoveOnly = React.useMemo(
    () => !isCreating && isMoveOnlyChange(pristineRef.current, formData),
    [isCreating, formData],
  );
  const primaryLabel = isCreating ? 'Create event' : isMoveOnly ? 'Move event' : 'Save changes';

  /**
   * Mobile staged flow (§2.1): essentials -> people & time -> review. Every
   * field stays mounted regardless of `stage` (see EventEditorStages.tsx's
   * docblock) — this only drives the dot/dock UI and, on mobile, whether the
   * review receipt renders. Desktop ignores it and shows everything at once.
   */
  const canContinueStage = React.useCallback(
    (s: EditorStageKey) => {
      if (s === 'essentials') return isTitleValid;
      if (s === 'people-time') {
        return Boolean(formData.startDate) && (formData.allDay || Boolean(formData.startTime && formData.endTime));
      }
      return true;
    },
    [isTitleValid, formData.startDate, formData.allDay, formData.startTime, formData.endTime],
  );
  const stageResetKey = `${open}:${isCreating ? 'new' : event?.id}`;
  const { stage, stageIndex, stages, isFirst, isLast, canContinueNow, next, back, goTo } = useEventEditorStages({
    resetKey: stageResetKey,
    canContinue: canContinueStage,
  });
  const stageHeadingIds: Record<EditorStageKey, string> = {
    essentials: 'ev-stage-essentials',
    'people-time': 'ev-stage-people-time',
    review: 'ev-stage-review',
  };
  const focusStageHeading = React.useCallback((key: EditorStageKey) => {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      document.getElementById(stageHeadingIds[key])?.focus();
    });
    // stageHeadingIds is a stable literal object re-created each render but
    // with identical values — safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleStageContinue = () => {
    next();
    focusStageHeading(stages[Math.min(stageIndex + 1, stages.length - 1)]!.key);
  };
  const handleStageBack = () => {
    back();
    focusStageHeading(stages[Math.max(stageIndex - 1, 0)]!.key);
  };
  const handleStageGoTo = (key: EditorStageKey) => {
    goTo(key);
    focusStageHeading(key);
  };

  /**
   * Every close attempt funnels here — Escape, scrim tap, the X (all via
   * ModalShell's onOpenChange) and the footer Cancel button. An untouched form
   * closes immediately; a dirty one asks first.
   */
  function requestClose() {
    if (isSaving || suspended) return;
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onClose();
  }

  // Dock composition (see the footer below). Stages only exist on phones
  // and never on a cancelled event; the destructive action waits for the
  // review stage there so the first screen carries one primary action.
  const mobileStages = !isDesktop && !isCancelled;
  const showDestructive = !isCreating && Boolean(onDelete) && !isCancelled && (!mobileStages || isLast);
  const showDiscard = !isCancelled && isDirty;
  // The review receipt carries its own offline notice; the dock note only
  // fills in on the phone stages where the receipt isn't on screen.
  const showDockOfflineNote = isOffline && !(isDesktop || stage === 'review');

  return (
    <>
    <ModalShell
      open={open && !suspended}
      onOpenChange={(o) => {
        if (!o && !suspended) requestClose();
      }}
      size={isDesktop ? 'full' : 'xl'}
      title={isCreating ? 'New event' : isCancelled ? 'Cancelled event' : 'Edit event'}
      data-slot="event-editor"
      className={cn(surfaces.scope, surfaces.panel)}
    >
      {/* Recurring-series scope picker (edit/delete) — overrides the body */}
      {pendingScopeAction ? (
        <ModalShell.Body className="flex flex-col gap-3">
          <p className="font-fw-display text-body-lg font-semibold text-text-primary">
            {pendingScopeAction === 'delete' ? 'Delete recurring event' : 'Edit recurring event'}
          </p>
          <p className="font-fw-sans text-body-sm text-text-tertiary">
            This event is part of a series. Choose how the change should apply.
          </p>
          <div className="mt-1 flex flex-col gap-2">
            {([
              {
                scope: 'this' as const,
                label: 'This event only',
                sub: pendingScopeAction === 'edit'
                  ? 'Other occurrences keep their current details.'
                  : 'This occurrence is cancelled and attendees are notified. The rest of the series stays.',
              },
              {
                scope: 'thisAndFuture' as const,
                label: 'This and all future events',
                sub: pendingScopeAction === 'edit'
                  ? 'Past occurrences are left alone.'
                  : 'Permanently removes this and every later occurrence. Past ones are left alone.',
              },
              {
                scope: 'all' as const,
                label: 'All events in the series',
                sub: pendingScopeAction === 'edit'
                  ? 'Every occurrence picks up the change.'
                  : 'Permanently removes the whole series, including past occurrences.',
              },
            ]).map(({ scope, label, sub }) => (
              <Button
                key={scope}
                variant={pendingScopeAction === 'delete' && scope !== 'this' ? 'danger' : 'secondary'}
                className="h-auto w-full flex-col items-start gap-0.5 py-2.5 text-left"
                disabled={isSaving}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={scope === 'this'}
                onClick={() => submitWithScope(scope)}
              >
                <span className="font-fw-sans text-body-sm font-medium">{label}</span>
                <span className="font-fw-sans text-caption font-normal opacity-80">{sub}</span>
              </Button>
            ))}
            <Button variant="ghost" className="w-full" disabled={isSaving} onClick={() => setPendingScopeAction(null)}>
              Cancel
            </Button>
            {pendingScopeAction === 'delete' ? (
              <p className="font-fw-sans text-caption text-fw-danger-ink/80">
                Removing future or all occurrences is permanent — it can&apos;t be undone.
              </p>
            ) : null}
          </div>
        </ModalShell.Body>
      ) : (
        <>
          {/*
            ModalShell.Body's own `last:pb-6` never fires here — this Body is
            followed by a Footer sibling, so it's never actually the DOM
            last-child, and the fallback `py-2` (8px) left the last field
            (Repeat) flush against the footer with no breathing room. Adding
            an explicit pb here (twMerge lets it win over the base py-2/pb-6)
            fixes it locally without touching the shared shell. Likewise
            `[scrollbar-gutter:stable]` reserves a lane for a classic (non-
            overlay) scrollbar so it can never paint over field content —
            overlay scrollbars (macOS/iOS default) are unaffected.
          */}
          <ModalShell.Body className="flex flex-col gap-5 pb-8 pr-7 [scrollbar-gutter:stable]">
            {error ? (
              <div ref={errorRef} role="alert" className="flex items-center gap-2 rounded-fw-md border border-fw-danger/25 bg-fw-danger-bg px-4 py-3 font-fw-sans text-body-sm text-fw-danger-ink">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden />
                {error}
              </div>
            ) : null}

            {/* Cancelled banner — soft-cancel lifecycle. Editing is disabled;
                the two coherent next steps are Restore (undo the cancel) or
                permanently delete (the server-gated hard delete — only
                allowed once cancelled, or with zero attendance). Previously
                deleteGolfEventPermanently had no UI entry point at all. */}
            {isCancelled ? (
              <div
                role="status"
                className="flex flex-col gap-3 rounded-fw-md border border-border-subtle bg-surface-sunken px-4 py-3"
              >
                <span className="flex items-center gap-2 font-fw-sans text-body-sm text-text-secondary">
                  <Ban className="h-4 w-4 flex-shrink-0 text-text-tertiary" aria-hidden />
                  This event is cancelled. Editing is disabled.
                </span>
                {isCoach && (onRestore || onDeletePermanently) ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {onRestore ? (
                      <Button variant="secondary" type="button" onClick={handleRestore} disabled={isSaving}>
                        Restore event
                      </Button>
                    ) : null}
                    {onDeletePermanently ? (
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => setPendingHardDeleteConfirm(true)}
                        disabled={isSaving}
                        leftIcon={<Trash2 className="h-4 w-4" />}
                        className="text-fw-danger-ink hover:bg-fw-danger-bg hover:text-fw-danger-ink"
                      >
                        Delete permanently
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Mobile stage dock — see EventEditorStages.tsx for why staging
                doesn't hide any field below. Hidden on desktop (no stepper,
                everything is visible at once) and while cancelled (nothing
                to move toward). */}
            {!isDesktop && !isCancelled ? (
              <EventEditorStageDots
                stage={stage}
                stages={stages}
                stageIndex={stageIndex}
                onGoTo={handleStageGoTo}
                className={cn('sticky top-0 z-10 -mx-6 -mt-2 border-b px-4 py-1.5', 'fw-glass-chrome')}
              />
            ) : null}

            <div
              id={stageHeadingIds.essentials}
              role="group"
              aria-label="Essentials"
              tabIndex={-1}
              className="flex flex-col gap-5 outline-none"
            >
              <EventEssentialsFields formData={formData} onChange={setFormData} disabled={locked} />
            </div>

            <div
              id={stageHeadingIds['people-time']}
              role="group"
              aria-label="People and time"
              tabIndex={-1}
              className="outline-none"
            >
              <EventPeopleTimeFields
                formData={formData}
                setFormData={setFormData}
                shiftStartDate={shiftStartDate}
                shiftStartTime={shiftStartTime}
                disabled={locked}
                isCancelled={isCancelled}
                tzAbbrev={tzAbbrev}
                desktopSplit={isDesktop}
                offline={isOffline}
                eventId={event?.id}
                onFindTime={onFindTime ? (request) => onFindTime(request) : undefined}
                attendeesLoading={attendeesLoading}
                attendeeHydrationError={attendeeHydration === 'error'}
                availablePlayers={availablePlayers}
                visiblePlayers={visiblePlayers}
                attendeeQuery={attendeeQuery}
                onAttendeeQueryChange={setAttendeeQuery}
                allPlayersSelected={allPlayersSelected}
                onSelectAllPlayers={() =>
                  setFormData({
                    ...formData,
                    attendeeIds: Array.from(new Set([...formData.attendeeIds, ...visiblePlayers.map((p) => p.id)])),
                  })
                }
                onClearPlayers={() => setFormData({ ...formData, attendeeIds: [] })}
                onToggleAttendee={toggleAttendee}
                attendeeChangeSummary={attendeeChangeSummary}
                attendeeRemovalCount={attendeeChanges?.removeAttendeeIds.length ?? 0}
                onOpenPeoplePicker={onOpenPeoplePicker}
                pickerPeople={pickerPeople}
                onApplyAttendees={applyAttendees}
                verificationStatus={conflictStatus}
                conflicts={conflicts}
                onRetryAttendees={() => setAttendeeRetry((value) => value + 1)}
                onRetryConflicts={() => setConflictRetry((value) => value + 1)}
                onSelectSuggestion={selectSuggestedTime}
                showRecurrence={isCreating || isSeriesRoot}
                isSeriesRoot={isSeriesRoot}
                recurrencePreview={recurrencePreview}
              />
            </div>

            {/* Review receipt (§2.1/§2.2): always visible on desktop, gated
                to the review stage on mobile — see EventEditorStages.tsx. */}
            {!isCancelled && (isDesktop || stage === 'review') ? (
              <div id={stageHeadingIds.review} tabIndex={-1} className="outline-none">
                <EventReviewReceipt
                  headingId="ev-review-receipt-heading"
                  isCreating={isCreating}
                  formData={formData}
                  tzAbbrev={tzAbbrev}
                  totalPlayers={availablePlayers.length}
                  attendeeAddCount={attendeeChanges?.addAttendeeIds.length ?? 0}
                  attendeeRemoveCount={attendeeChanges?.removeAttendeeIds.length ?? 0}
                  recurrencePreview={recurrencePreview}
                  verificationStatus={conflictStatus}
                  conflicts={conflicts}
                  changes={changedFields}
                  offline={isOffline}
                />
              </div>
            ) : null}
          </ModalShell.Body>

          {/* The ONE bottom dock (§2.1): glass, pinned under the body. On
              phones the stage rail (Back / Continue) lives here on every
              stage but the last, where the publish action takes its place;
              on desktop there are no stages and the publish action is
              always present. Closing goes through the shell's X — the only
              extra affordance is a ghost "Discard" once the draft is dirty. */}
          <ModalShell.Footer
            data-slot="event-editor-dock"
            className={cn('flex-col items-stretch gap-2 border-t sm:items-center', 'fw-glass-chrome')}
          >
            {(showDestructive || showDiscard || isCancelled) ? (
              <div className="flex items-center justify-between gap-1 sm:mr-auto sm:justify-start">
                {/* deleteGolfEvent is a SOFT CANCEL for one-off events
                    (status → cancelled, RSVPs kept, attendees notified), so
                    the copy says "Cancel event"; series deletes go through
                    the scope picker where permanent removal is spelled out.
                    Hidden on an already-cancelled event — re-cancelling is a
                    no-op — and, on phones, until the review stage. */}
                {showDestructive && onDelete ? (
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={handleDelete}
                    disabled={isSaving}
                    leftIcon={<Trash2 className="h-4 w-4" />}
                    className="text-fw-danger-ink hover:bg-fw-danger-bg hover:text-fw-danger-ink"
                  >
                    {isInSeries ? 'Delete' : 'Cancel event'}
                  </Button>
                ) : null}
                {isCancelled ? (
                  <Button variant="ghost" type="button" onClick={requestClose} disabled={isSaving}>
                    Close
                  </Button>
                ) : null}
                {showDiscard ? (
                  <Button variant="ghost" type="button" onClick={requestClose} disabled={isSaving}>
                    Discard
                  </Button>
                ) : null}
              </div>
            ) : null}
            {!isCancelled ? (
              <div className="flex flex-col gap-1.5 sm:items-end">
                <div className="flex items-center gap-2">
                  {mobileStages ? (
                    <EventEditorStageRail
                      isFirst={isFirst}
                      isLast={isLast}
                      canContinueNow={canContinueNow}
                      onBack={handleStageBack}
                      onContinue={handleStageContinue}
                      fullWidth
                    />
                  ) : null}
                  {!mobileStages || isLast ? (
                    <Button
                      variant="primary"
                      type="button"
                      size="lg"
                      onClick={handleSubmit}
                      busy={isSaving}
                      disabled={isSaving || !isTitleValid || isOffline}
                      className={'flex-1 sm:flex-none'}
                    >
                      {primaryLabel}
                    </Button>
                  ) : null}
                </div>
                {showDockOfflineNote ? (
                  <p role="status" className="font-fw-sans text-caption text-fw-warning-ink">
                    Reconnect to publish. Your draft is kept.
                  </p>
                ) : null}
              </div>
            ) : null}
          </ModalShell.Footer>
        </>
      )}
    </ModalShell>

      {/* Cancel-event confirm — real weight, consequence copy, matches the
          Delete Task confirm dialog (title + description + ghost/danger
          footer), never a bare inline toggle (finding #45/#113/#181). */}
      {onDelete ? (
        <ModalShell
          open={pendingCancelConfirm}
          onOpenChange={(o) => {
            if (!o && !isSaving) setPendingCancelConfirm(false);
          }}
          size="sm"
          title="Cancel this event?"
          description={
            <>
              Cancel <span className="font-medium text-text-primary">{formData.title || 'this event'}</span>?
              Attendees are notified and every RSVP is kept. You can restore it later from the cancelled state.
            </>
          }
        >
          <ModalShell.Footer>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setPendingCancelConfirm(false)}
              disabled={isSaving}
            >
              Keep event
            </Button>
            <Button variant="danger" type="button" busy={isSaving} onClick={confirmCancelEvent}>
              Cancel event
            </Button>
          </ModalShell.Footer>
        </ModalShell>
      ) : null}

      {/* Permanent-delete confirm — only reachable once the event is already
          cancelled (matches the server's deleteGolfEventPermanently gate).
          Highest-weight copy: this is the one truly irreversible action. */}
      {onDeletePermanently ? (
        <ModalShell
          open={pendingHardDeleteConfirm}
          onOpenChange={(o) => {
            if (!o && !isSaving) setPendingHardDeleteConfirm(false);
          }}
          size="sm"
          title="Delete this event permanently?"
          description={
            <>
              Permanently delete{' '}
              <span className="font-medium text-text-primary">{formData.title || 'this event'}</span>? Every
              RSVP and attendance record for it is erased forever. This can&apos;t be undone.
            </>
          }
        >
          <ModalShell.Footer>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setPendingHardDeleteConfirm(false)}
              disabled={isSaving}
            >
              Keep event
            </Button>
            <Button variant="danger" type="button" busy={isSaving} onClick={confirmHardDelete}>
              Delete permanently
            </Button>
          </ModalShell.Footer>
        </ModalShell>
      ) : null}

      {/* Guards Escape, scrim tap, the X and the footer Cancel. Same primitive
          and copy as FairwayCreateTaskModal so the two dialogs behave alike. */}
      <DiscardChangesModal
        open={confirmDiscardOpen}
        onStay={() => setConfirmDiscardOpen(false)}
        onDiscard={() => {
          setConfirmDiscardOpen(false);
          onClose();
        }}
        itemLabel="event"
      />
    </>
  );
}
