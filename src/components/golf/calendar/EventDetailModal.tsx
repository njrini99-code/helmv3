'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { X, Trash2, MapPin, Calendar, Clock, Users, AlertCircle, UserPlus, Dumbbell, Trophy, ClipboardList, Plane, MoreHorizontal } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { RSVPStatusSection } from './RSVPStatusSection';
import { PlayerRSVPCard } from './PlayerRSVPCard';
import { ConflictWarning } from './ConflictWarning';
import { useRSVP, usePlayerEventRSVP } from '@/hooks/useRSVP';
import { toast } from '@/components/ui/toast';
import { m, useReducedMotion } from 'framer-motion';
import { calendarSpring } from '@/lib/motion';

type GolfEventType = 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  attendeeIds: string[];
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
  onDelete?: () => Promise<void>;
  isSaving: boolean;
  teamPlayers?: TeamPlayer[]; // Available for RSVP invitations
  currentUserId?: string; // Current user's player/coach ID to exclude from attendee list
  timezone?: string; // Team timezone for display purposes
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
  isSaving,
  teamPlayers = [],
  currentUserId,
  timezone,
}: EventDetailModalProps) {
  const prefersReducedMotion = useReducedMotion();
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
  });
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictData | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const { modalRef } = useFocusTrap(isOpen, onClose);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const rsvpEnabled = Boolean(event?.id && formData.requiresRsvp && !isCreating);
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

  // useFocusTrap handles: Escape key, focus trapping, focus restore, scroll lock

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

        const rsvpDeadline = event.rsvp_deadline
          ? new Date(event.rsvp_deadline).toISOString().slice(0, 16)
          : null;

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
        });
      }
      setError(null);
      setShowDeleteConfirm(false);
      setConflicts(null);
    }
  }, [isOpen, event, isCreating]);

  // Check for conflicts when attendees or event time changes
  useEffect(() => {
    async function checkConflicts() {
      // Check conflicts when attendees are selected (regardless of RSVP toggle)
      if (formData.attendeeIds.length === 0 || !formData.startDate) {
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
          formData.attendeeIds
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
  }, [formData.attendeeIds, formData.startDate, formData.startTime, formData.endTime, formData.endDate, formData.allDay]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim()) {
      setError('Event title is required');
      return;
    }

    try {
      await onSave(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setError(null);
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

  if (!isOpen) return null;

  // Both coaches and players can create events
  // For editing, coaches can edit any event, players can only view
  const canEdit = isCreating || isCoach;
  const isViewMode = !isCreating && !isCoach;
  const activeTypePill = EVENT_TYPE_PILLS.find(p => p.type === formData.eventType) ?? EVENT_TYPE_PILLS[EVENT_TYPE_PILLS.length - 1]!;

  const modalTitle = isCreating ? 'New Event' : isViewMode ? 'Event Details' : 'Edit Event';

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-modal-title"
    >
      {/* Backdrop with fade */}
      <m.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-warm-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel with spring entry */}
      <m.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : calendarSpring.modalEntry}
        className="relative bg-white rounded-[24px] border border-warm-200/60 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden"
      >
        {/* Colored Header Band - tinted by event type */}
        <div className={cn('bg-gradient-to-r', activeTypePill.headerGradient, 'px-6 pt-5 pb-4')}>
          <div className="flex items-center justify-between mb-4">
            <h2 id="event-modal-title" className="text-lg font-semibold text-warm-900">
              {modalTitle}
            </h2>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close modal"
              className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg flex items-center justify-center text-warm-400 hover:text-warm-600 hover:bg-white/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Event Type Selector - Colorful pills */}
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPE_PILLS.map((pill) => {
                const Icon = pill.icon;
                const isActive = formData.eventType === pill.type;
                return (
                  <button
                    key={pill.type}
                    type="button"
                    onClick={() => setFormData({ ...formData, eventType: pill.type })}
                    disabled={isSaving}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200',
                      isActive
                        ? cn(pill.activeBg, pill.activeText, 'shadow-md', pill.activeShadow)
                        : cn(pill.inactiveBg, pill.inactiveText),
                      'disabled:opacity-50'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {pill.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {(() => {
                const Icon = activeTypePill.icon;
                return (
                  <span className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold', activeTypePill.activeBg, activeTypePill.activeText)}>
                    <Icon className="w-3.5 h-3.5" />
                    {activeTypePill.label}
                  </span>
                );
              })()}
            </div>
          )}
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[calc(90vh-200px)] overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {error}
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
            className="w-full px-0 py-2 text-xl font-semibold text-warm-900 placeholder:text-warm-300 border-none focus:ring-0 focus:outline-none bg-transparent disabled:text-warm-500"
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

          {/* Attendees Section (coaches) */}
          {canEdit && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-warm-500" />
                  <span className="text-sm font-semibold text-warm-900">Attendees</span>
                </div>
                <div className="flex items-center gap-2">
                  {formData.attendeeIds.length > 0 && (
                    <span className="text-xs font-medium px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full">
                      {formData.attendeeIds.length}/{availablePlayers.length}
                    </span>
                  )}
                  {availablePlayers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (formData.attendeeIds.length === availablePlayers.length) {
                          setFormData(prev => ({ ...prev, attendeeIds: [] }));
                        } else {
                          setFormData(prev => ({ ...prev, attendeeIds: availablePlayers.map(p => p.id) }));
                        }
                      }}
                      disabled={isViewMode || isSaving}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-40 transition-colors"
                    >
                      {formData.attendeeIds.length === availablePlayers.length ? 'Clear' : 'Add All'}
                    </button>
                  )}
                </div>
              </div>

              {availablePlayers.length === 0 ? (
                <p className="text-sm text-warm-500 py-2">
                  No team members available.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availablePlayers.map(player => {
                    const isSelected = formData.attendeeIds.includes(player.id);
                    return (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => handleToggleAttendee(player.id)}
                        disabled={isViewMode || isSaving}
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
                            'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                            isSelected ? 'bg-white/20 text-white' : 'bg-warm-300 text-warm-500'
                          )}>
                            {player.first_name[0]}{player.last_name[0]}
                          </div>
                        )}
                        <span>{player.first_name} {player.last_name[0]}.</span>
                      </button>
                    );
                  })}
                </div>
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

          {/* RSVP Toggle */}
          {canEdit && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-warm-700">Require RSVP</span>
              <label className="cursor-pointer">
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
          {canEdit && formData.requiresRsvp && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-warm-500 mb-1">RSVP Deadline</label>
                <input
                  type="datetime-local"
                  value={formData.rsvpDeadline || ''}
                  onChange={(e) => setFormData({ ...formData, rsvpDeadline: e.target.value || null })}
                  disabled={isViewMode || isSaving}
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-warm-900 bg-white transition-colors disabled:bg-warm-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-warm-500 mb-1">Max Attendees</label>
                <input
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
          {!isCreating && event && formData.requiresRsvp && !isCoach && (
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
          {!isCreating && event?.id && formData.requiresRsvp && (
            <div className="border-t border-warm-200 -mx-6 px-6 pt-4">
              <h4 className="text-sm font-semibold text-warm-900 mb-3">RSVP Status</h4>
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
            {/* Delete Button (left side) */}
            <div>
              {onDelete && !isCreating && (
                <>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isSaving}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isSaving}
                        className="px-3 py-1.5 text-sm font-medium text-warm-600 hover:text-warm-900 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Save/Cancel Buttons (right side) */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-warm-600 hover:text-warm-900 rounded-lg transition-colors"
              >
                {isViewMode ? 'Close' : 'Cancel'}
              </button>
              {!isViewMode && (
                <button
                  type="submit"
                  disabled={isSaving}
                  className={cn(
                    'px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all',
                    'bg-primary-600 hover:bg-primary-700 shadow-md shadow-primary-600/20',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isSaving && 'animate-pulse'
                  )}
                >
                  {isSaving ? 'Saving...' : isCreating ? 'Create Event' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </form>
      </m.div>
    </div>
  );
}
