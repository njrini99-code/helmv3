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
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  XCircle,
} from 'lucide-react';
import { MobileRSVPButtons, type RSVPResponse } from './MobileRSVPButtons';
import { useSafeAreaInsets, useHapticFeedback } from '@/hooks/use-mobile-detection';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { getEventTypeConfig } from '@/lib/calendar/event-styles';
import type { EventType } from '@/lib/types/calendar';

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
  } | null;
  /** Pre-fill event type when creating a new event (from quick-add FAB) */
  initialEventType?: GolfEventType;
}

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const EVENT_TYPE_OPTIONS: { value: GolfEventType; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'qualifier', label: 'Qualifier' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
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

        const startDate = startDateTime.split('T')[0] || getTodayDate();
        const startTime = startDateTime.includes('T')
          ? startDateTime.split('T')[1]?.substring(0, 5) ?? null
          : null;

        const endDate = endDateTime ? endDateTime.split('T')[0] ?? null : null;
        const endTime = endDateTime?.includes('T')
          ? endDateTime.split('T')[1]?.substring(0, 5) ?? null
          : null;

        setFormData({
          title: event.title || '',
          eventType: (event.event_type as GolfEventType) || 'practice',
          startDate,
          endDate,
          startTime,
          endTime,
          allDay: !startTime && !endTime,
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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
      triggerHaptic('error');
    } finally {
      setIsSaving(false);
    }
  }, [formData, onSave, onClose, triggerHaptic]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete();
      triggerHaptic('success');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event');
      triggerHaptic('error');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [onDelete, onClose, triggerHaptic]);

  const handleRsvp = useCallback(async (response: RSVPResponse) => {
    if (!onRsvp) return { success: false, error: 'RSVP not available' };
    return onRsvp(response);
  }, [onRsvp]);

  if (!isOpen) return null;

  const canEdit = isCreating || isCoach;
  const isViewMode = !isCreating && !isCoach;
  const eventTypeConfig = event
    ? getEventTypeConfig(event.event_type as EventType)
    : getEventTypeConfig(formData.eventType as EventType);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={handleClose}
      />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
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
        <div className="flex justify-center py-3">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-3 h-3 rounded-full',
                eventTypeConfig.bgColor,
                eventTypeConfig.borderColor,
                'border-2'
              )}
            />
            <h2 className="text-lg font-semibold text-slate-900">
              {isCreating ? 'New Event' : isViewMode ? 'Event Details' : 'Edit Event'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 -mr-2 rounded-full hover:bg-slate-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-200px)] px-5 py-4 overscroll-contain">
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Event Title
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={isViewMode || isSaving}
                placeholder="Team Practice"
                className={cn(
                  'w-full px-4 py-3 rounded-xl border border-slate-200',
                  'text-slate-900 placeholder:text-slate-400',
                  'focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
                  'disabled:bg-slate-50 disabled:text-slate-500',
                  'min-h-[48px] text-base' // Touch-friendly
                )}
              />
            </div>

            {/* Event Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Event Type
              </label>
              <div className="relative">
                <select
                  value={formData.eventType}
                  onChange={(e) => setFormData({ ...formData, eventType: e.target.value as GolfEventType })}
                  disabled={isViewMode || isSaving}
                  className={cn(
                    'w-full px-4 py-3 rounded-xl border border-slate-200 appearance-none',
                    'text-slate-900 bg-white',
                    'focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
                    'disabled:bg-slate-50 disabled:text-slate-500',
                    'min-h-[48px] text-base'
                  )}
                >
                  {EVENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Calendar className="w-4 h-4 inline-block mr-1.5" />
                Date
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                disabled={isViewMode || isSaving}
                className={cn(
                  'w-full px-4 py-3 rounded-xl border border-slate-200',
                  'text-slate-900 bg-white',
                  'focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
                  'disabled:bg-slate-50 disabled:text-slate-500',
                  'min-h-[48px] text-base'
                )}
              />
            </div>

            {/* All Day Toggle */}
            <label className="flex items-center gap-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.allDay}
                onChange={(e) => setFormData({ ...formData, allDay: e.target.checked })}
                disabled={isViewMode || isSaving}
                className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-base text-slate-700">All day event</span>
            </label>

            {/* Time (if not all day) */}
            {!formData.allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <Clock className="w-4 h-4 inline-block mr-1.5" />
                    Start
                  </label>
                  <input
                    type="time"
                    value={formData.startTime || ''}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value || null })}
                    disabled={isViewMode || isSaving}
                    className={cn(
                      'w-full px-4 py-3 rounded-xl border border-slate-200',
                      'text-slate-900 bg-white',
                      'focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
                      'disabled:bg-slate-50 disabled:text-slate-500',
                      'min-h-[48px] text-base'
                    )}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    End
                  </label>
                  <input
                    type="time"
                    value={formData.endTime || ''}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value || null })}
                    disabled={isViewMode || isSaving}
                    className={cn(
                      'w-full px-4 py-3 rounded-xl border border-slate-200',
                      'text-slate-900 bg-white',
                      'focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
                      'disabled:bg-slate-50 disabled:text-slate-500',
                      'min-h-[48px] text-base'
                    )}
                  />
                </div>
              </div>
            )}

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <MapPin className="w-4 h-4 inline-block mr-1.5" />
                Location
              </label>
              <input
                type="text"
                value={formData.location || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value || null })}
                disabled={isViewMode || isSaving}
                placeholder="Golf Course, City"
                className={cn(
                  'w-full px-4 py-3 rounded-xl border border-slate-200',
                  'text-slate-900 placeholder:text-slate-400',
                  'focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
                  'disabled:bg-slate-50 disabled:text-slate-500',
                  'min-h-[48px] text-base'
                )}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Notes
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
                disabled={isViewMode || isSaving}
                rows={3}
                placeholder="Additional details..."
                className={cn(
                  'w-full px-4 py-3 rounded-xl border border-slate-200 resize-none',
                  'text-slate-900 placeholder:text-slate-400',
                  'focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
                  'disabled:bg-slate-50 disabled:text-slate-500',
                  'text-base'
                )}
              />
            </div>

            {/* RSVP Section for Players */}
            {!isCreating && event && event.requires_rsvp && !isCoach && onRsvp && (
              <div className="border-t border-slate-200 pt-5 mt-5">
                <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Your Response
                </h4>
                <MobileRSVPButtons
                  currentResponse={userRsvpStatus || null}
                  onRespond={handleRsvp}
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
            )}

            {/* RSVP Summary for Coaches */}
            {!isCreating && isCoach && rsvpSummary && rsvpSummary.total > 0 && (
              <div className="border-t border-slate-200 pt-5 mt-5">
                <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Attendance ({rsvpSummary.accepted + rsvpSummary.tentative}/{rsvpSummary.total})
                </h4>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-emerald-700">{rsvpSummary.accepted}</p>
                    <p className="text-xs text-emerald-600">Going</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <HelpCircle className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-amber-700">{rsvpSummary.tentative}</p>
                    <p className="text-xs text-amber-600">Maybe</p>
                  </div>
                  <div className="bg-rose-50 rounded-xl p-3 text-center">
                    <XCircle className="w-5 h-5 text-rose-600 mx-auto mb-1" />
                    <p className="text-lg font-bold text-rose-700">{rsvpSummary.declined}</p>
                    <p className="text-xs text-rose-600">No</p>
                  </div>
                  <div className="bg-slate-100 rounded-xl p-3 text-center">
                    <Clock className="w-5 h-5 text-slate-500 mx-auto mb-1" />
                    <p className="text-lg font-bold text-slate-700">{rsvpSummary.pending}</p>
                    <p className="text-xs text-slate-500">Pending</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions for Coaches */}
            {!isCreating && isCoach && (onSendReminder || onDelete) && (
              <div className="border-t border-slate-200 pt-5 mt-5 space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Quick Actions</h4>

                {onSendReminder && (
                  <button
                    type="button"
                    onClick={onSendReminder}
                    className={cn(
                      'w-full flex items-center justify-center gap-2',
                      'px-4 py-3 rounded-xl border border-slate-200',
                      'text-slate-700 font-medium',
                      'hover:bg-slate-50 active:scale-[0.98]',
                      'transition-all min-h-[48px]'
                    )}
                  >
                    <Bell className="w-5 h-5" />
                    Send Reminder
                  </button>
                )}

                {onDelete && !showDeleteConfirm && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className={cn(
                      'w-full flex items-center justify-center gap-2',
                      'px-4 py-3 rounded-xl border border-red-200',
                      'text-red-600 font-medium',
                      'hover:bg-red-50 active:scale-[0.98]',
                      'transition-all min-h-[48px]'
                    )}
                  >
                    <Trash2 className="w-5 h-5" />
                    Cancel Event
                  </button>
                )}

                {showDeleteConfirm && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-sm text-red-700 mb-3">
                      Are you sure you want to cancel this event?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isDeleting}
                        className={cn(
                          'flex-1 px-4 py-2.5 rounded-lg border border-slate-200',
                          'text-slate-700 font-medium',
                          'hover:bg-white min-h-[44px]'
                        )}
                      >
                        Keep Event
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className={cn(
                          'flex-1 px-4 py-2.5 rounded-lg',
                          'bg-red-600 text-white font-medium',
                          'hover:bg-red-700 min-h-[44px]',
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
        </div>

        {/* Footer Actions */}
        <div
          className="px-5 py-4 border-t border-slate-200 bg-slate-50"
          style={{ paddingBottom: Math.max(safeAreaBottom, 16) }}
        >
          {canEdit ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSaving}
                className={cn(
                  'flex-1 px-4 py-3 rounded-xl border border-slate-200',
                  'text-slate-700 font-semibold',
                  'hover:bg-white active:scale-[0.98]',
                  'transition-all min-h-[52px]'
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSaving}
                className={cn(
                  'flex-1 px-4 py-3 rounded-xl',
                  'bg-primary-600 text-white font-semibold',
                  'hover:bg-primary-700 active:scale-[0.98]',
                  'transition-all min-h-[52px]',
                  isSaving && 'opacity-50'
                )}
              >
                {isSaving ? 'Saving...' : isCreating ? 'Create Event' : 'Save Changes'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'w-full px-4 py-3 rounded-xl',
                'bg-slate-200 text-slate-700 font-semibold',
                'hover:bg-slate-300 active:scale-[0.98]',
                'transition-all min-h-[52px]'
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
