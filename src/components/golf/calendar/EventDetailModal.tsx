'use client';

import { useState, useEffect, useRef, useMemo, useId } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { X, Trash2, MapPin, Calendar, Clock, Users, AlertCircle, UserPlus, Dumbbell, Trophy, ClipboardList, Plane, MoreHorizontal, Ban, Repeat } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { parseRecurrenceRule, describeRecurrenceRule, type RecurrenceRule } from '@/lib/golf/recurrence';
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
} from './event-form-helpers';
import { RSVPStatusSection } from './RSVPStatusSection';
import { PlayerRSVPCard } from './PlayerRSVPCard';
import { ConflictWarning } from './ConflictWarning';
import { useRSVP, usePlayerEventRSVP } from '@/hooks/useRSVP';
import { toast } from '@/components/ui/sonner';
import { EventDocumentsSection } from './EventDocumentsSection';
import { Button, IconButton } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';
import type { CalendarCapabilities } from './PremiumCalendarClient';

type GolfEventType = 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type RecurringEditScope = 'this' | 'thisAndFuture' | 'all';
export type { RecurrenceEndMode } from './event-form-helpers';

export interface GolfEventFormData {
  title: string;
  eventType: GolfEventType;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  courseName: string | null;
  description: string | null;
  isMandatory: boolean;
  requiresRsvp: boolean;
  rsvpDeadline: string | null;
  maxAttendees: number | null;
  /**
   * Full current selection. updateGolfEvent treats this as ADDITIVE-ONLY —
   * it never deletes attendance rows. Removals must be sent explicitly via
   * removeAttendeeIds below.
   */
  attendeeIds: string[];
  recurrence: RecurrenceFrequency;
  recurrenceCount: number;
  /** Weekdays (0 = Sun … 6 = Sat) for weekly/biweekly patterns. */
  recurrenceWeekdays?: number[];
  /** How the series ends: after a fixed count (default) or by a date. */
  recurrenceEndMode?: RecurrenceEndMode;
  /** End-by date (YYYY-MM-DD) when recurrenceEndMode === 'until'. */
  recurrenceUntil?: string | null;
  /**
   * Structured recurrence rule built from the fields above (null when the
   * event doesn't repeat). Parents serialize it with serializeRecurrenceRule
   * before calling createRecurringEvent / editRecurringEvent.
   */
  recurrenceRule?: RecurrenceRule | null;
  /**
   * Attendee deltas vs the event's existing golf_event_attendance rows
   * (edit mode only). Computed against the hydrated attendance baseline, so
   * a removal only ever reflects an explicit deselect in the form.
   */
  addAttendeeIds?: string[];
  removeAttendeeIds?: string[];
  /**
   * For edits to events that are part of a recurring series, the scope picker
   * sets this so the parent can route to editRecurringEvent. 'this' means the
   * single occurrence (regular update path).
   */
  editScope?: RecurringEditScope;
}

interface TeamPlayer {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}

interface ConflictData {
  hasConflict: boolean;
  conflicts: Array<{
    userId: string;
    userName: string;
    playerId?: string;
    conflictingEvent: {
      id: string;
      title: string;
      type: 'event' | 'class' | 'blocked';
      start: string;
      end: string;
    };
  }>;
  suggestions: Array<{
    start: Date;
    end: Date;
  }>;
}

async function loadGolfCalendarActions() {
  return import('@/app/golf/actions/golf');
}

// Transform conflicts from API format to ConflictWarning format
function transformConflictsForWarning(conflicts: ConflictData['conflicts']) {
  // Group conflicts by user
  const grouped = new Map<string, {
    userId: string;
    userName: string;
    playerId?: string;
    conflictingEvents: Array<{ title: string; start: string; end: string }>;
  }>();

  for (const c of conflicts) {
    const existing = grouped.get(c.userId);
    if (existing) {
      existing.conflictingEvents.push({
        title: c.conflictingEvent.title,
        start: c.conflictingEvent.start,
        end: c.conflictingEvent.end,
      });
    } else {
      grouped.set(c.userId, {
        userId: c.userId,
        userName: c.userName,
        playerId: c.playerId,
        conflictingEvents: [{
          title: c.conflictingEvent.title,
          start: c.conflictingEvent.start,
          end: c.conflictingEvent.end,
        }],
      });
    }
  }

  return Array.from(grouped.values());
}

interface EventDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: CalendarEvent | null;
  isCreating: boolean;
  isCoach: boolean;
  onSave: (data: GolfEventFormData) => Promise<void>;
  onDelete?: (scope?: RecurringEditScope) => Promise<void>;
  /**
   * Restore a soft-cancelled event (status back to confirmed). When the
   * event is cancelled, editing is disabled and this is the only action
   * offered besides delete.
   */
  onRestore?: () => Promise<void>;
  isSaving: boolean;
  teamPlayers?: TeamPlayer[]; // Available for RSVP invitations
  currentUserId?: string; // Current user's player/coach ID to exclude from attendee list
  timezone?: string; // Team timezone for display purposes
  capabilities?: Required<CalendarCapabilities>;
}

// Premium event type pill configuration
const EVENT_TYPE_PILLS: Array<{
  type: GolfEventType;
  label: string;
  icon: typeof Dumbbell;
  activeBg: string;
  activeText: string;
  activeShadow: string;
  inactiveBg: string;
  inactiveText: string;
  headerGradient: string;
}> = [
  {
    type: 'practice',
    label: 'Practice',
    icon: Dumbbell,
    activeBg: 'bg-warm-800',
    activeText: 'text-white',
    activeShadow: 'shadow-warm-800/30',
    inactiveBg: 'bg-warm-100 hover:bg-warm-200',
    inactiveText: 'text-warm-600',
    headerGradient: 'from-warm-50 to-white',
  },
  {
    type: 'tournament',
    label: 'Tournament',
    icon: Trophy,
    activeBg: 'bg-primary-600',
    activeText: 'text-white',
    activeShadow: 'shadow-primary-600/30',
    inactiveBg: 'bg-primary-50 hover:bg-primary-100',
    inactiveText: 'text-primary-700',
    headerGradient: 'from-primary-50 to-white',
  },
  {
    type: 'qualifier',
    label: 'Qualifier',
    icon: ClipboardList,
    activeBg: 'bg-amber-500',
    activeText: 'text-white',
    activeShadow: 'shadow-amber-500/30',
    inactiveBg: 'bg-amber-50 hover:bg-amber-100',
    inactiveText: 'text-amber-700',
    headerGradient: 'from-amber-50 to-white',
  },
  {
    type: 'meeting',
    label: 'Meeting',
    icon: Users,
    activeBg: 'bg-sky-600',
    activeText: 'text-white',
    activeShadow: 'shadow-sky-600/30',
    inactiveBg: 'bg-sky-50 hover:bg-sky-100',
    inactiveText: 'text-sky-700',
    headerGradient: 'from-sky-50 to-white',
  },
  {
    type: 'travel',
    label: 'Travel',
    icon: Plane,
    activeBg: 'bg-purple-600',
    activeText: 'text-white',
    activeShadow: 'shadow-purple-600/30',
    inactiveBg: 'bg-purple-50 hover:bg-purple-100',
    inactiveText: 'text-purple-700',
    headerGradient: 'from-purple-50 to-white',
  },
  {
    type: 'other',
    label: 'Other',
    icon: MoreHorizontal,
    activeBg: 'bg-warm-700',
    activeText: 'text-white',
    activeShadow: 'shadow-warm-700/30',
    inactiveBg: 'bg-warm-100 hover:bg-warm-200',
    inactiveText: 'text-warm-600',
    headerGradient: 'from-warm-50 to-white',
  },
];

export function EventDetailModal({
  isOpen,
  onClose,
  event,
  isCreating,
  isCoach,
  onSave,
  onDelete,
  onRestore,
  isSaving,
  teamPlayers = [],
  currentUserId,
  timezone,
  capabilities = {
    recurring: true,
    rsvpRead: true,
    availability: true,
    rsvpWrite: true,
  },
}: EventDetailModalProps) {
  const uid = useId();
  // Filter out current user from attendee list - you shouldn't be able to add yourself
  const availablePlayers = teamPlayers.filter(p => p.id !== currentUserId);
  const tzAbbrev = useMemo(() => {
    if (!timezone) return null;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' }).formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value ?? null;
  }, [timezone]);
  const [formData, setFormData] = useState<GolfEventFormData>({
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
  });
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictData | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  // Existing golf_event_attendance baseline for the event being edited.
  // null = not hydrated (loading or failed) — removals are NEVER computed
  // against a null baseline, so a slow/failed fetch can't wipe attendees.
  const [existingAttendeeIds, setExistingAttendeeIds] = useState<string[] | null>(null);
  const [attendeeHydration, setAttendeeHydration] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const rsvpEnabled = Boolean(capabilities.rsvpRead && event?.id && formData.requiresRsvp && !isCreating);
  const {
    status: playerResponse,
    isLoading: playerResponseLoading,
    respond: respondToRSVP,
  } = usePlayerEventRSVP(event?.id, rsvpEnabled && !isCoach);
  const {
    rsvpSummary,
    isLoading: rsvpSummaryLoading,
    error: rsvpSummaryError,
  } = useRSVP({ eventId: event?.id, enabled: rsvpEnabled });
  const rsvpParticipants = useMemo(() => (
    rsvpSummary?.attendees.map(attendee => ({
      id: attendee.playerId,
      user_id: attendee.playerId,
      name: attendee.playerName,
      avatar_url: attendee.avatarUrl,
      response: attendee.status,
    })) || []
  ), [rsvpSummary]);

  // Drawer (vaul) handles: ESC, focus trap, scroll lock, drag-to-dismiss

  // Reset form when modal opens/closes or event changes
  useEffect(() => {
    if (isOpen) {
      if (event && !isCreating) {
        // Edit mode - populate from event
        // Parse datetime strings using Date object to get correct local time
        const startDateTime = event.start_date || '';
        const endDateTime = event.end_date || '';

        let startDate = getTodayDate();
        let startTime: string | null = null;
        if (startDateTime) {
          const startD = new Date(startDateTime);
          if (!isNaN(startD.getTime())) {
            startDate = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-${String(startD.getDate()).padStart(2, '0')}`;
            startTime = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`;
          }
        }

        let endDate: string | null = null;
        let endTime: string | null = null;
        if (endDateTime) {
          const endD = new Date(endDateTime);
          if (!isNaN(endD.getTime())) {
            endDate = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
            endTime = `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`;
          }
        }

        // Convert to the user's LOCAL wall-clock for the datetime-local
        // input (the old toISOString prefill displayed UTC wall-time).
        const rsvpDeadline = toDateTimeLocalValue(event.rsvp_deadline);

        // Use the authoritative all_day boolean from DB, not a parsing heuristic
        const isAllDay = event.all_day ?? false;

        setFormData({
          title: event.title || '',
          eventType: (event.event_type as GolfEventType) || 'practice',
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
        // Create mode - reset to defaults
        setFormData({
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
        });
      }
      setError(null);
      setShowDeleteConfirm(false);
      setConflicts(null);
    }
  }, [isOpen, event, isCreating]);

  // Hydrate the attendee selection from the event's EXISTING attendance rows
  // (audit #4 — the edit form used to seed attendeeIds:[] and the save path
  // then deleted every invitee that wasn't re-selected). Toggles stay
  // disabled until this resolves so the selection always reflects reality.
  useEffect(() => {
    if (!capabilities.rsvpRead || !isOpen || !event?.id || isCreating || !isCoach) {
      setExistingAttendeeIds(null);
      setAttendeeHydration('idle');
      return;
    }
    let cancelled = false;
    setAttendeeHydration('loading');
    setExistingAttendeeIds(null);
    (async () => {
      try {
        const { getEventRSVP } = await loadGolfCalendarActions();
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
    // Keyed on `event` IDENTITY (not event.id) deliberately: the form-reset
    // effect above also keys on identity, so a parent re-render that hands us
    // a fresh event object re-runs BOTH effects together. Keying this one on
    // event.id alone would let the reset wipe the selection while the loaded
    // baseline survives — turning every invitee into a phantom "removal".
  }, [capabilities.rsvpRead, isOpen, event, isCreating, isCoach]);

  // Series-root edits: prefill the recurrence pattern from the stored rule so
  // the series can be extended (more occurrences / later end date) or
  // re-shaped (e.g. add Wednesdays to a M/F practice).
  const isSeriesRoot = capabilities.recurring && !isCreating && Boolean(event?.recurrence_rule) && !event?.parent_event_id;
  useEffect(() => {
    if (!isOpen || !isSeriesRoot || !event?.recurrence_rule) return;
    const rule = parseRecurrenceRule(event.recurrence_rule);
    if (rule) {
      setFormData((prev) => ({ ...prev, ...recurrenceFieldsFromRule(rule), recurrenceRule: rule }));
    }
    // `event` identity dep keeps this in lockstep with the form-reset effect
    // (see the attendee-hydration effect above for the rationale).
  }, [isOpen, isSeriesRoot, event]);

  // Pending attendee delta vs the hydrated baseline. Null until hydration
  // succeeds — removals are only ever computed from a loaded baseline.
  const attendeeChanges = useMemo(() => {
    if (isCreating) return null;
    if (existingAttendeeIds === null) return null;
    return computeAttendeeChanges(existingAttendeeIds, formData.attendeeIds);
  }, [isCreating, existingAttendeeIds, formData.attendeeIds]);
  const attendeeChangeSummary = attendeeChanges ? summarizeAttendeeChanges(attendeeChanges) : null;

  // In edit mode only check conflicts for NEWLY added players — existing
  // invitees already have this event in their schedule, so checking them
  // would flag the event against itself.
  const conflictCheckIds = useMemo(() => {
    if (isCreating) return formData.attendeeIds;
    if (attendeeChanges) return attendeeChanges.addAttendeeIds;
    return formData.attendeeIds;
  }, [isCreating, formData.attendeeIds, attendeeChanges]);

  // Live human-readable summary of the pattern being built, e.g.
  // "Every 2 weeks on Mon, Wed, Fri until Aug 15, 2026".
  const recurrencePreview = useMemo(() => {
    if (formData.recurrence === 'none') return null;
    const rule = buildRecurrenceRule(formData, formData.startDate);
    return rule ? describeRecurrenceRule(rule) : null;
  }, [formData]);

  // Check for conflicts when attendees or event time changes
  useEffect(() => {
    async function checkConflicts() {
      // Check conflicts when attendees are selected (regardless of RSVP toggle)
      if (!capabilities.availability || conflictCheckIds.length === 0 || !formData.startDate) {
        setConflicts(null);
        return;
      }

      if (formData.allDay) {
        // Skip conflict checking for all-day events
        setConflicts(null);
        return;
      }

      if (!formData.startTime || !formData.endTime) {
        setConflicts(null);
        return;
      }

      setCheckingConflicts(true);

      try {
        const { checkScheduleConflicts } = await loadGolfCalendarActions();
        const result = await checkScheduleConflicts(
          formData.startDate,
          formData.startTime,
          formData.endDate || formData.startDate,
          formData.endTime,
          conflictCheckIds
        );

        if (result.success && result.data) {
          setConflicts(result.data as ConflictData);
        }
      } catch {
        // Conflict check failed - continue without warning
      } finally {
        setCheckingConflicts(false);
      }
    }

    const debounce = setTimeout(checkConflicts, 500);
    return () => clearTimeout(debounce);
  }, [capabilities.availability, conflictCheckIds, formData.startDate, formData.startTime, formData.endTime, formData.endDate, formData.allDay]);

  // Series detection: an event is part of a recurring series if it has a
  // recurrence_rule (root) or a parent_event_id (child). Edit + delete then
  // surface a scope picker so the change can apply to one occurrence,
  // future occurrences, or the full series.
  const isInSeries = capabilities.recurring && !isCreating && Boolean(
    event && (event.parent_event_id || event.recurrence_rule),
  );
  const [pendingScopeAction, setPendingScopeAction] = useState<null | 'edit' | 'delete'>(null);

  /**
   * Assemble the outgoing payload:
   * - recurrenceRule: structured rule built from the form's pattern fields
   *   (create, or series-root edit where the pattern can be extended).
   * - addAttendeeIds / removeAttendeeIds: explicit delta vs the hydrated
   *   attendance baseline. If hydration failed, everything selected is sent
   *   as an add and NO removals are sent (additive-only fail-safe).
   */
  const buildSubmitData = (): GolfEventFormData => {
    const rule = capabilities.recurring && (isCreating || isSeriesRoot)
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

  const handleDelete = async () => {
    if (!onDelete) return;
    setError(null);
    if (isInSeries) {
      setPendingScopeAction('delete');
      return;
    }
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event');
    }
  };

  const handleToggleAttendee = (playerId: string) => {
    setFormData(prev => ({
      ...prev,
      attendeeIds: prev.attendeeIds.includes(playerId)
        ? prev.attendeeIds.filter(id => id !== playerId)
        : [...prev.attendeeIds, playerId],
    }));
  };

  const handleSendRosterReminder = async (playerIds: string[]) => {
    if (!event?.id || playerIds.length === 0) return;
    try {
      const { sendEventReminderToPlayers } = await loadGolfCalendarActions();
      const result = await sendEventReminderToPlayers(event.id, playerIds);
      if (result.success) {
        const sent = result.data?.sent ?? playerIds.length;
        toast.success('Reminders sent', `Notified ${sent} player${sent === 1 ? '' : 's'}.`);
      } else {
        toast.error('Failed to send reminders', result.error ?? 'Try again in a moment.');
      }
    } catch (err) {
      toast.error(
        'Failed to send reminders',
        err instanceof Error ? err.message : 'Try again in a moment.',
      );
    }
  };

  const handleExportRoster = () => {
    if (!event || !rsvpSummary) return;
    const header = ['Name', 'Status'];
    const rows = rsvpSummary.attendees.map((a) => [
      a.playerName.replace(/"/g, '""'),
      a.status,
    ]);
    const csv = [header, ...rows]
      .map((cells) => cells.map((c) => `"${c}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = event.title?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'event';
    a.href = url;
    a.download = `rsvp-${safeTitle}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSelectSuggestedTime = (suggestion: { start: Date; end: Date }) => {
    const startDate = suggestion.start.toISOString().split('T')[0];
    const startTime = suggestion.start.toTimeString().slice(0, 5);
    const endTime = suggestion.end.toTimeString().slice(0, 5);

    setFormData(prev => ({
      ...prev,
      startDate: startDate || prev.startDate,
      startTime,
      endTime,
      allDay: false,
    }));

    // Clear conflicts after selecting suggested time
    setConflicts(null);
  };

  // Both coaches and players can create events
  // For editing, coaches can edit any event, players can only view.
  // Soft-cancelled events are read-only for everyone — the only offered
  // actions are Restore (status back) and Delete.
  const isCancelled = !isCreating && event?.status === 'cancelled';
  const canEdit = isCreating || isCoach;
  const isViewMode = (!isCreating && !isCoach) || isCancelled;
  const attendeesLoading = attendeeHydration === 'loading';
  const activeTypePill = EVENT_TYPE_PILLS.find(p => p.type === formData.eventType) ?? EVENT_TYPE_PILLS[EVENT_TYPE_PILLS.length - 1]!;

  const modalTitle = isCreating
    ? 'New Event'
    : isCancelled
      ? 'Cancelled Event'
      : isViewMode
        ? 'Event Details'
        : 'Edit Event';

  const toggleRecurrenceWeekday = (day: number) => {
    setFormData(prev => {
      const current = prev.recurrenceWeekdays ?? [];
      return {
        ...prev,
        recurrenceWeekdays: current.includes(day)
          ? current.filter(d => d !== day)
          : [...current, day].sort((a, b) => a - b),
      };
    });
  };

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        className="sm:max-w-lg sm:mx-auto sm:rounded-3xl p-0 overflow-hidden"
        aria-labelledby="event-modal-title"
      >
        {/* Colored Header Band - tinted by event type */}
        <div className={cn('bg-gradient-to-r', activeTypePill.headerGradient, 'px-6 pt-3 pb-4')}>
          <div className="flex items-center justify-between mb-4">
            <DrawerTitle
              id="event-modal-title"
              className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]"
            >
              {modalTitle}
            </DrawerTitle>
            <IconButton variant="default"
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close modal"
              className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg flex items-center justify-center text-warm-400 hover:text-warm-600 hover:bg-cream-100/68 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </IconButton>
          </div>

          {/* Event Type Selector - Colorful pills */}
          {canEdit && !isCancelled ? (
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPE_PILLS.map((pill) => {
                const Icon = pill.icon;
                const isActive = formData.eventType === pill.type;
                return (
                  <Button variant="ghost"
                    key={pill.type}
                    type="button"
                    onClick={() => setFormData({ ...formData, eventType: pill.type })}
                    disabled={isSaving}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                      isActive
                        ? cn(pill.activeBg, pill.activeText, 'shadow-md', pill.activeShadow)
                        : cn(pill.inactiveBg, pill.inactiveText),
                      'disabled:opacity-50'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {pill.label}
                  </Button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {(() => {
                const Icon = activeTypePill.icon;
                return (
                  <span className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium', activeTypePill.activeBg, activeTypePill.activeText)}>
                    <Icon className="w-3.5 h-3.5" />
                    {activeTypePill.label}
                  </span>
                );
              })()}
            </div>
          )}
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 flex-1 overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          {/* Cancelled banner — soft-cancel lifecycle. Editing is disabled;
              the only actions offered are Restore (when wired) and Delete. */}
          {isCancelled && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 bg-warm-100 border border-warm-200 px-4 py-3 rounded-xl"
            >
              <span className="flex items-center gap-2 text-sm text-warm-700">
                <Ban className="w-4 h-4 flex-shrink-0 text-warm-500" aria-hidden="true" />
                This event is cancelled. Editing is disabled.
              </span>
              {isCoach && onRestore && (
                <Button variant="ghost"
                  type="button"
                  onClick={handleRestore}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-sm font-medium text-primary-700 hover:text-primary-800 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  Restore event
                </Button>
              )}
            </div>
          )}

          {/* Title - Hero input */}
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            disabled={isViewMode || isSaving}
            placeholder="Event name..."
            aria-label="Event title"
            autoCapitalize="sentences"
            autoCorrect="on"
            enterKeyHint="next"
            className="w-full px-0 py-2 text-h3 font-medium text-warm-900 tracking-[-0.015em] placeholder:text-warm-300 border-none focus:ring-0 focus:outline-none bg-transparent disabled:text-warm-500"
            required
          />

          {/* Date & Time Section - Compact card */}
          <div className="bg-warm-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm">
                <Calendar className="w-4.5 h-4.5 text-warm-500" />
              </div>
              <div className="flex-1 grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  disabled={isViewMode || isSaving}
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-warm-900 bg-white transition-colors disabled:bg-white disabled:text-warm-500"
                  required
                />
                <input
                  type="date"
                  value={formData.endDate || ''}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value || null })}
                  disabled={isViewMode || isSaving}
                  placeholder="End date"
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-warm-900 bg-white transition-colors disabled:bg-white disabled:text-warm-500"
                />
              </div>
            </div>

            {!formData.allDay && (
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <Clock className="w-4.5 h-4.5 text-warm-500" />
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <input
                    type="time"
                    value={formData.startTime || ''}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value || null })}
                    disabled={isViewMode || isSaving}
                    className="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-warm-900 bg-white transition-colors disabled:bg-white disabled:text-warm-500"
                  />
                  <input
                    type="time"
                    value={formData.endTime || ''}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value || null })}
                    disabled={isViewMode || isSaving}
                    className="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-warm-900 bg-white transition-colors disabled:bg-white disabled:text-warm-500"
                  />
                </div>
              </div>
            )}

            {/* Timezone indicator */}
            {tzAbbrev && !formData.allDay && (
              <p className="text-label text-warm-400 pl-[52px]">Times shown in {tzAbbrev}</p>
            )}

            {/* All Day Toggle - inline */}
            <label className="flex items-center gap-3 pl-[52px] cursor-pointer group">
              <div className={cn(
                'relative w-10 h-6 rounded-full transition-colors duration-200',
                formData.allDay ? 'bg-primary-500' : 'bg-warm-300'
              )}>
                <input
                  type="checkbox"
                  checked={formData.allDay}
                  onChange={(e) => setFormData({ ...formData, allDay: e.target.checked })}
                  disabled={isViewMode || isSaving}
                  className="sr-only"
                />
                <div className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                  formData.allDay && 'translate-x-4'
                )} />
              </div>
              <span className="text-sm text-warm-600">All day</span>
            </label>
          </div>

          {/* Location - Icon-prefixed input */}
          <div className="flex items-center gap-3 bg-warm-50 rounded-2xl px-4 py-3">
            <MapPin className="w-5 h-5 text-warm-400 flex-shrink-0" />
            <input
              type="text"
              value={formData.location || ''}
              onChange={(e) => setFormData({ ...formData, location: e.target.value || null })}
              disabled={isViewMode || isSaving}
              placeholder="Add location..."
              aria-label="Location"
              autoCapitalize="words"
              autoCorrect="on"
              enterKeyHint="next"
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-warm-900 placeholder:text-warm-400 disabled:text-warm-500"
            />
          </div>

          {/* Description - Expandable, cleaner */}
          <div className="bg-warm-50 rounded-2xl px-4 py-3">
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
              disabled={isViewMode || isSaving}
              rows={2}
              placeholder="Add notes or description..."
              aria-label="Description"
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="enter"
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-warm-900 placeholder:text-warm-400 resize-none disabled:text-warm-500"
            />
          </div>

          {/* Document attachments — surfaces practice plans / scouting reports
              to attendees. Only renders for saved events; for new events the
              picker would have nothing to attach to. */}
          {!isCreating && event && (
            <EventDocumentsSection
              eventId={event.id}
              teamId={event.team_id}
              isCoach={isCoach}
            />
          )}

          {/* Attendees Section (coaches) */}
          {canEdit && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-warm-500" />
                  <span className="text-sm font-medium text-warm-900">Attendees</span>
                </div>
                <div className="flex items-center gap-2">
                  {formData.attendeeIds.length > 0 && (
                    <span className="text-xs font-medium px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full">
                      {formData.attendeeIds.length}/{availablePlayers.length}
                    </span>
                  )}
                  {availablePlayers.length > 0 && (
                    <Button variant="ghost"
                      type="button"
                      onClick={() => {
                        if (formData.attendeeIds.length === availablePlayers.length) {
                          setFormData(prev => ({ ...prev, attendeeIds: [] }));
                        } else {
                          setFormData(prev => ({ ...prev, attendeeIds: availablePlayers.map(p => p.id) }));
                        }
                      }}
                      disabled={isViewMode || isSaving || attendeesLoading}
                      className="text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-40 transition-colors"
                    >
                      {formData.attendeeIds.length === availablePlayers.length ? 'Clear' : 'Add All'}
                    </Button>
                  )}
                </div>
              </div>

              {attendeesLoading && (
                <p className="text-xs text-warm-500" role="status">
                  Loading current invitees...
                </p>
              )}

              {attendeeHydration === 'error' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="status">
                  Couldn&apos;t load the current invitees. You can still add players — existing invites won&apos;t be changed.
                </p>
              )}

              {availablePlayers.length === 0 ? (
                <p className="text-sm text-warm-500 py-2">
                  No team members available.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availablePlayers.map(player => {
                    const isSelected = formData.attendeeIds.includes(player.id);
                    return (
                      <Button variant="primary"
                        key={player.id}
                        type="button"
                        onClick={() => handleToggleAttendee(player.id)}
                        disabled={isViewMode || isSaving || attendeesLoading}
                        className={cn(
                          'group flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                          isSelected
                            ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20 scale-[1.02]'
                            : 'bg-warm-100 text-warm-700 hover:bg-warm-200',
                          'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        {player.avatar_url ? (
                          <Image src={player.avatar_url} alt="" width={20} height={20} className="w-5 h-5 rounded-full object-cover" unoptimized />
                        ) : (
                          <div className={cn(
                            'w-5 h-5 rounded-full flex items-center justify-center text-eyebrow font-medium',
                            isSelected ? 'bg-white/20 text-white' : 'bg-warm-300 text-warm-500'
                          )}>
                            {player.first_name[0]}{player.last_name[0]}
                          </div>
                        )}
                        <span>{player.first_name} {player.last_name[0]}.</span>
                      </Button>
                    );
                  })}
                </div>
              )}

              {/* Pending attendee changes — the save summary. Removals only
                  ever come from explicit deselects against the hydrated
                  baseline, and they're called out before saving. */}
              {!isViewMode && attendeeChangeSummary && (
                <p
                  role="status"
                  className={cn(
                    'text-xs rounded-lg px-3 py-2 border',
                    (attendeeChanges?.removeAttendeeIds.length ?? 0) > 0
                      ? 'text-amber-800 bg-amber-50 border-amber-200'
                      : 'text-primary-700 bg-primary-50 border-primary-100',
                  )}
                >
                  Saving will update invites: {attendeeChangeSummary}.
                </p>
              )}

              {/* Conflict Warning */}
              {checkingConflicts && (
                <div className="p-3 bg-warm-100 rounded-xl text-sm text-warm-600 flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-warm-400 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-warm-400 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-warm-400 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                  </span>
                  Checking conflicts...
                </div>
              )}

              {conflicts && conflicts.hasConflict && (
                <ConflictWarning
                  conflicts={transformConflictsForWarning(conflicts.conflicts)}
                  suggestions={conflicts.suggestions}
                  onSelectTime={handleSelectSuggestedTime}
                />
              )}
            </div>
          )}

          {/* Recurrence pattern — on create, and on series-root edit (the
              series-extend affordance: bump the count or push the end date
              to add occurrences, or re-shape the weekday pattern). Child
              occurrences don't carry the pattern; their edits go through
              the scope picker instead. */}
          {canEdit && capabilities.recurring && !isCancelled && (isCreating || isSeriesRoot) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="event-recurrence"
                  className="text-sm font-medium text-warm-700 flex items-center gap-2"
                >
                  <Repeat className="w-4 h-4 text-warm-500" aria-hidden="true" />
                  {isSeriesRoot ? 'Series pattern' : 'Repeats'}
                </label>
                <select
                  id="event-recurrence"
                  value={formData.recurrence}
                  onChange={(e) => setFormData({
                    ...formData,
                    recurrence: e.target.value as RecurrenceFrequency,
                  })}
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-warm-900 bg-white transition-colors"
                >
                  {/* A series root can't be flipped back to a one-off here —
                      that's a delete-with-scope, not a pattern change. */}
                  {!isSeriesRoot && <option value="none">Doesn&apos;t repeat</option>}
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {(formData.recurrence === 'weekly' || formData.recurrence === 'biweekly') && (
                <div className="space-y-1.5">
                  <div className="flex gap-1.5" role="group" aria-label="Repeat on days">
                    {WEEKDAY_OPTIONS.map((day) => {
                      const selected = (formData.recurrenceWeekdays ?? []).includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleRecurrenceWeekday(day.value)}
                          disabled={isSaving}
                          aria-pressed={selected}
                          aria-label={day.long}
                          className={cn(
                            'w-8 h-8 rounded-full text-xs font-medium transition-colors',
                            selected
                              ? 'bg-primary-600 text-white shadow-sm'
                              : 'bg-warm-100 text-warm-600 hover:bg-warm-200',
                            'disabled:opacity-50',
                          )}
                        >
                          {day.short}
                        </button>
                      );
                    })}
                  </div>
                  {(formData.recurrenceWeekdays ?? []).length === 0 && (
                    <p className="text-label text-warm-400">
                      No days picked — repeats on the start date&apos;s weekday.
                    </p>
                  )}
                </div>
              )}

              {formData.recurrence !== 'none' && (
                <div className="flex items-center justify-between gap-3 pl-1 text-sm text-warm-600">
                  <div className="flex items-center gap-2">
                    <label htmlFor="event-recurrence-end" className="sr-only">Series ends</label>
                    <select
                      id="event-recurrence-end"
                      value={formData.recurrenceEndMode ?? 'count'}
                      onChange={(e) => setFormData({
                        ...formData,
                        recurrenceEndMode: e.target.value as RecurrenceEndMode,
                      })}
                      disabled={isSaving}
                      className="px-2 py-1 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-warm-900 bg-white transition-colors"
                    >
                      <option value="count">Ends after</option>
                      <option value="until">Ends on date</option>
                    </select>
                  </div>
                  {(formData.recurrenceEndMode ?? 'count') === 'count' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={MIN_RECURRENCE_COUNT}
                        max={MAX_RECURRENCE_COUNT}
                        value={formData.recurrenceCount}
                        onChange={(e) => setFormData({
                          ...formData,
                          recurrenceCount: Math.max(
                            MIN_RECURRENCE_COUNT,
                            Math.min(MAX_RECURRENCE_COUNT, Number(e.target.value) || 10),
                          ),
                        })}
                        disabled={isSaving}
                        aria-label="Number of occurrences"
                        className="w-20 px-2 py-1 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-warm-900 bg-white tabular-nums text-right"
                      />
                      <span className="text-warm-500">events</span>
                    </div>
                  ) : (
                    <input
                      type="date"
                      min={formData.startDate}
                      value={formData.recurrenceUntil || ''}
                      onChange={(e) => setFormData({ ...formData, recurrenceUntil: e.target.value || null })}
                      disabled={isSaving}
                      aria-label="Series end date"
                      className="px-2 py-1 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-warm-900 bg-white transition-colors"
                    />
                  )}
                </div>
              )}

              {recurrencePreview && (
                <p className="text-label text-warm-500 pl-1">{recurrencePreview}</p>
              )}

              {isSeriesRoot && (
                <p className="text-label text-warm-400 pl-1">
                  Raising the count or pushing the end date later extends this series with new occurrences.
                </p>
              )}
            </div>
          )}

          {/* RSVP Toggle */}
          {canEdit && capabilities.rsvpWrite && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-warm-700">Require RSVP</span>
              <label className="cursor-pointer">
                <span className="sr-only">Require RSVP</span>
                <div className={cn(
                  'relative w-10 h-6 rounded-full transition-colors duration-200',
                  formData.requiresRsvp ? 'bg-primary-500' : 'bg-warm-300'
                )}>
                  <input
                    type="checkbox"
                    checked={formData.requiresRsvp}
                    onChange={(e) => setFormData({ ...formData, requiresRsvp: e.target.checked })}
                    disabled={isViewMode || isSaving}
                    className="sr-only"
                  />
                  <div className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                    formData.requiresRsvp && 'translate-x-4'
                  )} />
                </div>
              </label>
            </div>
          )}

          {/* RSVP Settings (when enabled) */}
          {canEdit && capabilities.rsvpWrite && formData.requiresRsvp && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-rsvp-deadline`} className="block text-xs font-medium text-warm-500 mb-1">RSVP Deadline</label>
                <input
                  id={`${uid}-rsvp-deadline`}
                  type="datetime-local"
                  value={formData.rsvpDeadline || ''}
                  onChange={(e) => setFormData({ ...formData, rsvpDeadline: e.target.value || null })}
                  disabled={isViewMode || isSaving}
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-warm-900 bg-white transition-colors disabled:bg-warm-50"
                />
                <p className="text-label text-warm-400 mt-1">Your local time</p>
              </div>
              <div>
                <label htmlFor={`${uid}-max-attendees`} className="block text-xs font-medium text-warm-500 mb-1">Max Attendees</label>
                <input
                  id={`${uid}-max-attendees`}
                  type="number"
                  min="1"
                  value={formData.maxAttendees || ''}
                  onChange={(e) => setFormData({ ...formData, maxAttendees: e.target.value ? parseInt(e.target.value) : null })}
                  disabled={isViewMode || isSaving}
                  placeholder="No limit"
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-warm-900 placeholder:text-warm-400 bg-white transition-colors disabled:bg-warm-50"
                />
              </div>
            </div>
          )}

          {/* Player RSVP Card */}
          {!isCreating && event && capabilities.rsvpRead && capabilities.rsvpWrite && formData.requiresRsvp && !isCoach && (
            <div className="border-t border-warm-200 -mx-6 px-6 pt-4">
              <PlayerRSVPCard
                event={{
                  id: event.id,
                  title: event.title,
                  event_type: event.event_type,
                  status: event.status || 'confirmed',
                  start_date: event.start_date || '',
                  start_time: event.start_time || null,
                  end_date: event.end_date,
                  end_time: event.end_time,
                  location: event.location,
                  description: event.description,
                  rsvp_deadline: event.rsvp_deadline || null,
                }}
                currentResponse={playerResponse === 'pending' ? null : playerResponse}
                onRespond={async (response) => {
                  const result = await respondToRSVP(response);
                  if (!result.success) {
                    throw new Error(result.error || 'Failed to update RSVP');
                  }
                }}
              />
              {playerResponseLoading && (
                <p className="text-xs text-warm-500 mt-2">Loading your RSVP status...</p>
              )}
            </div>
          )}

          {/* RSVP Status Section */}
          {!isCreating && event?.id && capabilities.rsvpRead && formData.requiresRsvp && (
            <div className="border-t border-warm-200 -mx-6 px-6 pt-4">
              <h4 className="text-sm font-medium text-warm-900 mb-3">RSVP Status</h4>
              {rsvpSummaryError && (
                <p className="text-sm text-rose-600 mb-3">{rsvpSummaryError}</p>
              )}
              <RSVPStatusSection
                participants={rsvpParticipants}
                totalInvited={rsvpSummary?.total || 0}
                onSendReminder={handleSendRosterReminder}
                onExport={handleExportRoster}
              />
              {rsvpSummaryLoading && (
                <p className="text-xs text-warm-500 mt-2">Loading RSVP summary...</p>
              )}
            </div>
          )}

          {/* Footer - inside form for proper submit semantics */}
          <div className="border-t border-warm-100 flex items-center justify-between bg-warm-50/50 -mx-6 px-6 py-4 mt-4">
            {/* Delete / cancel button (left side). deleteGolfEvent is a SOFT
                CANCEL for one-off events (status → cancelled, RSVPs kept,
                attendees notified) so the copy says "Cancel event"; series
                deletes go through the scope dialog where the permanent
                series-wide removal is spelled out. Hidden on an already-
                cancelled event — re-cancelling is a no-op. */}
            <div>
              {onDelete && !isCreating && !isCancelled && (
                <>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <Button variant="danger"
                        type="button"
                        onClick={handleDelete}
                        disabled={isSaving}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isInSeries ? 'Confirm Delete' : 'Confirm cancellation'}
                      </Button>
                      <Button variant="ghost"
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isSaving}
                        className="px-3 py-1.5 text-sm font-medium text-warm-600 hover:text-warm-900 transition-colors"
                      >
                        Keep event
                      </Button>
                    </div>
                  ) : (
                    <Button variant="danger"
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      {isInSeries ? 'Delete' : 'Cancel event'}
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Save/Cancel Buttons (right side) */}
            <div className="flex items-center gap-3">
              <Button variant="ghost"
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-warm-600 hover:text-warm-900 rounded-lg transition-colors"
              >
                {isViewMode ? 'Close' : 'Cancel'}
              </Button>
              {!isViewMode && (
                <Button variant="primary"
                  type="submit"
                  disabled={isSaving}
                  className={cn(
                    'px-5 py-2 rounded-xl text-sm font-medium text-white transition-all',
                    'bg-primary-600 hover:bg-primary-700 shadow-md shadow-primary-600/20',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isSaving && 'animate-pulse'
                  )}
                >
                  {isSaving ? 'Saving...' : isCreating ? 'Create Event' : 'Save Changes'}
                </Button>
              )}
            </div>
          </div>
        </form>

        {pendingScopeAction && (
          <SeriesScopeDialog
            action={pendingScopeAction}
            onCancel={() => setPendingScopeAction(null)}
            onConfirm={submitWithScope}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

interface SeriesScopeDialogProps {
  action: 'edit' | 'delete';
  onCancel: () => void;
  onConfirm: (scope: RecurringEditScope) => void;
}

function SeriesScopeDialog({ action, onCancel, onConfirm }: SeriesScopeDialogProps) {
  const { modalRef } = useFocusTrap(true, onCancel);
  const verb = action === 'edit' ? 'Update' : 'Delete';
  const danger = action === 'delete';
  const options: Array<{ value: RecurringEditScope; label: string; sub: string }> = [
    {
      value: 'this',
      label: 'This event only',
      sub: action === 'edit'
        ? 'Other occurrences keep their current details.'
        : 'This occurrence is cancelled and attendees are notified. The rest of the series stays.',
    },
    {
      value: 'thisAndFuture',
      label: 'This and following events',
      sub: action === 'edit'
        ? 'Past occurrences are left alone.'
        : 'Permanently removes this and every later occurrence. Past ones are left alone.',
    },
    {
      value: 'all',
      label: 'All events in the series',
      sub: action === 'edit'
        ? 'Every occurrence picks up the change.'
        : 'Permanently removes the whole series, including past occurrences.',
    },
  ];

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="series-scope-title"
      className="fixed inset-0 z-modal flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions,jsx-a11y/click-events-have-key-events */}
      <div
        ref={modalRef}
        className="w-full max-w-md surface-stone rounded-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-warm-200/60 bg-gradient-to-br from-white/70 via-warm-50/40 to-primary-50/15">
          <h3
            id="series-scope-title"
            className="text-h3 font-medium text-warm-900 tracking-[-0.015em]"
          >
            {verb} recurring event
          </h3>
          <p className="text-sm text-warm-500 mt-0.5">
            This event is part of a series. Choose how the change should apply.
          </p>
        </div>
        <ul className="p-2">
          {options.map((opt) => (
            <li key={opt.value}>
              <Button variant="ghost"
                type="button"
                onClick={() => onConfirm(opt.value)}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={opt.value === 'this'}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-xl transition-colors',
                  'hover:bg-warm-50 active:bg-warm-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                )}
              >
                <p className="text-sm font-medium text-warm-900">{opt.label}</p>
                <p className="text-xs text-warm-500 mt-0.5">{opt.sub}</p>
              </Button>
            </li>
          ))}
        </ul>
        <div className="px-4 py-3 border-t border-warm-200/60 flex items-center justify-end gap-2">
          <Button variant="ghost"
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium text-warm-600 hover:text-warm-900 transition-colors"
          >
            Cancel
          </Button>
        </div>
        {danger && (
          <p className="px-5 pb-4 text-eyebrow text-rose-600/80">
            Removing future or all occurrences is permanent — it can&apos;t be undone.
          </p>
        )}
      </div>
    </div>
  );
}
