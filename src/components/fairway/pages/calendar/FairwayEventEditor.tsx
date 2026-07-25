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
  ChevronDown,
  Repeat,
  AlertTriangle,
  Trash2,
  Check,
  Ban,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button } from '@/components/fairway/controls/button';
import { Button as UiButton } from '@/components/ui/button';
import { Input as UiInput, Textarea as UiTextarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/fairway/forms/Switch';
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
// Native <select> styled to match Fairway inputs (P241): strip the OS chevron
// (appearance-none, incl. legacy IE/FF) and reserve right padding for a custom
// lucide ChevronDown overlay so it reads as tokenized as the rest of the form.
const selectFieldCls =
  'w-full appearance-none rounded-fw-md border border-border-subtle bg-surface-sunken py-2 pl-3 pr-9 font-fw-sans text-body-sm text-text-primary outline-none transition-colors focus:border-accent-500 focus:bg-surface focus:ring-2 focus:ring-accent-500/25 disabled:opacity-50 [&::-ms-expand]:hidden';

function getTodayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const [error, setError] = React.useState<string | null>(null);
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
      setFormData({
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
      });
    } else {
      setFormData({ ...DEFAULT_FORM, startDate: getTodayDate() });
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
      setFormData((prev) => ({ ...prev, ...recurrenceFieldsFromRule(rule), recurrenceRule: rule }));
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
        );
        if (!cancelled && result.success && result.data) setConflicts(result.data as ConflictData);
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
    const startDate = s.start.toISOString().split('T')[0];
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

  return (
    <>
    <ModalShell
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      size="xl"
      title={isCreating ? 'New event' : isCancelled ? 'Cancelled event' : 'Edit event'}
      data-slot="event-editor"
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
              <div className="flex items-center gap-2 rounded-fw-md border border-fw-danger/25 bg-fw-danger-bg px-4 py-3 font-fw-sans text-body-sm text-fw-danger-ink">
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

            {/* Title — with a green editorial spine. The wrapper carries the
                visible focus cue (WCAG 2.4.7) since the input itself is a
                bare editorial field with no border. */}
            <div className="flex items-center gap-3 rounded-fw-md transition-shadow focus-within:ring-2 focus-within:ring-accent-500/70 focus-within:ring-offset-2 focus-within:ring-offset-canvas">
              <span aria-hidden className="h-7 w-1 flex-shrink-0 rounded-full bg-accent-500" />
              <UiInput
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={locked}
                placeholder="Event name…"
                aria-label="Event title"
                className="w-full flex-1 border-none bg-transparent px-0 py-1 font-fw-display text-h3 font-semibold tracking-[-0.01em] text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-0 focus-visible:ring-offset-0"
                required
              />
            </div>

            {/* Event type */}
            <div className="flex flex-wrap gap-2">
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
                      'focus-visible:ring-accent-500/40',
                      active
                        ? 'bg-accent-700 text-text-on-accent shadow-flat'
                        : 'border border-border-subtle bg-surface-sunken text-text-secondary hover:bg-surface-tint',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </UiButton>
                );
              })}
            </div>

            {/* Date & time well — the icon lives INSIDE the first column's
                label (same convention as Location/Notes below) instead of as
                a row-level flex sibling. A sibling icon pushed the grid's
                left edge over by icon+gap, so Start/End date sat ~28px
                further right than the RSVP/Recurrence two-column rows in the
                same well and had a narrower column than its own End-date
                partner — this keeps every two-column row in the modal on one
                consistent grid. */}
            <div className="flex flex-col gap-3 rounded-fw-md border border-accent-100 bg-accent-50/60 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="ev-start-date" className={labelCls}>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5 text-accent-700" /> Start date
                    </span>
                  </label>
                  <UiInput
                    id="ev-start-date"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    disabled={locked}
                    className={cn(fieldCls, 'bg-surface')}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="ev-end-date" className={labelCls}>End date</label>
                  <UiInput
                    id="ev-end-date"
                    type="date"
                    value={formData.endDate || ''}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value || null })}
                    disabled={locked}
                    className={cn(fieldCls, 'bg-surface')}
                  />
                </div>
              </div>

              {!formData.allDay && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ev-start-time" className={labelCls}>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-accent-700" /> Start time
                      </span>
                    </label>
                    <UiInput
                      id="ev-start-time"
                      type="time"
                      value={formData.startTime || ''}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value || null })}
                      disabled={locked}
                      className={cn(fieldCls, 'bg-surface')}
                    />
                  </div>
                  <div>
                    <label htmlFor="ev-end-time" className={labelCls}>End time</label>
                    <UiInput
                      id="ev-end-time"
                      type="time"
                      value={formData.endTime || ''}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value || null })}
                      disabled={locked}
                      className={cn(fieldCls, 'bg-surface')}
                    />
                  </div>
                </div>
              )}

              {tzAbbrev && !formData.allDay ? (
                <p className="font-fw-sans text-caption text-text-tertiary">Times shown in {tzAbbrev}</p>
              ) : null}

              <Switch
                label="All day"
                checked={formData.allDay}
                onCheckedChange={(checked) => setFormData({ ...formData, allDay: checked })}
                disabled={locked}
              />
            </div>

            {/* Location */}
            <div>
              <label htmlFor="ev-location" className={labelCls}>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-accent-700" /> Location
                </span>
              </label>
              <UiInput
                id="ev-location"
                type="text"
                value={formData.location || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value || null })}
                disabled={locked}
                placeholder="Course, facility, or address"
                className={fieldCls}
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="ev-desc" className={labelCls}>
                <span className="inline-flex items-center gap-1.5">
                  <AlignLeft className="h-3.5 w-3.5 text-accent-700" /> Notes
                </span>
              </label>
              <UiTextarea
                id="ev-desc"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
                disabled={locked}
                rows={2}
                placeholder="Details for the team…"
                className={cn(fieldCls, 'resize-none')}
              />
            </div>

            {/* RSVP */}
            <div className="flex flex-col gap-3 rounded-fw-md border border-accent-100 bg-accent-50/60 p-4">
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

            {/* Attendees — colored-avatar toggle grid */}
            {availablePlayers.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className={cn(labelCls, 'mb-0')}>
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-accent-700" /> Invite players
                    </span>
                  </span>
                  {formData.attendeeIds.length > 0 ? (
                    <span className="font-fw-mono text-caption font-semibold tabular-nums text-accent-700">
                      {formData.attendeeIds.length} selected
                    </span>
                  ) : null}
                </div>

                {attendeesLoading ? (
                  <p role="status" className="mb-2 font-fw-sans text-caption text-text-tertiary">
                    Loading current invitees...
                  </p>
                ) : null}

                {attendeeHydration === 'error' ? (
                  <p
                    role="status"
                    className="mb-2 rounded-fw-md border border-fw-warning-ring bg-fw-warning-bg px-3 py-2 font-fw-sans text-caption text-fw-warning-ink"
                  >
                    Couldn&apos;t load the current invitees. You can still add players — existing invites won&apos;t be changed.
                  </p>
                ) : null}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {availablePlayers.map((p) => {
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
                          'focus-visible:ring-accent-500/40',
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
                        <span className="min-w-0 flex-1 truncate font-fw-sans text-caption font-medium text-text-primary">
                          {p.first_name} {p.last_name?.[0] ? `${p.last_name[0]}.` : ''}
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
                      'mt-3 rounded-fw-md border px-3 py-2 font-fw-sans text-caption',
                      (attendeeChanges?.removeAttendeeIds.length ?? 0) > 0
                        ? 'border-fw-warning-ring bg-fw-warning-bg text-fw-warning-ink'
                        : 'border-accent-100 bg-accent-50 text-accent-700',
                    )}
                  >
                    Saving will update invites: {attendeeChangeSummary}.
                  </p>
                ) : null}

                {/* Conflict notice */}
                {conflicts?.hasConflict ? (
                  <div className="mt-3 rounded-fw-md border border-fw-warning-ring bg-fw-warning-bg p-3">
                    <p className="flex items-center gap-1.5 font-fw-sans text-caption font-semibold text-fw-warning-ink">
                      <AlertTriangle className="h-3.5 w-3.5 text-fw-warning-ink" />
                      Schedule conflict
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {conflicts.conflicts.slice(0, 4).map((c, i) => (
                        <li key={`${c.userId}-${i}`} className="font-fw-sans text-caption text-fw-warning-ink">
                          {c.userName} — {c.conflictingEvent.title}
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
                            className="rounded-full border border-border-subtle bg-surface px-2.5 py-1 font-fw-mono text-caption tabular-nums text-text-secondary transition-colors hover:bg-surface-tint focus-visible:ring-accent-500/40"
                          >
                            {s.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </UiButton>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {/* Recurrence pattern — on create, and on series-root edit (the
                series-extend affordance: bump the count or push the end date
                to add occurrences, or re-shape the weekday pattern). Child
                occurrences don't carry the pattern; their edits go through
                the scope picker instead. */}
            {!isCancelled && (isCreating || isSeriesRoot) && (
              <div className="flex flex-col gap-3 rounded-fw-md border border-accent-100 bg-accent-50/60 p-4">
                <span className={cn(labelCls, 'mb-0')}>
                  <span className="inline-flex items-center gap-1.5">
                    <Repeat className="h-3.5 w-3.5 text-accent-700" /> {isSeriesRoot ? 'Series pattern' : 'Repeat'}
                  </span>
                </span>
                <div className="relative">
                  {/* A series root can't be flipped back to a one-off here —
                      that's a delete-with-scope, not a pattern change.
                      Native select on purpose: keeps mobile OS pickers and the
                      aria-label/selectOptions contract the tests pin. */}
                  <NativeSelect
                    value={formData.recurrence}
                    onChange={(e) => setFormData({ ...formData, recurrence: e.target.value as RecurrenceFrequency })}
                    disabled={locked}
                    aria-label="Recurrence"
                    className={cn(selectFieldCls, 'bg-surface')}
                  >
                    {RECURRENCE_OPTIONS.filter((o) => !isSeriesRoot || o.value !== 'none').map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
                    aria-hidden
                  />
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
                              'grid h-8 w-8 place-items-center rounded-full font-fw-sans text-caption font-medium transition-colors disabled:opacity-50',
                              'focus-visible:ring-accent-500/40',
                              selected
                                ? 'bg-accent-700 text-text-on-accent shadow-flat'
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
                    <div>
                      <label htmlFor="ev-recurrence-end" className={labelCls}>Series ends</label>
                      <div className="relative">
                        <NativeSelect
                          id="ev-recurrence-end"
                          value={formData.recurrenceEndMode ?? 'count'}
                          onChange={(e) =>
                            setFormData({ ...formData, recurrenceEndMode: e.target.value as RecurrenceEndMode })
                          }
                          disabled={locked}
                          className={cn(selectFieldCls, 'bg-surface')}
                        >
                          <option value="count">After a number of events</option>
                          <option value="until">On a date</option>
                        </NativeSelect>
                        <ChevronDown
                          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
                          aria-hidden
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
                      <div>
                        <label htmlFor="ev-recurrence-until" className={labelCls}>Repeat until</label>
                        <UiInput
                          id="ev-recurrence-until"
                          type="date"
                          min={formData.startDate}
                          value={formData.recurrenceUntil || ''}
                          onChange={(e) => setFormData({ ...formData, recurrenceUntil: e.target.value || null })}
                          disabled={locked}
                          className={cn(fieldCls, 'bg-surface')}
                        />
                      </div>
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
            )}
          </ModalShell.Body>

          <ModalShell.Footer>
            {/* deleteGolfEvent is a SOFT CANCEL for one-off events (status →
                cancelled, RSVPs kept, attendees notified), so the copy says
                "Cancel event"; series deletes go through the scope picker
                where permanent removal is spelled out. Hidden on an already-
                cancelled event — re-cancelling is a no-op. */}
            {!isCreating && onDelete && !isCancelled ? (
              <Button
                variant="ghost"
                type="button"
                onClick={handleDelete}
                disabled={isSaving}
                leftIcon={<Trash2 className="h-4 w-4" />}
                className="sm:mr-auto"
              >
                {isInSeries ? 'Delete' : 'Cancel event'}
              </Button>
            ) : null}
            <Button variant="secondary" type="button" onClick={onClose} disabled={isSaving}>
              {isCancelled ? 'Close' : 'Cancel'}
            </Button>
            {!isCancelled ? (
              <Button variant="primary" type="button" onClick={handleSubmit} busy={isSaving} disabled={isSaving}>
                {isCreating ? 'Create event' : 'Save changes'}
              </Button>
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
    </>
  );
}

export default FairwayEventEditor;
