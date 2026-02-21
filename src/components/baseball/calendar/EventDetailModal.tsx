'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { X, Trash2, MapPin, Calendar, Clock, Users, AlertCircle, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { m, useReducedMotion } from 'framer-motion';
import {
  BASEBALL_EVENT_TYPES,
  getEventTypeConfig,
  type BaseballEventType,
} from './event-type-config';

// ============================================================================
// Types
// ============================================================================

export interface BaseballEventFormData {
  title: string;
  eventType: BaseballEventType;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
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

export interface BaseballCalendarEvent {
  id: string;
  title: string;
  event_type: string;
  start_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  description?: string | null;
  is_mandatory?: boolean;
  requires_rsvp?: boolean;
  rsvp_deadline?: string | null;
  max_attendees?: number | null;
}

interface EventDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: BaseballCalendarEvent | null;
  isCreating: boolean;
  isCoach: boolean;
  onSave: (data: BaseballEventFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  isSaving: boolean;
  teamPlayers?: TeamPlayer[];
  currentUserId?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const calendarSpring = {
  modalEntry: { type: 'spring' as const, stiffness: 400, damping: 30 },
};

// ============================================================================
// Component
// ============================================================================

export function BaseballEventDetailModal({
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
}: EventDetailModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const availablePlayers = teamPlayers.filter((p) => p.id !== currentUserId);

  const [formData, setFormData] = useState<BaseballEventFormData>({
    title: '',
    eventType: 'practice',
    startDate: getTodayDate(),
    endDate: null,
    startTime: '09:00',
    endTime: '11:00',
    allDay: false,
    location: null,
    description: null,
    isMandatory: false,
    requiresRsvp: false,
    rsvpDeadline: null,
    maxAttendees: null,
    attendeeIds: [],
  });

  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { modalRef } = useFocusTrap(isOpen, onClose);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      if (event && !isCreating) {
        // Edit mode - populate from event
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

        const hasTime = startTime !== null || endTime !== null;
        const rsvpDeadline = event.rsvp_deadline
          ? new Date(event.rsvp_deadline).toISOString().slice(0, 16)
          : null;

        setFormData({
          title: event.title || '',
          eventType: (event.event_type as BaseballEventType) || 'practice',
          startDate,
          endDate,
          startTime,
          endTime,
          allDay: !hasTime,
          location: event.location || null,
          description: event.description || null,
          isMandatory: event.is_mandatory || false,
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
    }
  }, [isOpen, event, isCreating]);

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
    setFormData((prev) => ({
      ...prev,
      attendeeIds: prev.attendeeIds.includes(playerId)
        ? prev.attendeeIds.filter((id) => id !== playerId)
        : [...prev.attendeeIds, playerId],
    }));
  };

  if (!isOpen) return null;

  const canEdit = isCreating || isCoach;
  const isViewMode = !isCreating && !isCoach;
  const activeTypeConfig = getEventTypeConfig(formData.eventType);
  const modalTitle = isCreating ? 'New Event' : isViewMode ? 'Event Details' : 'Edit Event';

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-modal-title"
    >
      {/* Backdrop */}
      <m.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <m.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : calendarSpring.modalEntry}
        className="relative bg-white rounded-[24px] border border-slate-200/60 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className={cn('bg-gradient-to-r px-6 pt-5 pb-4', activeTypeConfig.headerGradient)}>
          <div className="flex items-center justify-between mb-4">
            <h2 id="event-modal-title" className="text-lg font-semibold text-slate-900">
              {modalTitle}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Event Type Pills */}
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {BASEBALL_EVENT_TYPES.map((pill) => {
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
                const Icon = activeTypeConfig.icon;
                return (
                  <span
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold',
                      activeTypeConfig.activeBg,
                      activeTypeConfig.activeText
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {activeTypeConfig.label}
                  </span>
                );
              })()}
            </div>
          )}
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="px-6 py-5 space-y-4 max-h-[calc(90vh-200px)] overflow-y-auto overscroll-contain touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Title */}
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            disabled={isViewMode || isSaving}
            placeholder="Event name..."
            className="w-full px-0 py-2 text-xl font-semibold text-slate-900 placeholder:text-slate-300 border-none focus:ring-0 focus:outline-none bg-transparent disabled:text-slate-500"
            required
          />

          {/* Date & Time Section */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm">
                <Calendar className="w-4.5 h-4.5 text-slate-500" />
              </div>
              <div className="flex-1 grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  disabled={isViewMode || isSaving}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-slate-900 bg-white transition-colors disabled:bg-white disabled:text-slate-500"
                  required
                />
                <input
                  type="date"
                  value={formData.endDate || ''}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value || null })}
                  disabled={isViewMode || isSaving}
                  placeholder="End date"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-slate-900 bg-white transition-colors disabled:bg-white disabled:text-slate-500"
                />
              </div>
            </div>

            {!formData.allDay && (
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <Clock className="w-4.5 h-4.5 text-slate-500" />
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <input
                    type="time"
                    value={formData.startTime || ''}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value || null })}
                    disabled={isViewMode || isSaving}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-slate-900 bg-white transition-colors disabled:bg-white disabled:text-slate-500"
                  />
                  <input
                    type="time"
                    value={formData.endTime || ''}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value || null })}
                    disabled={isViewMode || isSaving}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-slate-900 bg-white transition-colors disabled:bg-white disabled:text-slate-500"
                  />
                </div>
              </div>
            )}

            {/* All Day Toggle */}
            <label className="flex items-center gap-3 pl-[52px] cursor-pointer group">
              <div
                className={cn(
                  'relative w-10 h-6 rounded-full transition-colors duration-200',
                  formData.allDay ? 'bg-primary-500' : 'bg-slate-300'
                )}
              >
                <input
                  type="checkbox"
                  checked={formData.allDay}
                  onChange={(e) => setFormData({ ...formData, allDay: e.target.checked })}
                  disabled={isViewMode || isSaving}
                  className="sr-only"
                />
                <div
                  className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                    formData.allDay && 'translate-x-4'
                  )}
                />
              </div>
              <span className="text-sm text-slate-600">All day</span>
            </label>
          </div>

          {/* Location */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
            <MapPin className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={formData.location || ''}
              onChange={(e) => setFormData({ ...formData, location: e.target.value || null })}
              disabled={isViewMode || isSaving}
              placeholder="Add location..."
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-slate-900 placeholder:text-slate-400 disabled:text-slate-500"
            />
          </div>

          {/* Description */}
          <div className="bg-slate-50 rounded-2xl px-4 py-3">
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
              disabled={isViewMode || isSaving}
              rows={2}
              placeholder="Add notes or description..."
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-slate-900 placeholder:text-slate-400 resize-none disabled:text-slate-500"
            />
          </div>

          {/* Attendees Section */}
          {canEdit && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-semibold text-slate-900">Attendees</span>
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
                          setFormData((prev) => ({ ...prev, attendeeIds: [] }));
                        } else {
                          setFormData((prev) => ({
                            ...prev,
                            attendeeIds: availablePlayers.map((p) => p.id),
                          }));
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
                <p className="text-sm text-slate-500 py-2">No team members available.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availablePlayers.map((player) => {
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
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                          'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        {player.avatar_url ? (
                          <Image
                            src={player.avatar_url}
                            alt=""
                            width={20}
                            height={20}
                            className="w-5 h-5 rounded-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <div
                            className={cn(
                              'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-300 text-slate-500'
                            )}
                          >
                            {player.first_name[0]}
                            {player.last_name[0]}
                          </div>
                        )}
                        <span>
                          {player.first_name} {player.last_name[0]}.
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* RSVP Toggle */}
          {canEdit && (
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Require RSVP</span>
              </div>
              <label className="cursor-pointer">
                <div
                  className={cn(
                    'relative w-10 h-6 rounded-full transition-colors duration-200',
                    formData.requiresRsvp ? 'bg-primary-500' : 'bg-slate-300'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={formData.requiresRsvp}
                    onChange={(e) => setFormData({ ...formData, requiresRsvp: e.target.checked })}
                    disabled={isViewMode || isSaving}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                      formData.requiresRsvp && 'translate-x-4'
                    )}
                  />
                </div>
              </label>
            </div>
          )}

          {/* RSVP Settings */}
          {canEdit && formData.requiresRsvp && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">RSVP Deadline</label>
                <input
                  type="datetime-local"
                  value={formData.rsvpDeadline || ''}
                  onChange={(e) => setFormData({ ...formData, rsvpDeadline: e.target.value || null })}
                  disabled={isViewMode || isSaving}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-slate-900 bg-white transition-colors disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Max Attendees</label>
                <input
                  type="number"
                  min="1"
                  value={formData.maxAttendees || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      maxAttendees: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  disabled={isViewMode || isSaving}
                  placeholder="No limit"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-100 text-sm text-slate-900 placeholder:text-slate-400 bg-white transition-colors disabled:bg-slate-50"
                />
              </div>
            </div>
          )}

          {/* Mandatory Toggle */}
          {canEdit && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-slate-700">Mark as Mandatory</span>
              <label className="cursor-pointer">
                <div
                  className={cn(
                    'relative w-10 h-6 rounded-full transition-colors duration-200',
                    formData.isMandatory ? 'bg-red-500' : 'bg-slate-300'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={formData.isMandatory}
                    onChange={(e) => setFormData({ ...formData, isMandatory: e.target.checked })}
                    disabled={isViewMode || isSaving}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                      formData.isMandatory && 'translate-x-4'
                    )}
                  />
                </div>
              </label>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-slate-100 flex items-center justify-between bg-slate-50/50 -mx-6 px-6 py-4 mt-4">
            {/* Delete Button */}
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
                        className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
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

            {/* Save/Cancel Buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg transition-colors"
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
