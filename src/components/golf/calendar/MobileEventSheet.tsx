'use client';

/**
 * MobileEventSheet - Bottom sheet modal for event details/editing on mobile
 *
 * Features:
 * - Draggable bottom sheet with snap points
 * - Touch-optimized form inputs
 * - Native date/time pickers
 * - Quick actions (cancel, send reminder)
 * - RSVP section for players
 * - Attendance overview for coaches
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Users,
  Trash2,
  Bell,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  XCircle,
  Dumbbell,
  Trophy,
  ClipboardList,
  Plane,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import { MobileRSVPButtons, type RSVPResponse } from './MobileRSVPButtons';
import { useSafeAreaInsets, useHapticFeedback } from '@/hooks/use-mobile-detection';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

type GolfEventType = 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';

export interface MobileEventFormData {
  title: string;
  eventType: GolfEventType;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
}

interface MobileEventSheetProps {
  isOpen: boolean;
  onClose: () => void;
  event: CalendarEvent | null;
  isCreating: boolean;
  isCoach: boolean;
  onSave?: (data: MobileEventFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onSendReminder?: () => Promise<void>;
  userRsvpStatus?: RSVPResponse | null;
  onRsvp?: (response: RSVPResponse) => Promise<{ success: boolean; error?: string }>;
  rsvpSummary?: {
    accepted: number;
    tentative: number;
    declined: number;
    pending: number;
    total: number;
    /** Optional drilldown roster — when present, the attendance card on
     *  the coach sheet expands to show each attendee with their status. */
    attendees?: Array<{
      playerId: string;
      playerName: string;
      avatarUrl: string | null;
      status: 'accepted' | 'tentative' | 'declined' | 'pending';
    }>;
  } | null;
  /** Pre-fill event type when creating a new event (from quick-add FAB) */
  initialEventType?: GolfEventType;
}

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Premium event type pills for mobile
const MOBILE_EVENT_TYPE_PILLS: Array<{
  type: GolfEventType;
  label: string;
  icon: typeof Dumbbell;
  activeBg: string;
  activeText: string;
  inactiveBg: string;
  inactiveText: string;
}> = [
  { type: 'practice', label: 'Practice', icon: Dumbbell, activeBg: 'bg-warm-800', activeText: 'text-white', inactiveBg: 'bg-warm-100', inactiveText: 'text-warm-600' },
  { type: 'tournament', label: 'Tournament', icon: Trophy, activeBg: 'bg-primary-600', activeText: 'text-white', inactiveBg: 'bg-primary-50', inactiveText: 'text-primary-700' },
  { type: 'qualifier', label: 'Qualifier', icon: ClipboardList, activeBg: 'bg-amber-500', activeText: 'text-white', inactiveBg: 'bg-amber-50', inactiveText: 'text-amber-700' },
  { type: 'meeting', label: 'Meeting', icon: Users, activeBg: 'bg-sky-600', activeText: 'text-white', inactiveBg: 'bg-sky-50', inactiveText: 'text-sky-700' },
  { type: 'travel', label: 'Travel', icon: Plane, activeBg: 'bg-purple-600', activeText: 'text-white', inactiveBg: 'bg-purple-50', inactiveText: 'text-purple-700' },
  { type: 'other', label: 'Other', icon: MoreHorizontal, activeBg: 'bg-warm-700', activeText: 'text-white', inactiveBg: 'bg-warm-100', inactiveText: 'text-warm-600' },
];

export function MobileEventSheet({
  isOpen,
  onClose,
  event,
  isCreating,
  isCoach,
  onSave,
  onDelete,
  onSendReminder,
  userRsvpStatus,
  onRsvp,
  rsvpSummary,
  initialEventType,
}: MobileEventSheetProps) {
  const [formData, setFormData] = useState<MobileEventFormData>({
    title: '',
    eventType: 'practice',
    startDate: getTodayDate(),
    endDate: null,
    startTime: '09:00',
    endTime: '11:00',
    allDay: false,
    location: null,
    description: null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  const { bottom: safeAreaBottom } = useSafeAreaInsets();
  const { triggerHaptic } = useHapticFeedback();

  // Reset form when event changes
  useEffect(() => {
    if (isOpen) {
      if (event && !isCreating) {
        const startDateTime = event.start_date || '';
        const endDateTime = event.end_date || '';

        // Parse datetime strings using Date object to get correct local time
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
          description: event.description || null,
        });
      } else {
        // When creating, use initialEventType if provided (from quick-add FAB)
        setFormData({
          title: '',
          eventType: initialEventType || 'practice',
          startDate: getTodayDate(),
          endDate: null,
          startTime: '09:00',
          endTime: '11:00',
          allDay: false,
          location: null,
          description: null,
        });
      }
      setError(null);
      setShowDeleteConfirm(false);
    }
  }, [isOpen, event, isCreating, initialEventType]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [isOpen]);

  const handleClose = useCallback(() => {
    triggerHaptic('light');
    onClose();
  }, [onClose, triggerHaptic]);

  const handleSubmit = useCallback(async () => {
    if (!onSave) return;

    if (!formData.title.trim()) {
      setError('Event title is required');
      triggerHaptic('warning');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(formData);
      triggerHaptic('success');
      // Don't call onClose() here — the parent's onSave handler already
      // closes the sheet (setIsMobileSheetOpen(false)) to avoid double-close.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
      triggerHaptic('error');
    } finally {
      setIsSaving(false);
    }
  }, [formData, onSave, triggerHaptic]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete();
      triggerHaptic('success');
      // Don't call onClose() here — the parent's onDelete handler already
      // closes the sheet to avoid double-close.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event');
      triggerHaptic('error');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [onDelete, triggerHaptic]);

  const handleRsvp = useCallback(async (response: RSVPResponse) => {
    if (!onRsvp) return { success: false, error: 'RSVP not available' };
    return onRsvp(response);
  }, [onRsvp]);

  if (!isOpen) return null;

  const canEdit = isCreating || isCoach;
  const isViewMode = !isCreating && !isCoach;

  // Find the active pill config for the current event type
  const activePill = MOBILE_EVENT_TYPE_PILLS.find(p => p.type === formData.eventType) ?? MOBILE_EVENT_TYPE_PILLS[0]!;

  return (
    <>
      {/* Backdrop — no backdrop-blur to avoid Safari stacking context bugs with fixed children */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={handleClose}
      />

      {/* Bottom Sheet — use 90vh (not dvh) for stable height on mobile Safari */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={isCreating ? 'New Event' : isViewMode ? 'Event Details' : 'Edit Event'}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50',
          'bg-white rounded-t-3xl shadow-2xl',
          'max-h-[90vh] overflow-hidden',
          'transform transition-transform duration-300 ease-out',
          isOpen ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ paddingBottom: safeAreaBottom }}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3" aria-hidden="true">
          <div className="w-10 h-1 bg-warm-300 rounded-full" />
        </div>

        {/* Header with close */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-lg font-semibold text-warm-900">
            {isCreating ? 'New Event' : isViewMode ? 'Event Details' : 'Edit Event'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="p-2 -mr-2 rounded-full hover:bg-warm-100 active:bg-warm-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5 text-warm-500" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-180px)] overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Error message */}
          {error && (
            <div role="alert" id="event-form-error" className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 mx-5 rounded-xl mb-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Event Type Pills - scrollable row */}
          {canEdit && (
            <div className="px-5 pb-4">
              <div className="pills-scroll pb-1 -mx-1 px-1" role="radiogroup" aria-label="Event type">
                {MOBILE_EVENT_TYPE_PILLS.map((pill) => {
                  const Icon = pill.icon;
                  const isActive = formData.eventType === pill.type;
                  return (
                    <button
                      key={pill.type}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => {
                        triggerHaptic('light');
                        setFormData({ ...formData, eventType: pill.type });
                      }}
                      disabled={isSaving}
                      className={cn(
                        'flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium',
                        'whitespace-nowrap transition-[color,background-color,transform,box-shadow] duration-200 active:scale-95',
                        'min-h-[40px] touch-manipulation',
                        isActive
                          ? cn(pill.activeBg, pill.activeText, 'shadow-md')
                          : cn(pill.inactiveBg, pill.inactiveText)
                      )}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                      {pill.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* View-mode event type badge */}
          {isViewMode && (
            <div className="px-5 pb-4">
              <span className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
                activePill.activeBg, activePill.activeText
              )}>
                {(() => { const Icon = activePill.icon; return <Icon className="w-4 h-4" />; })()}
                {activePill.label}
              </span>
            </div>
          )}

          {/* Hero Title Input */}
          <div className="px-5 pb-4">
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              disabled={isViewMode || isSaving}
              placeholder="Event title..."
              aria-label="Event title"
              aria-describedby={error ? 'event-form-error' : undefined}
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="next"
              className={cn(
                'w-full text-xl font-semibold text-warm-900 placeholder:text-warm-300',
                'bg-transparent border-0 outline-none p-0',
                'disabled:text-warm-700',
                'min-h-[40px]'
              )}
            />
          </div>

          {/* Date & Time Card */}
          <div className="px-5 pb-4">
            <div className="bg-warm-50 rounded-2xl p-4 space-y-3">
              {/* Date Row — Start & End */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-4.5 h-4.5 text-warm-500" />
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    disabled={isViewMode || isSaving}
                    aria-label="Start date"
                    className={cn(
                      'flex-1 bg-white rounded-xl px-3 py-2 text-base text-warm-900',
                      'border border-warm-200 outline-none min-h-[40px]',
                      'focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:border-primary-300',
                      'disabled:text-warm-600 disabled:bg-warm-50'
                    )}
                  />
                  <span className="text-warm-400 text-sm" aria-hidden="true">to</span>
                  <input
                    type="date"
                    value={formData.endDate || ''}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value || null })}
                    disabled={isViewMode || isSaving}
                    aria-label="End date"
                    className={cn(
                      'flex-1 bg-white rounded-xl px-3 py-2 text-base text-warm-900',
                      'border border-warm-200 outline-none min-h-[40px]',
                      'focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:border-primary-300',
                      'disabled:text-warm-600 disabled:bg-warm-50'
                    )}
                  />
                </div>
              </div>

              {/* All Day Toggle */}
              <div className="flex items-center justify-between pl-12">
                <span id="all-day-label" className="text-sm text-warm-600">All day</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.allDay}
                  aria-labelledby="all-day-label"
                  onClick={() => {
                    if (!isViewMode && !isSaving) {
                      triggerHaptic('light');
                      setFormData({ ...formData, allDay: !formData.allDay });
                    }
                  }}
                  disabled={isViewMode || isSaving}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors duration-200',
                    formData.allDay ? 'bg-primary-500' : 'bg-warm-300',
                    (isViewMode || isSaving) && 'opacity-50'
                  )}
                >
                  <span aria-hidden="true" className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                    formData.allDay && 'translate-x-5'
                  )} />
                </button>
              </div>

              {/* Time Row */}
              {!formData.allDay && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4.5 h-4.5 text-warm-500" />
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="time"
                      value={formData.startTime || ''}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value || null })}
                      disabled={isViewMode || isSaving}
                      aria-label="Start time"
                      className={cn(
                        'flex-1 bg-white rounded-xl px-3 py-2 text-base text-warm-900',
                        'border border-warm-200 outline-none min-h-[40px]',
                        'focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:border-primary-300',
                        'disabled:text-warm-600 disabled:bg-warm-50'
                      )}
                    />
                    <span className="text-warm-400 text-sm" aria-hidden="true">to</span>
                    <input
                      type="time"
                      value={formData.endTime || ''}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value || null })}
                      disabled={isViewMode || isSaving}
                      aria-label="End time"
                      className={cn(
                        'flex-1 bg-white rounded-xl px-3 py-2 text-base text-warm-900',
                        'border border-warm-200 outline-none min-h-[40px]',
                        'focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:border-primary-300',
                        'disabled:text-warm-600 disabled:bg-warm-50'
                      )}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Location - inline icon input */}
          <div className="px-5 pb-4">
            <div className="flex items-center gap-3 bg-warm-50 rounded-2xl px-4 py-3">
              <MapPin className="w-5 h-5 text-warm-400 flex-shrink-0" aria-hidden="true" />
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
                className={cn(
                  'flex-1 bg-transparent text-base text-warm-900 placeholder:text-warm-400',
                  'border-0 outline-none min-h-[40px]',
                  'disabled:text-warm-600'
                )}
              />
            </div>
          </div>

          {/* Description */}
          <div className="px-5 pb-4">
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
              disabled={isViewMode || isSaving}
              rows={2}
              placeholder="Add notes..."
              aria-label="Description"
              autoCapitalize="sentences"
              autoCorrect="on"
              className={cn(
                'w-full bg-warm-50 rounded-2xl px-4 py-3 text-base text-warm-900',
                'placeholder:text-warm-400 border-0 outline-none resize-none',
                'disabled:text-warm-600'
              )}
            />
          </div>

          {/* RSVP Section for Players */}
          {!isCreating && event && event.requires_rsvp && !isCoach && onRsvp && (
            <div className="px-5 pb-4">
              <div className="bg-warm-50 rounded-2xl p-4">
                <h4 className="text-sm font-semibold text-warm-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Your Response
                </h4>
                <MobileRSVPButtons
                  currentResponse={userRsvpStatus || null}
                  onRespond={handleRsvp}
                  rsvpDeadline={event.rsvp_deadline}
                  size="lg"
                  layout="horizontal"
                  showLabels
                />

                {event.rsvp_deadline && (
                  <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    RSVP by {format(parseISO(event.rsvp_deadline), 'MMM d, h:mm a')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* RSVP Summary for Coaches */}
          {!isCreating && isCoach && rsvpSummary && rsvpSummary.total > 0 && (
            <div className="px-5 pb-4">
              <div className="bg-warm-50 rounded-2xl p-4">
                <button
                  type="button"
                  onClick={() => rsvpSummary.attendees && setShowRoster((v) => !v)}
                  disabled={!rsvpSummary.attendees}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 mb-3',
                    rsvpSummary.attendees && 'active:opacity-80',
                  )}
                  aria-expanded={showRoster}
                  aria-controls="mobile-rsvp-roster"
                >
                  <h4 className="text-sm font-semibold text-warm-900 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Attendance ({rsvpSummary.accepted + rsvpSummary.tentative}/{rsvpSummary.total})
                  </h4>
                  {rsvpSummary.attendees && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-warm-500">
                      {showRoster ? 'Hide roster' : 'View roster'}
                      <ChevronDown
                        className={cn(
                          'w-3.5 h-3.5 transition-transform duration-200',
                          showRoster && 'rotate-180',
                        )}
                      />
                    </span>
                  )}
                </button>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-white rounded-xl p-2.5 text-center shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-primary-600 mx-auto mb-0.5" />
                    <p className="text-lg font-bold text-primary-700">{rsvpSummary.accepted}</p>
                    <p className="text-xs text-primary-600 font-medium">Going</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 text-center shadow-sm">
                    <HelpCircle className="w-4 h-4 text-amber-600 mx-auto mb-0.5" />
                    <p className="text-lg font-bold text-amber-700">{rsvpSummary.tentative}</p>
                    <p className="text-xs text-amber-600 font-medium">Maybe</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 text-center shadow-sm">
                    <XCircle className="w-4 h-4 text-rose-600 mx-auto mb-0.5" />
                    <p className="text-lg font-bold text-rose-700">{rsvpSummary.declined}</p>
                    <p className="text-xs text-rose-600 font-medium">No</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 text-center shadow-sm">
                    <Clock className="w-4 h-4 text-warm-500 mx-auto mb-0.5" />
                    <p className="text-lg font-bold text-warm-700">{rsvpSummary.pending}</p>
                    <p className="text-xs text-warm-500 font-medium">Pending</p>
                  </div>
                </div>

                {showRoster && rsvpSummary.attendees && (
                  <ul
                    id="mobile-rsvp-roster"
                    className="mt-3 space-y-1.5 max-h-72 overflow-y-auto"
                  >
                    {rsvpSummary.attendees.map((att) => {
                      const dot =
                        att.status === 'accepted' ? 'bg-primary-500'
                        : att.status === 'tentative' ? 'bg-amber-500'
                        : att.status === 'declined' ? 'bg-rose-500'
                        : 'bg-warm-300';
                      const label =
                        att.status === 'accepted' ? 'Going'
                        : att.status === 'tentative' ? 'Maybe'
                        : att.status === 'declined' ? 'Declined'
                        : 'Pending';
                      const initials = att.playerName
                        .split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                      return (
                        <li
                          key={att.playerId}
                          className="flex items-center gap-3 px-2 py-2 bg-white rounded-xl"
                        >
                          {att.avatarUrl ? (
                            <img
                              src={att.avatarUrl}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-warm-100 text-warm-600 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                              {initials || '?'}
                            </span>
                          )}
                          <span className="flex-1 text-sm font-medium text-warm-800 truncate">
                            {att.playerName}
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-xs text-warm-500 flex-shrink-0">
                            <span className={cn('w-2 h-2 rounded-full', dot)} aria-hidden="true" />
                            {label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions for Coaches */}
          {!isCreating && isCoach && (onSendReminder || onDelete) && (
            <div className="px-5 pb-4 space-y-2">
              {onSendReminder && (
                <button
                  type="button"
                  onClick={onSendReminder}
                  className={cn(
                    'w-full flex items-center justify-center gap-2',
                    'px-4 py-3 rounded-2xl bg-warm-50',
                    'text-warm-700 font-medium text-sm',
                    'active:scale-[0.98] active:bg-warm-100',
                    'transition-[background-color,transform] min-h-[48px]'
                  )}
                >
                  <Bell className="w-4.5 h-4.5" />
                  Send Reminder
                </button>
              )}

              {onDelete && !showDeleteConfirm && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className={cn(
                    'w-full flex items-center justify-center gap-2',
                    'px-4 py-3 rounded-2xl bg-red-50',
                    'text-red-600 font-medium text-sm',
                    'active:scale-[0.98] active:bg-red-100',
                    'transition-[background-color,transform] min-h-[48px]'
                  )}
                >
                  <Trash2 className="w-4.5 h-4.5" />
                  Cancel Event
                </button>
              )}

              {showDeleteConfirm && (
                <div className="bg-red-50 rounded-2xl p-4">
                  <p className="text-sm text-red-700 mb-3">
                    Are you sure you want to cancel this event?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                      className={cn(
                        'flex-1 px-4 py-2.5 rounded-xl bg-white',
                        'text-warm-700 font-medium',
                        'active:scale-[0.98] min-h-[44px] shadow-sm'
                      )}
                    >
                      Keep Event
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className={cn(
                        'flex-1 px-4 py-2.5 rounded-xl',
                        'bg-red-600 text-white font-medium',
                        'active:scale-[0.98] min-h-[44px]',
                        isDeleting && 'opacity-50'
                      )}
                    >
                      {isDeleting ? 'Canceling...' : 'Yes, Cancel'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          className="px-5 py-4 border-t border-warm-100 bg-white"
          style={{ paddingBottom: Math.max(safeAreaBottom, 16) }}
        >
          {canEdit ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className={cn(
                'w-full py-4 rounded-2xl font-semibold text-base',
                'bg-gradient-to-r from-primary-600 to-primary-500 text-white',
                'shadow-lg shadow-primary-600/25',
                'active:scale-[0.98] transition-[transform,opacity] min-h-[52px]',
                isSaving && 'opacity-50'
              )}
            >
              {isSaving ? 'Saving...' : isCreating ? 'Create Event' : 'Save Changes'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'w-full py-4 rounded-2xl font-semibold text-base',
                'bg-warm-100 text-warm-700',
                'active:scale-[0.98] transition-[transform,opacity] min-h-[52px]'
              )}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </>
  );
}
