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
  { type: 'practice', label: 'Practice', icon: Dumbbell, activeBg: 'bg-stone-800', activeText: 'text-white', inactiveBg: 'bg-stone-100', inactiveText: 'text-stone-600' },
  { type: 'tournament', label: 'Tournament', icon: Trophy, activeBg: 'bg-emerald-600', activeText: 'text-white', inactiveBg: 'bg-emerald-50', inactiveText: 'text-emerald-700' },
  { type: 'qualifier', label: 'Qualifier', icon: ClipboardList, activeBg: 'bg-amber-500', activeText: 'text-white', inactiveBg: 'bg-amber-50', inactiveText: 'text-amber-700' },
  { type: 'meeting', label: 'Meeting', icon: Users, activeBg: 'bg-sky-600', activeText: 'text-white', inactiveBg: 'bg-sky-50', inactiveText: 'text-sky-700' },
  { type: 'travel', label: 'Travel', icon: Plane, activeBg: 'bg-purple-600', activeText: 'text-white', inactiveBg: 'bg-purple-50', inactiveText: 'text-purple-700' },
  { type: 'other', label: 'Other', icon: MoreHorizontal, activeBg: 'bg-slate-700', activeText: 'text-white', inactiveBg: 'bg-slate-100', inactiveText: 'text-slate-600' },
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

  // Find the active pill config for the current event type
  const activePill = MOBILE_EVENT_TYPE_PILLS.find(p => p.type === formData.eventType) ?? MOBILE_EVENT_TYPE_PILLS[0]!;

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
          'max-h-[92vh] overflow-hidden',
          'transform transition-transform duration-300 ease-out',
          isOpen ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ paddingBottom: safeAreaBottom }}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {/* Header with close */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {isCreating ? 'New Event' : isViewMode ? 'Event Details' : 'Edit Event'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 -mr-2 rounded-full hover:bg-slate-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto max-h-[calc(92vh-180px)] overscroll-contain">
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 mx-5 rounded-xl mb-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Event Type Pills - scrollable row */}
          {canEdit && (
            <div className="px-5 pb-4">
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                {MOBILE_EVENT_TYPE_PILLS.map((pill) => {
                  const Icon = pill.icon;
                  const isActive = formData.eventType === pill.type;
                  return (
                    <button
                      key={pill.type}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setFormData({ ...formData, eventType: pill.type });
                      }}
                      disabled={isSaving}
                      className={cn(
                        'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium',
                        'whitespace-nowrap transition-all duration-200 active:scale-95',
                        'min-h-[40px] touch-manipulation',
                        isActive
                          ? cn(pill.activeBg, pill.activeText, 'shadow-md')
                          : cn(pill.inactiveBg, pill.inactiveText)
                      )}
                    >
                      <Icon className="w-4 h-4" />
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
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
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
              className={cn(
                'w-full text-xl font-semibold text-slate-900 placeholder:text-slate-300',
                'bg-transparent border-0 outline-none p-0',
                'disabled:text-slate-700',
                'min-h-[40px]'
              )}
            />
          </div>

          {/* Date & Time Card */}
          <div className="px-5 pb-4">
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              {/* Date Row */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-4.5 h-4.5 text-slate-500" />
                </div>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  disabled={isViewMode || isSaving}
                  className={cn(
                    'flex-1 bg-transparent text-base text-slate-900 border-0 outline-none',
                    'disabled:text-slate-600 min-h-[40px]'
                  )}
                />
              </div>

              {/* All Day Toggle */}
              <div className="flex items-center justify-between pl-12">
                <span className="text-sm text-slate-600">All day</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!isViewMode && !isSaving) {
                      triggerHaptic('light');
                      setFormData({ ...formData, allDay: !formData.allDay });
                    }
                  }}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors duration-200',
                    formData.allDay ? 'bg-emerald-500' : 'bg-slate-300',
                    (isViewMode || isSaving) && 'opacity-50'
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                    formData.allDay && 'translate-x-5'
                  )} />
                </button>
              </div>

              {/* Time Row */}
              {!formData.allDay && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4.5 h-4.5 text-slate-500" />
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="time"
                      value={formData.startTime || ''}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value || null })}
                      disabled={isViewMode || isSaving}
                      className={cn(
                        'flex-1 bg-white rounded-xl px-3 py-2 text-base text-slate-900',
                        'border border-slate-200 outline-none min-h-[40px]',
                        'disabled:text-slate-600 disabled:bg-slate-50'
                      )}
                    />
                    <span className="text-slate-400 text-sm">to</span>
                    <input
                      type="time"
                      value={formData.endTime || ''}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value || null })}
                      disabled={isViewMode || isSaving}
                      className={cn(
                        'flex-1 bg-white rounded-xl px-3 py-2 text-base text-slate-900',
                        'border border-slate-200 outline-none min-h-[40px]',
                        'disabled:text-slate-600 disabled:bg-slate-50'
                      )}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Location - inline icon input */}
          <div className="px-5 pb-4">
            <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
              <MapPin className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                value={formData.location || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value || null })}
                disabled={isViewMode || isSaving}
                placeholder="Add location..."
                className={cn(
                  'flex-1 bg-transparent text-base text-slate-900 placeholder:text-slate-400',
                  'border-0 outline-none min-h-[40px]',
                  'disabled:text-slate-600'
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
              className={cn(
                'w-full bg-slate-50 rounded-2xl px-4 py-3 text-base text-slate-900',
                'placeholder:text-slate-400 border-0 outline-none resize-none',
                'disabled:text-slate-600'
              )}
            />
          </div>

          {/* RSVP Section for Players */}
          {!isCreating && event && event.requires_rsvp && !isCoach && onRsvp && (
            <div className="px-5 pb-4">
              <div className="bg-slate-50 rounded-2xl p-4">
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
            </div>
          )}

          {/* RSVP Summary for Coaches */}
          {!isCreating && isCoach && rsvpSummary && rsvpSummary.total > 0 && (
            <div className="px-5 pb-4">
              <div className="bg-slate-50 rounded-2xl p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Attendance ({rsvpSummary.accepted + rsvpSummary.tentative}/{rsvpSummary.total})
                </h4>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-white rounded-xl p-2.5 text-center shadow-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto mb-0.5" />
                    <p className="text-lg font-bold text-emerald-700">{rsvpSummary.accepted}</p>
                    <p className="text-[10px] text-emerald-600 font-medium">Going</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 text-center shadow-sm">
                    <HelpCircle className="w-4 h-4 text-amber-600 mx-auto mb-0.5" />
                    <p className="text-lg font-bold text-amber-700">{rsvpSummary.tentative}</p>
                    <p className="text-[10px] text-amber-600 font-medium">Maybe</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 text-center shadow-sm">
                    <XCircle className="w-4 h-4 text-rose-600 mx-auto mb-0.5" />
                    <p className="text-lg font-bold text-rose-700">{rsvpSummary.declined}</p>
                    <p className="text-[10px] text-rose-600 font-medium">No</p>
                  </div>
                  <div className="bg-white rounded-xl p-2.5 text-center shadow-sm">
                    <Clock className="w-4 h-4 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-lg font-bold text-slate-700">{rsvpSummary.pending}</p>
                    <p className="text-[10px] text-slate-500 font-medium">Pending</p>
                  </div>
                </div>
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
                    'px-4 py-3 rounded-2xl bg-slate-50',
                    'text-slate-700 font-medium text-sm',
                    'active:scale-[0.98] active:bg-slate-100',
                    'transition-all min-h-[48px]'
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
                    'transition-all min-h-[48px]'
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
                        'text-slate-700 font-medium',
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
          className="px-5 py-4 border-t border-slate-100 bg-white"
          style={{ paddingBottom: Math.max(safeAreaBottom, 16) }}
        >
          {canEdit ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className={cn(
                'w-full py-3.5 rounded-2xl font-semibold text-base',
                'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white',
                'shadow-lg shadow-emerald-600/25',
                'active:scale-[0.98] transition-all min-h-[52px]',
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
                'w-full py-3.5 rounded-2xl font-semibold text-base',
                'bg-slate-100 text-slate-700',
                'active:scale-[0.98] transition-all min-h-[52px]'
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
