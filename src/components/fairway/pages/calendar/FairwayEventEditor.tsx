'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayEventEditor — native create / edit event modal
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy EventDetailModal (coach create + edit). ALL
 * the form logic is copied VERBATIM — formData shape (GolfEventFormData), the
 * edit-mode prefill, the debounced conflict check (checkScheduleConflicts), the
 * recurring-series detection + scope picker, attendee toggling, and the
 * onSave/onDelete contract are byte-for-byte the same. Only the presentation
 * changes: a centered Fairway ModalShell + native inputs styled with Fairway
 * tokens (the proven-safe pattern — no Base UI control rewrite), a colored-avatar
 * attendee picker (same tints as the member rail), and a Fairway conflict notice.
 *
 * Wiring lives in FairwayCalendar (handleSaveEvent / handleDeleteEvent), which
 * replicates PremiumCalendarClient's payload mapping and calls the EXACT same
 * server actions (createGolfEvent / updateGolfEvent / deleteGolfEvent +
 * createRecurringEvent / editRecurringEvent / deleteRecurringEvent). No writes
 * are reimplemented here; this component only gathers form data.
 *
 * Coach-only (create + edit). The player path stays the read-only Fairway drawer.
 * ========================================================================== */

import * as React from 'react';
import {
  Dumbbell,
  Trophy,
  Flag,
  Users,
  Plane,
  CalendarDays,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  AlignLeft,
  Repeat,
  AlertTriangle,
  Trash2,
  Check,
  Ban,
  X,
  ChevronRight,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Surface, Inset } from '@/components/fairway/surfaces/surface';
import { DiscardChangesModal } from '@/components/fairway/overlays/DiscardChangesModal';
import { Button } from '@/components/fairway/controls/button';
import { Button as UiButton } from '@/components/ui/button';
import { Input as UiInput, Textarea as UiTextarea } from '@/components/ui/input';
import { Switch } from '@/components/fairway/forms/Switch';
import { Segmented } from '@/components/fairway/controls/segmented';
import {
  DateChooser,
  TimeChooser,
  SpanSummary,
} from '@/components/fairway/pages/calendar/EventWhenFields';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type {
  GolfEventFormData,
  RecurrenceFrequency,
  RecurringEditScope,
} from '@/components/golf/calendar/EventDetailModal';
import {
  computeAttendeeChanges,
  summarizeAttendeeChanges,
  toDateTimeLocalValue,
  buildRecurrenceRule,
  recurrenceFieldsFromRule,
  WEEKDAY_OPTIONS,
  MIN_RECURRENCE_COUNT,
  MAX_RECURRENCE_COUNT,
  type RecurrenceEndMode,
} from '@/components/golf/calendar/event-form-helpers';
import { parseRecurrenceRule, describeRecurrenceRule } from '@/lib/golf/recurrence';
import { tintFor } from './FairwayCalendarMemberRail';
import { localDayIso } from '@/lib/golf/local-day';

interface TeamPlayer {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}

export interface FairwayEventEditorProps {
  open: boolean;
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
}

type EventType = GolfEventFormData['eventType'];

const EVENT_TYPES: ReadonlyArray<{ type: EventType; label: string; icon: typeof Dumbbell }> = [
  { type: 'practice', label: 'Practice', icon: Dumbbell },
  { type: 'tournament', label: 'Tournament', icon: Trophy },
  { type: 'qualifier', label: 'Qualifier', icon: Flag },
  { type: 'meeting', label: 'Meeting', icon: Users },
  { type: 'travel', label: 'Travel', icon: Plane },
  { type: 'other', label: 'Other', icon: CalendarDays },
];

const RECURRENCE_OPTIONS: ReadonlyArray<{ value: RecurrenceFrequency; label: string }> = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
];

const fieldCls =
  'w-full rounded-fw-md border border-border-subtle bg-surface-sunken px-3 py-2 font-fw-sans text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent-500 focus:bg-surface focus:ring-2 focus:ring-accent-500/25 disabled:opacity-50';
const labelCls = 'mb-1.5 block font-fw-sans text-caption font-medium text-text-secondary';

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
 * Quick-duration chips.
 *
 * A coach almost never thinks "this practice ends at 11:00" — they think "this
 * practice is two hours". The end-time list is already duration-labelled
 * (EventWhenFields' one idea); this is the same relationship as a one-tap
 * control for the four lengths that cover nearly every team event.
 */
const DURATION_OPTIONS: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 60, label: '1h' },
  { minutes: 120, label: '2h' },
  { minutes: 180, label: '3h' },
  { minutes: 240, label: '4h' },
];

/**
 * How long the event currently runs, in minutes — or null when either end is
 * unset. Multi-day spans count the whole span, so a 2-day event never reports
 * itself as "2h" just because the clock times happen to be two hours apart.
 */
export function eventSpanMinutes(form: GolfEventFormData): number | null {
  const s = toMinutes(form.startTime);
  const e = toMinutes(form.endTime);
  if (s === null || e === null) return null;
  if (!form.startDate || !form.endDate || form.endDate === form.startDate) {
    // Forward-going, so an end past midnight is a real length rather than a
    // negative one — same convention TimeChooser labels its options with.
    return (e - s + 1440) % 1440;
  }
  const days = daysBetween(form.startDate, form.endDate);
  return days === null ? null : days * 1440 + (e - s);
}

/**
 * Make the event exactly `minutes` long, measured from its start.
 *
 * It sets the end DATE as well as the end time, because the two are one fact:
 * a 4-hour event starting at 10 PM ends tomorrow, and leaving endDate on the
 * start day would produce exactly the "End date must be on or after the start
 * date" rejection golf.ts's refineEventEndAfterStart already answers for. The
 * span the chip produces is stated immediately underneath by SpanSummary.
 */
export function applyDuration(form: GolfEventFormData, minutes: number): GolfEventFormData {
  const s = toMinutes(form.startTime);
  if (s === null) return form;
  const total = s + minutes;
  const endTime = fromMinutes(total);
  const endDate = form.startDate
    ? total >= 1440
      ? addDays(form.startDate, Math.floor(total / 1440))
      : form.startDate
    : form.endDate;
  return { ...form, endTime, endDate };
}

/** Small uppercase group label — the whole form uses ONE section treatment. */
const eyebrowCls =
  'font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary';

/**
 * One row of the "everything else" card.
 *
 * The trigger is a button and the revealed panel is its SIBLING, never its
 * child: a disclosure that wrapped its own fields inside the trigger would
 * nest interactive elements in a <button>, which is the hydration-crash class
 * this repo already bans for BentoCell with onOpen.
 *
 * A collapsed row still states its value, so nothing a coach has already
 * filled in becomes invisible.
 */
function DisclosureRow({
  id,
  icon,
  label,
  value,
  open,
  onToggle,
  isLast = false,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(!isLast && !open && 'border-b border-border-subtle')}>
      <UiButton
        variant="ghost"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        // Only while the panel exists — aria-controls pointing at an id
        // that is not in the DOM is a dangling reference.
        aria-controls={open ? `${id}-panel` : undefined}
        className={cn(
          'flex min-h-11 w-full items-center justify-between gap-3 rounded-none px-3.5 py-2 text-left',
          'hover:bg-surface-tint focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas',
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {icon}
          <span className="font-fw-sans text-body-sm font-medium text-text-primary">{label}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {value ? (
            <span className="min-w-0 truncate font-fw-sans text-caption text-text-tertiary">{value}</span>
          ) : null}
          <ChevronRight
            aria-hidden
            className={cn(
              'h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-fast motion-reduce:transition-none',
              open && 'rotate-90',
            )}
          />
        </span>
      </UiButton>
      {open ? (
        <Inset
          id={`${id}-panel`}
          padding="none"
          className={cn(
            'flex flex-col gap-4 rounded-none px-3.5 pb-4 pt-1',
            !isLast && 'border-b border-border-subtle',
          )}
        >
          {children}
        </Inset>
      ) : null}
    </div>
  );
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

interface ConflictData {
  hasConflict: boolean;
  conflicts: Array<{
    userId: string;
    userName: string;
    playerId?: string;
    conflictingEvent: { id: string; title: string; type: 'event' | 'class' | 'blocked'; start: string; end: string };
  }>;
  suggestions: Array<{ start: Date; end: Date }>;
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

type DisclosureKey = 'location' | 'invited' | 'more';
const NO_ROWS_OPEN: Record<DisclosureKey, boolean> = {
  location: false,
  invited: false,
  more: false,
};

export function FairwayEventEditor({
  open,
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
  timezone,
}: FairwayEventEditorProps) {
  const isCreating = !event;
  const availablePlayers = teamPlayers.filter((p) => p.id !== currentUserId);


  const tzAbbrev = React.useMemo(() => {
    if (!timezone) return null;
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' }).formatToParts(
        new Date(),
      );
      return parts.find((p) => p.type === 'timeZoneName')?.value ?? null;
    } catch {
      return null;
    }
  }, [timezone]);

  const [formData, setFormData] = React.useState<GolfEventFormData>(DEFAULT_FORM);
  /**
   * Which of the three "everything else" rows are expanded. Seeded per event
   * in the prefill effect: a row whose field already carries content opens by
   * itself, so editing an event with a location or a repeat pattern never
   * hides it behind a tap.
   */
  const [openRows, setOpenRows] = React.useState<Record<DisclosureKey, boolean>>(NO_ROWS_OPEN);
  const toggleRow = React.useCallback((key: DisclosureKey) => {
    setOpenRows((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
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
      const prefilled: GolfEventFormData = {
        title: event.title || '',
        eventType: (event.event_type as EventType) || 'practice',
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
      // A row with content opens itself; an empty one stays collapsed. The
      // invitee row is deliberately NOT in this list — its content arrives
      // asynchronously (the RSVP hydration below), and opening a section
      // under the coach's finger a beat after the sheet paints is worse than
      // the count the collapsed row already shows.
      setOpenRows({
        location: Boolean(event.location),
        invited: false,
        more:
          Boolean(event.description) ||
          Boolean(event.requires_rsvp) ||
          Boolean(event.recurrence_rule),
      });
      // Snapshot the SAME object the form starts from. `isDirty` compares
      // against this, so "dirty" means the coach changed something — not
      // merely that the editor opened.
      pristineRef.current = prefilled;
    } else {
      const blank: GolfEventFormData = { ...DEFAULT_FORM, startDate: getTodayDate() };
      setFormData(blank);
      setOpenRows(NO_ROWS_OPEN);
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
          setFormData((prev) => ({ ...prev, attendeeIds: ids }));
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
  }, [open, event, isCreating]);

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

  // In edit mode only check conflicts for NEWLY added players — existing
  // invitees already have this event in their schedule, so checking them
  // would flag the event against itself.
  const conflictCheckIds = React.useMemo(() => {
    if (!isCreating && attendeeChanges) return attendeeChanges.addAttendeeIds;
    return formData.attendeeIds;
  }, [isCreating, formData.attendeeIds, attendeeChanges]);

  // Live human-readable summary of the pattern being built, e.g.
  // "Every 2 weeks on Mon, Wed, Fri until Aug 15, 2026".
  const recurrencePreview = React.useMemo(() => {
    if (formData.recurrence === 'none') return null;
    const rule = buildRecurrenceRule(formData, formData.startDate);
    return rule ? describeRecurrenceRule(rule) : null;
  }, [formData]);

  // Debounced conflict check — verbatim contract (checkScheduleConflicts).
  React.useEffect(() => {
    let cancelled = false;
    async function check() {
      if (conflictCheckIds.length === 0 || !formData.startDate || formData.allDay) {
        setConflicts(null);
        return;
      }
      if (!formData.startTime || !formData.endTime) {
        setConflicts(null);
        return;
      }
      try {
        const { checkScheduleConflicts } = await import('@/app/golf/actions/golf');
        const result = await checkScheduleConflicts(
          formData.startDate,
          formData.startTime,
          formData.endDate || formData.startDate,
          formData.endTime,
          conflictCheckIds,
          undefined,
          /**
           * Anchor the proposed window to the coach's wall clock.
           *
           * The action's last parameter exists for exactly this (audit finding
           * #7) and defaults to UTC when omitted — which this call site did.
           * A coach in EDT picking 9:00 AM had the window compared as 09:00
           * UTC, i.e. 5:00 AM their time, so conflicts were computed against a
           * window four hours off the one on screen: real clashes missed, and
           * clashes reported against a slot the coach never chose.
           */
          new Date().getTimezoneOffset(),
        );
        if (!cancelled && result.success && result.data) {
          setConflicts(normalizeConflictData(result.data as WireConflictData));
        }
      } catch {
        /* conflict check failed — continue without warning */
      }
    }
    const t = setTimeout(check, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [conflictCheckIds, formData.startDate, formData.startTime, formData.endTime, formData.endDate, formData.allDay]);

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

  const toggleRecurrenceWeekday = (day: number) => {
    setFormData((prev) => {
      const current = prev.recurrenceWeekdays ?? [];
      return {
        ...prev,
        recurrenceWeekdays: current.includes(day)
          ? current.filter((d) => d !== day)
          : [...current, day].sort((a, b) => a - b),
      };
    });
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
    setFormData((prev) => ({ ...prev, startDate: startDate || prev.startDate, startTime, endTime, allDay: false }));
    setConflicts(null);
  };

  // Same robust first-letter extraction as FairwayCalendarMemberRail's
  // `initials` (finding #85) — skips a "(Captain)"/"(C)" role-tag suffix and
  // any other leading non-letter character instead of grabbing name[0] raw.
  const firstLetter = (name: string | null | undefined): string => {
    if (!name) return '';
    const match = name.replace(/\(.*?\)/g, '').match(/\p{L}/u);
    return match ? match[0] : '';
  };
  const initials = (p: TeamPlayer) => `${firstLetter(p.first_name)}${firstLetter(p.last_name)}`.toUpperCase() || '—';

  // Soft-cancelled events are read-only — the only offered action is
  // Restore (when wired). Re-cancelling is a no-op, so Delete is hidden too.
  const isCancelled = !isCreating && event?.status === 'cancelled';
  const locked = isSaving || isCancelled;
  const attendeesLoading = attendeeHydration === 'loading';

  /**
   * The event-name input carries a DOM `required` attribute, but this form has
   * no enclosing <form> to submit, so that attribute was purely decorative —
   * the primary button stayed clickable (`disabled: false`) against an empty
   * title, matching the Settings-page precedent's OPPOSITE of how a primary
   * action should behave (Save/Create stays disabled until the form is
   * actually submittable — see FairwaySettingsGeneral's `disabled={!isDirty}`
   * SaveRow gating). This mirrors that: the button reflects validity, not just
   * clickability. handleSubmit's own `if (!formData.title.trim())` guard is
   * UNCHANGED below — this is an added layer, not a replacement for it.
   */
  const isTitleValid = formData.title.trim().length > 0;

  const headerTitle = isCreating ? 'New event' : isCancelled ? 'Cancelled event' : 'Edit event';

  /** What each collapsed row says about itself. */
  const moreSummary = [
    formData.description ? 'Notes' : null,
    formData.requiresRsvp ? 'RSVP' : null,
    formData.recurrence !== 'none' ? 'Repeats' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  /** The event's current length, for the duration chips' pressed state. */
  const currentSpanMinutes = eventSpanMinutes(formData);

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
   * Every close attempt funnels here — Escape and a scrim tap (both via
   * ModalShell's onOpenChange), and the header X, which is a plain button
   * calling this rather than a Radix Dialog.Close — a Dialog.Close would
   * dismiss the dialog directly and walk straight past the discard guard.
   * An untouched form closes immediately; a dirty one asks first.
   */
  function requestClose() {
    if (isSaving) return;
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onClose();
  }

  return (
    <>
    <ModalShell
      open={open}
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
      size="xl"
      title={headerTitle}
      // The header is ours: X on the left, title in the middle, the primary
      // action on the right. ModalShell's own header block and its
      // absolutely-positioned close button would both land on top of it, so
      // both are suppressed — the sr-only Dialog.Title it still renders keeps
      // the dialog named for assistive tech.
      hideTitle
      hideClose
      data-slot="event-editor"
    >
      {/*
        ONE row of chrome, and the form owns every other pixel.

        What this replaces: a ModalShell.Footer carrying "Create event" +
        "Cancel" + "Cancel event", which on a phone stacks full-width
        (flex-col-reverse) into a 194px button bar. A flex item's automatic
        minimum size is content-based, so that bar CANNOT shrink, while
        ModalShell.Body (min-h-0) can — every pixel the viewport lost came out
        of the form. Measured in Chromium against a mirror of this exact
        geometry: iPhone 390x844 with the keyboard up left 210px of scrollable
        form under the 194px bar; a 375x667 phone left 69px, less than one
        field; landscape left 40px. That is the "End time is cut off behind
        the button bar" report — not a z-index overlap but a scroll window
        squeezed to nothing by chrome that refuses to give way.

        With the bar gone the panel is header + scroll region, so the shortest
        supported viewport can no longer starve the form: the only fixed cost
        is this 56px row.
      */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2.5 pt-3">
        <UiButton
          variant="ghost"
          type="button"
          onClick={requestClose}
          disabled={isSaving}
          aria-label="Close"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-sunken p-0 text-text-secondary hover:bg-surface-tint hover:text-text-primary focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas"
        >
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </UiButton>
        {/* aria-hidden: ModalShell renders this exact string as the dialog's
            sr-only accessible name, so announcing it twice is just noise. */}
        <span
          aria-hidden
          className="min-w-0 truncate font-fw-sans text-body-sm font-semibold tracking-[-0.01em] text-text-primary"
        >
          {headerTitle}
        </span>
        {/* The primary action, where the thumb already is. It keeps the
            title-validity gating the Settings pages set the precedent for
            (a primary that stays disabled until the form is submittable) —
            what changed is that it is no longer a grey slab in a stack of
            three: when it IS actionable it renders the full accent-650 fill,
            and the empty-name state is signalled at the name field itself
            rather than only by a dead button down here. */}
        {!isCancelled && !pendingScopeAction ? (
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={handleSubmit}
            busy={isSaving}
            disabled={isSaving || !isTitleValid}
            className="shrink-0"
          >
            {isCreating ? 'Create event' : 'Save changes'}
          </Button>
        ) : (
          // Keeps the title optically centred when there is no action.
          <span aria-hidden className="h-11 w-11 shrink-0" />
        )}
      </div>

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
            The ONLY scroll region in the editor, and now the last child of
            the panel — the Footer that used to follow it is gone, so
            ModalShell.Body's own `last:pb-6` does fire; the explicit `pb-8`
            keeps a little more air under the last row than the shell's
            default. `px-4` tightens the shell's `px-6` for phones. The panel
            is inset from the bottom by `env(safe-area-inset-bottom)`, so this
            edge already clears the home indicator without its own inset.
            `[scrollbar-gutter:stable]` reserves a lane for a classic (non-
            overlay) scrollbar so it can never paint over field content —
            overlay scrollbars (macOS/iOS default) are unaffected.
          */}
          <ModalShell.Body className="flex flex-col gap-4 px-4 pb-8 [scrollbar-gutter:stable]">
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

            {/* The name, first and large — it is the one thing that must be
                typed, and the only field that gates the primary action. The
                well carries a resting accent ring while it is empty on a new
                event, so "why is Create grey" is answered where the answer
                is, instead of by the button. */}
            <div
              className={cn(
                'rounded-fw-md bg-surface-sunken px-4 py-3 transition-shadow',
                'focus-within:ring-2 focus-within:ring-accent-500 focus-within:ring-offset-0',
                isCreating && !isTitleValid && !locked && 'ring-1 ring-accent-500/45',
              )}
            >
              <UiInput
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={locked}
                placeholder="Event name…"
                aria-label="Event title"
                className="w-full border-none bg-transparent px-0 py-0 font-fw-display text-h3 font-semibold tracking-[-0.02em] text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-0 focus-visible:ring-offset-0"
                required
              />
            </div>

            {/* Event type — same six types, same semantics, tighter row. */}
            <section aria-labelledby="ev-type-label" className="flex flex-col gap-2">
              <span id="ev-type-label" className={eyebrowCls}>
                Type
              </span>
              <div className="flex flex-wrap gap-1.5">
              {EVENT_TYPES.map(({ type, label, icon: Icon }) => {
                const active = formData.eventType === type;
                return (
                  <UiButton
                    key={type}
                    variant="ghost"
                    type="button"
                    onClick={() => setFormData({ ...formData, eventType: type })}
                    disabled={locked}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-fw-sans text-caption font-medium transition-colors',
                      // UiButton's base style hardcodes `ring-offset-white`
                      // (src/components/ui/button.tsx); twMerge only dedupes
                      // within the same ring-offset-* group, so the color
                      // override below doesn't touch it — a bright white
                      // square flashes around the ring in dark mode without
                      // this explicit override, matching FairwayDayStrip /
                      // FairwayEventCard's own `ring-offset-canvas` convention.
                      'focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas',
                      active
                        ? 'bg-accent-650 text-text-on-accent shadow-flat'
                        : 'border border-border-subtle bg-surface-sunken text-text-secondary hover:bg-surface-tint',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </UiButton>
                );
              })}
              </div>
            </section>

            {/* When — one 2x2 grid, unconditionally two columns.
                It was two `sm:grid-cols-2` grids, which means FOUR stacked
                full-width fields on every phone (the `sm` breakpoint is
                640px) and a When section taller than the rest of the form put
                together. Start date/start time on the first row, end
                date/end time on the second, so each column is one edge of the
                span. */}
            <section aria-labelledby="ev-when-label" className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <span id="ev-when-label" className={eyebrowCls}>When</span>
                <Switch
                  label="All day"
                  labelPosition="start"
                  className="gap-2 py-0"
                  checked={formData.allDay}
                  onCheckedChange={(checked) => setFormData({ ...formData, allDay: checked })}
                  disabled={locked}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <DateChooser
                  label="Start date"
                  labelIcon={<CalendarIcon className="h-3.5 w-3.5 text-accent-700" />}
                  value={formData.startDate || null}
                  onChange={(iso) => setFormData(shiftStartDate(formData, iso))}
                  disabled={locked}
                />
                {!formData.allDay ? (
                  <TimeChooser
                    label="Start time"
                    labelIcon={<Clock className="h-3.5 w-3.5 text-accent-700" />}
                    value={formData.startTime}
                    onChange={(hhmm) => setFormData(shiftStartTime(formData, hhmm))}
                    disabled={locked}
                  />
                ) : null}
                <DateChooser
                  label="End date"
                  value={formData.endDate}
                  onChange={(iso) => setFormData({ ...formData, endDate: iso })}
                  disabled={locked}
                  placeholder="Same day"
                />
                {/* Duration-aware: every end option is labelled with its length
                    from the chosen start, so picking an end IS picking a
                    duration. */}
                {!formData.allDay ? (
                  <TimeChooser
                    label="End time"
                    value={formData.endTime}
                    onChange={(hhmm) => setFormData({ ...formData, endTime: hhmm })}
                    disabled={locked}
                    durationFrom={formData.startTime}
                  />
                ) : null}
              </div>

              {/* One tap for the four lengths that cover nearly every team
                  event. Each sets the end FROM the start (date included, so a
                  late start that runs past midnight lands on tomorrow rather
                  than being rejected by the server's end-after-start rule). */}
              {!formData.allDay &&
              formData.startTime &&
              // Not offered for a genuinely multi-day event: no chip would be
              // lit, so they would read as unset and inviting, and a tap would
              // silently collapse a 3-day tournament to an afternoon.
              (!formData.endDate || formData.endDate === formData.startDate) ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Event duration">
                  {DURATION_OPTIONS.map((d) => {
                    const active = currentSpanMinutes === d.minutes;
                    return (
                      <UiButton
                        key={d.minutes}
                        variant="ghost"
                        type="button"
                        onClick={() => setFormData(applyDuration(formData, d.minutes))}
                        disabled={locked}
                        aria-pressed={active}
                        className={cn(
                          'relative inline-flex items-center rounded-full px-3 py-1 font-fw-sans text-caption font-medium transition-colors',
                          // Invisible hit-slop takes the 24px visual chip to
                          // the 44px WCAG 2.2 AA touch floor without growing
                          // the row — the same technique the weekday circles
                          // below and ModalShell's close button already use.
                          "before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-['']",
                          'focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas',
                          active
                            ? 'bg-accent-50 text-accent-700 ring-1 ring-accent-100'
                            : 'border border-border-subtle bg-surface-sunken text-text-secondary hover:bg-surface-tint',
                        )}
                      >
                        {d.label}
                      </UiButton>
                    );
                  })}
                </div>
              ) : null}

              {/* The span itself, stated once. The editor previously showed only
                  the fields the span was assembled from, never the result. */}
              {formData.startDate ? (
                <SpanSummary
                  startDate={formData.startDate}
                  endDate={formData.endDate}
                  startTime={formData.startTime}
                  endTime={formData.endTime}
                  allDay={formData.allDay}
                  timezoneLabel={!formData.allDay ? tzAbbrev : null}
                />
              ) : null}
            </section>

            {/* A schedule conflict is the one thing in this form a coach must
                not have to go looking for, so it sits at the top level rather
                than inside a collapsed row. */}
                {/* Conflict notice */}
                {conflicts?.hasConflict ? (
                  <div className="rounded-fw-md border border-fw-warning-ring bg-fw-warning-bg p-3">
                    <p className="flex items-center gap-1.5 font-fw-sans text-caption font-semibold text-fw-warning-ink">
                      <AlertTriangle className="h-3.5 w-3.5 text-fw-warning-ink" />
                      Schedule conflict
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {conflicts.conflicts.slice(0, 4).map((c, i) => (
                        <li key={`${c.userId}-${i}`} className="font-fw-sans text-caption text-fw-warning-ink">
                          {c.userName} — {c.conflictingEvent.title}
                          {c.conflictingEvent.type === 'class' ? (
                            <span className="ml-1 text-fw-warning-ink/70">(class)</span>
                          ) : c.conflictingEvent.type === 'blocked' ? (
                            <span className="ml-1 text-fw-warning-ink/70">(blocked time)</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {conflicts.suggestions.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {conflicts.suggestions.slice(0, 3).map((s, i) => (
                          <UiButton
                            key={i}
                            variant="ghost"
                            type="button"
                            onClick={() => selectSuggestedTime(s)}
                            className="rounded-full border border-border-subtle bg-surface px-2.5 py-1 font-fw-mono text-caption tabular-nums text-text-secondary transition-colors hover:bg-surface-tint focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas"
                          >
                            {s.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </UiButton>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

            {/* Everything else, on one card as three disclosure rows.
                Five stacked FormSections — Location, Notes, RSVP, Invitees,
                Repeat — each with an h2 heading and 20px of section air was
                most of the scroll depth on a phone, and none of it is what a
                coach fills in first. A collapsed row still states its value,
                so nothing already entered becomes invisible, and a row whose
                field arrives with content opens itself. The rows are Insets
                on ONE Surface: a tint step, never a card inside a card. */}
            <Surface padding="none" className="overflow-hidden">
              <DisclosureRow
                id="ev-location-row"
                icon={<MapPin className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />}
                label="Location"
                value={formData.location || null}
                open={openRows.location}
                onToggle={() => toggleRow('location')}
              >
              <UiInput
                id="ev-location"
                type="text"
                value={formData.location || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value || null })}
                disabled={locked}
                placeholder="Course, facility, or address"
                aria-label="Location"
                className={fieldCls}
              />
              </DisclosureRow>

              {availablePlayers.length > 0 ? (
                <DisclosureRow
                  id="ev-invited-row"
                  icon={<Users className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />}
                  label="Who's invited"
                  value={`${formData.attendeeIds.length} of ${availablePlayers.length}`}
                  open={openRows.invited}
                  onToggle={() => toggleRow('invited')}
                >
                {/* Select-all / clear. Inviting the whole team is the single
                    most common case (practice, lift, study hall) and used to
                    cost one tap per player. */}
                <div className="flex items-center gap-3">
                  <UiButton
                    variant="ghost"
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        attendeeIds: Array.from(
                          new Set([...formData.attendeeIds, ...visiblePlayers.map((p) => p.id)]),
                        ),
                      })
                    }
                    disabled={locked || attendeesLoading || allPlayersSelected}
                    className="h-auto p-0 font-fw-sans text-caption font-medium text-accent-700 underline-offset-2 hover:underline focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas disabled:no-underline disabled:opacity-40"
                  >
                    {attendeeQuery.trim() ? `Select ${visiblePlayers.length} shown` : 'Select all'}
                  </UiButton>
                  <UiButton
                    variant="ghost"
                    type="button"
                    onClick={() => setFormData({ ...formData, attendeeIds: [] })}
                    disabled={locked || attendeesLoading || formData.attendeeIds.length === 0}
                    className="h-auto p-0 font-fw-sans text-caption font-medium text-text-secondary underline-offset-2 hover:underline focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas disabled:no-underline disabled:opacity-40"
                  >
                    Clear
                  </UiButton>
                </div>

                {/* Search appears only once the roster is long enough to need
                    it — a filter box over eight names is clutter. */}
                {availablePlayers.length > 8 ? (
                  <UiInput
                    type="search"
                    value={attendeeQuery}
                    onChange={(e) => setAttendeeQuery(e.target.value)}
                    disabled={locked || attendeesLoading}
                    placeholder="Search the roster…"
                    aria-label="Search the roster"
                    className={cn(fieldCls, 'bg-surface')}
                  />
                ) : null}

                {attendeesLoading ? (
                  <p role="status" className="font-fw-sans text-caption text-text-tertiary">
                    Loading current invitees...
                  </p>
                ) : null}

                {attendeeHydration === 'error' ? (
                  <p
                    role="status"
                    className="rounded-fw-md border border-fw-warning-ring bg-fw-warning-bg px-3 py-2 font-fw-sans text-caption text-fw-warning-ink"
                  >
                    Couldn&apos;t load the current invitees. You can still add players — existing invites won&apos;t be changed.
                  </p>
                ) : null}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {visiblePlayers.map((p) => {
                    const selected = formData.attendeeIds.includes(p.id);
                    const tint = tintFor(p.id);
                    return (
                      <UiButton
                        key={p.id}
                        variant="ghost"
                        type="button"
                        onClick={() => toggleAttendee(p.id)}
                        disabled={locked || attendeesLoading}
                        aria-pressed={selected}
                        className={cn(
                          'flex items-center gap-2.5 rounded-fw-md border p-2 text-left transition-colors',
                          'focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas',
                          selected
                            ? 'border-accent-500 bg-accent-50'
                            : 'border-border-subtle bg-surface hover:bg-surface-tint',
                        )}
                      >
                        <span
                          className="relative grid h-8 w-8 flex-shrink-0 place-items-center overflow-hidden rounded-full font-fw-sans text-caption font-semibold ring-1 ring-border-subtle"
                          style={p.avatar_url ? undefined : { backgroundColor: tint.bg, color: tint.text }}
                        >
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initials(p)
                          )}
                          {selected ? (
                            <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent-500 ring-2 ring-surface">
                              <Check className="h-2.5 w-2.5 text-text-on-accent" />
                            </span>
                          ) : null}
                        </span>
                        {/* Full name, not a truncated "Last I." — the chip has
                            room to spare (filter chips show "CB", the agenda
                            shows "Cole Bennett"; this was the odd one out).
                            Truncating to the last name's FIRST CHARACTER is
                            also what turned a coach's placeholder profile name
                            into "Coach (." in the live app: last_name[0] on a
                            name like "(Nick Rini)" reads as "(", and the old
                            `${last_name[0]}.` built "(." from it. A full name
                            can't mangle that way — the worst case is just
                            longer, and `truncate` above already ellipsizes
                            anything that doesn't fit. */}
                        <span className="min-w-0 flex-1 truncate font-fw-sans text-caption font-medium text-text-primary">
                          {p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name}
                        </span>
                      </UiButton>
                    );
                  })}
                </div>

                {/* Pending attendee changes — the save summary. Removals only
                    ever come from explicit deselects against the hydrated
                    baseline, and they're called out before saving. */}
                {!isCancelled && attendeeChangeSummary ? (
                  <p
                    role="status"
                    className={cn(
                      'rounded-fw-md border px-3 py-2 font-fw-sans text-caption',
                      (attendeeChanges?.removeAttendeeIds.length ?? 0) > 0
                        ? 'border-fw-warning-ring bg-fw-warning-bg text-fw-warning-ink'
                        : 'border-accent-100 bg-accent-50 text-accent-700',
                    )}
                  >
                    Saving will update invites: {attendeeChangeSummary}.
                  </p>
                ) : null}
                </DisclosureRow>
              ) : null}

              <DisclosureRow
                id="ev-more-row"
                icon={<AlignLeft className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />}
                label="Notes, RSVP, repeat"
                value={moreSummary || null}
                open={openRows.more}
                onToggle={() => toggleRow('more')}
                isLast
              >
                <div className="flex flex-col gap-1.5">
                  <span className={eyebrowCls}>Notes</span>
              <UiTextarea
                id="ev-desc"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
                disabled={locked}
                rows={2}
                placeholder="Details for the team…"
                aria-label="Notes"
                className={cn(fieldCls, 'resize-none')}
              />
                </div>

                <div className="flex flex-col gap-3">
                  <span className={eyebrowCls}>RSVP</span>
              <Switch
                label="Require RSVP"
                description="Players respond Going / Maybe / Decline"
                checked={formData.requiresRsvp}
                onCheckedChange={(checked) => setFormData({ ...formData, requiresRsvp: checked })}
                disabled={locked}
              />
              {formData.requiresRsvp && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ev-rsvp-deadline" className={labelCls}>RSVP deadline</label>
                    <UiInput
                      id="ev-rsvp-deadline"
                      type="datetime-local"
                      value={formData.rsvpDeadline || ''}
                      onChange={(e) => setFormData({ ...formData, rsvpDeadline: e.target.value || null })}
                      disabled={locked}
                      className={cn(fieldCls, 'bg-surface')}
                    />
                    <p className="mt-1 font-fw-sans text-caption text-text-tertiary">Your local time</p>
                  </div>
                  <div>
                    <label htmlFor="ev-max" className={labelCls}>Max attendees</label>
                    <UiInput
                      id="ev-max"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={formData.maxAttendees ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, maxAttendees: e.target.value ? parseInt(e.target.value, 10) : null })
                      }
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      disabled={locked}
                      placeholder="No limit"
                      className={cn(fieldCls, 'bg-surface')}
                    />
                  </div>
                </div>
              )}
                </div>

                {/* Recurrence pattern — on create, and on series-root edit (the
                    series-extend affordance: bump the count or push the end date
                    to add occurrences, or re-shape the weekday pattern). Child
                    occurrences don't carry the pattern; their edits go through
                    the scope picker instead. */}
                {!isCancelled && (isCreating || isSeriesRoot) ? (
                  <div className="flex flex-col gap-3">
                    <span className={eyebrowCls}>
                      <Repeat className="mr-1.5 inline h-3.5 w-3.5 text-accent-700" aria-hidden />
                      {isSeriesRoot ? 'Series pattern' : 'Repeat'}
                    </span>
                {/* Visible chips, not a dropdown. The whole pattern is legible
                    at a glance and it matches the two pill rows this modal
                    already uses (event type above, weekdays below) — a coach
                    shouldn't have to open a menu to see how a practice
                    repeats. Wraps on mobile, where a 5-up segmented track
                    would not fit.
                    A series root can't be flipped back to a one-off here —
                    that's a delete-with-scope, not a pattern change. */}
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Recurrence">
                  {RECURRENCE_OPTIONS.filter((o) => !isSeriesRoot || o.value !== 'none').map((o) => {
                    const active = formData.recurrence === o.value;
                    return (
                      <UiButton
                        key={o.value}
                        variant="ghost"
                        type="button"
                        onClick={() => setFormData({ ...formData, recurrence: o.value })}
                        disabled={locked}
                        aria-pressed={active}
                        className={cn(
                          'inline-flex items-center rounded-full px-3 py-1.5 font-fw-sans text-caption font-medium transition-colors',
                          'focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas',
                          active
                            ? 'bg-accent-700 text-text-on-accent shadow-flat'
                            : 'border border-border-subtle bg-surface text-text-secondary hover:bg-surface-tint',
                        )}
                      >
                        {o.label}
                      </UiButton>
                    );
                  })}
                </div>

                {(formData.recurrence === 'weekly' || formData.recurrence === 'biweekly') && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-1.5" role="group" aria-label="Repeat on days">
                      {WEEKDAY_OPTIONS.map((day) => {
                        const selected = (formData.recurrenceWeekdays ?? []).includes(day.value);
                        return (
                          <UiButton
                            key={day.value}
                            variant="ghost"
                            type="button"
                            onClick={() => toggleRecurrenceWeekday(day.value)}
                            disabled={locked}
                            aria-pressed={selected}
                            aria-label={day.long}
                            className={cn(
                              'relative grid h-8 w-8 place-items-center rounded-full font-fw-sans text-caption font-medium transition-colors disabled:opacity-50',
                              // Invisible hit-slop expands the 32px visual chip to the
                              // 44px WCAG 2.2 AA touch-target floor without growing seven
                              // circles past the modal's mobile content width — same
                              // technique as ModalShell's close button (CLOSE_BUTTON_CLASS).
                              "before:absolute before:-inset-1.5 before:content-['']",
                              'focus-visible:ring-accent-500/40 focus-visible:ring-offset-canvas',
                              selected
                                ? 'bg-accent-650 text-text-on-accent shadow-flat'
                                : 'border border-border-subtle bg-surface text-text-secondary hover:bg-surface-tint',
                            )}
                          >
                            {day.short}
                          </UiButton>
                        );
                      })}
                    </div>
                    {(formData.recurrenceWeekdays ?? []).length === 0 ? (
                      <p className="font-fw-sans text-caption text-text-tertiary">
                        No days picked — repeats on the start date&apos;s weekday.
                      </p>
                    ) : null}
                  </div>
                )}

                {formData.recurrence !== 'none' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Two mutually exclusive modes — a segmented track shows
                        both at once where a dropdown hid one behind a click. */}
                    <div>
                      <span className={labelCls}>Series ends</span>
                      {/* Segmented takes no `disabled` — gate the wrapper so a
                          cancelled event's pattern still reads clearly. */}
                      <div className={cn(locked && 'pointer-events-none opacity-50')}>
                      <Segmented
                        value={formData.recurrenceEndMode ?? 'count'}
                        onValueChange={(v) =>
                          setFormData({ ...formData, recurrenceEndMode: v as RecurrenceEndMode })
                        }
                        size="sm"
                        fullWidth
                        aria-label="Series ends"
                        options={[
                          { value: 'count', label: 'After N events' },
                          { value: 'until', label: 'On a date' },
                        ]}
                      />
                      </div>
                    </div>
                    {(formData.recurrenceEndMode ?? 'count') === 'count' ? (
                      <div>
                        <label htmlFor="ev-recurrence-count" className={labelCls}>Occurrences</label>
                        <UiInput
                          id="ev-recurrence-count"
                          type="number"
                          min={MIN_RECURRENCE_COUNT}
                          max={MAX_RECURRENCE_COUNT}
                          inputMode="numeric"
                          value={formData.recurrenceCount}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              recurrenceCount: Math.max(
                                MIN_RECURRENCE_COUNT,
                                Math.min(MAX_RECURRENCE_COUNT, parseInt(e.target.value, 10) || 10),
                              ),
                            })
                          }
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          disabled={locked}
                          className={cn(fieldCls, 'bg-surface')}
                        />
                      </div>
                    ) : (
                      <DateChooser
                        label="Repeat until"
                        value={formData.recurrenceUntil ?? null}
                        onChange={(iso) => setFormData({ ...formData, recurrenceUntil: iso })}
                        disabled={locked}
                        placeholder="Pick an end date"
                      />
                    )}
                  </div>
                )}

                {recurrencePreview ? (
                  <p className="font-fw-sans text-caption text-text-tertiary">{recurrencePreview}</p>
                ) : null}

                {isSeriesRoot ? (
                  <p className="font-fw-sans text-caption text-text-tertiary">
                    Raising the count or pushing the end date later extends this series with new occurrences.
                  </p>
                ) : null}
                  </div>
                ) : null}
              </DisclosureRow>
            </Surface>

            {/* Cancelling the event is a destructive action at the FOOT of the
                form — the iOS-native place for it — not a third button in a
                bar that used to cost the form 194px of height. Copy and
                behaviour are unchanged: deleteGolfEvent is a SOFT CANCEL for
                one-off events (status -> cancelled, RSVPs kept, attendees
                notified), so it reads "Cancel event"; series deletes go
                through the scope picker where permanent removal is spelled
                out. Hidden on an already-cancelled event — re-cancelling is a
                no-op. */}
            {!isCreating && onDelete && !isCancelled ? (
              <div className="flex justify-center pt-1">
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
              </div>
            ) : null}
          </ModalShell.Body>
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
