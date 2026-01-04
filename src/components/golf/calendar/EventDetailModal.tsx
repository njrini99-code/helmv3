'use client';

import { useState, useEffect } from 'react';
import { X, Trash2, MapPin, Calendar, Clock, Users, AlertCircle, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { RSVPStatusSection } from './RSVPStatusSection';
import { ConflictWarning } from './ConflictWarning';
import { checkScheduleConflicts } from '@/app/golf/actions/golf';

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
  hasConflicts: boolean;
  conflicts: Array<{
    userId: string;
    userName: string;
    conflictingEvents: Array<{
      title: string;
      start: string;
      end: string;
    }>;
  }>;
  suggestions: Array<{
    start: Date;
    end: Date;
    score: number;
  }>;
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
}

const eventTypeColors: Record<GolfEventType, { bg: string; text: string; border: string }> = {
  practice: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  tournament: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  qualifier: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  meeting: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  travel: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  other: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
};

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
}: EventDetailModalProps) {
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

  // Reset form when modal opens/closes or event changes
  useEffect(() => {
    if (isOpen) {
      if (event && !isCreating) {
        // Edit mode - populate from event
        // Extract date and time from datetime strings
        const startDateTime = event.start_date || '';
        const endDateTime = event.end_date || '';

        const startDate = startDateTime.split('T')[0] || getTodayDate();
        const startTime = startDateTime.includes('T') ? startDateTime.split('T')[1]?.substring(0, 5) ?? null : null;

        const endDate = endDateTime ? endDateTime.split('T')[0] ?? null : null;
        const endTime = endDateTime?.includes('T') ? endDateTime.split('T')[1]?.substring(0, 5) ?? null : null;

        const hasTime = startTime !== null || endTime !== null;

        setFormData({
          title: event.title || '',
          eventType: (event.event_type as GolfEventType) || 'practice',
          startDate,
          endDate,
          startTime,
          endTime,
          allDay: !hasTime,
          location: event.location || null,
          courseName: null,
          description: event.description || null,
          isMandatory: false,
          requiresRsvp: false, // Will be populated from event data if available
          rsvpDeadline: null,
          maxAttendees: null,
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
      if (!formData.requiresRsvp || formData.attendeeIds.length === 0 || !formData.startDate) {
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
      } catch (err) {
        console.error('Error checking conflicts:', err);
      } finally {
        setCheckingConflicts(false);
      }
    }

    const debounce = setTimeout(checkConflicts, 500);
    return () => clearTimeout(debounce);
  }, [formData.attendeeIds, formData.startDate, formData.startTime, formData.endTime, formData.endDate, formData.requiresRsvp, formData.allDay]);

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

  const canEdit = isCoach;
  const isViewMode = !isCreating && !canEdit;
  const eventTypeColor = eventTypeColors[formData.eventType] || eventTypeColors.other;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white/95 backdrop-blur-xl rounded-[24px] border border-white/40 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${eventTypeColor.bg} ${eventTypeColor.border} border-2`} />
            <h2 className="text-lg font-semibold text-slate-900">
              {isCreating ? 'Create Event' : isViewMode ? 'Event Details' : 'Edit Event'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-5 max-h-[calc(90vh-140px)] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Event Title
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              disabled={isViewMode || isSaving}
              placeholder="Team Practice"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-slate-900 placeholder:text-slate-400 transition-colors disabled:bg-slate-50 disabled:text-slate-500"
              required
            />
          </div>

          {/* Event Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Event Type
            </label>
            <select
              value={formData.eventType}
              onChange={(e) => setFormData({ ...formData, eventType: e.target.value as GolfEventType })}
              disabled={isViewMode || isSaving}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-slate-900 bg-white transition-colors disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="practice">Practice</option>
              <option value="tournament">Tournament</option>
              <option value="qualifier">Qualifier</option>
              <option value="meeting">Meeting</option>
              <option value="travel">Travel</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Date Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Calendar className="w-3.5 h-3.5 inline-block mr-1" />
                Start Date
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                disabled={isViewMode || isSaving}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-slate-900 bg-white transition-colors disabled:bg-slate-50 disabled:text-slate-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={formData.endDate || ''}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value || null })}
                disabled={isViewMode || isSaving}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-slate-900 bg-white transition-colors disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>

          {/* All Day Toggle */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={formData.allDay}
              onChange={(e) => setFormData({ ...formData, allDay: e.target.checked })}
              disabled={isViewMode || isSaving}
              className="w-5 h-5 rounded-lg border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
            />
            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
              All day event
            </span>
          </label>

          {/* Time Row (hidden if all day) */}
          {!formData.allDay && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <Clock className="w-3.5 h-3.5 inline-block mr-1" />
                  Start Time
                </label>
                <input
                  type="time"
                  value={formData.startTime || ''}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value || null })}
                  disabled={isViewMode || isSaving}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-slate-900 bg-white transition-colors disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  End Time
                </label>
                <input
                  type="time"
                  value={formData.endTime || ''}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value || null })}
                  disabled={isViewMode || isSaving}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-slate-900 bg-white transition-colors disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            </div>
          )}

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <MapPin className="w-3.5 h-3.5 inline-block mr-1" />
              Location
            </label>
            <input
              type="text"
              value={formData.location || ''}
              onChange={(e) => setFormData({ ...formData, location: e.target.value || null })}
              disabled={isViewMode || isSaving}
              placeholder="City, State"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-slate-900 placeholder:text-slate-400 transition-colors disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          {/* Course Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Course Name
            </label>
            <input
              type="text"
              value={formData.courseName || ''}
              onChange={(e) => setFormData({ ...formData, courseName: e.target.value || null })}
              disabled={isViewMode || isSaving}
              placeholder="For tournaments or practices"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-slate-900 placeholder:text-slate-400 transition-colors disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Description
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
              disabled={isViewMode || isSaving}
              rows={3}
              placeholder="Event details and information..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-slate-900 placeholder:text-slate-400 transition-colors resize-none disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          {/* Mandatory Toggle */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={formData.isMandatory}
              onChange={(e) => setFormData({ ...formData, isMandatory: e.target.checked })}
              disabled={isViewMode || isSaving}
              className="w-5 h-5 rounded-lg border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
            />
            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
              <Users className="w-3.5 h-3.5 inline-block mr-1" />
              Mandatory attendance
            </span>
          </label>

          {/* RSVP Toggle */}
          {canEdit && (
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={formData.requiresRsvp}
                onChange={(e) => setFormData({ ...formData, requiresRsvp: e.target.checked })}
                disabled={isViewMode || isSaving}
                className="w-5 h-5 rounded-lg border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
              />
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                <UserPlus className="w-3.5 h-3.5 inline-block mr-1" />
                Require RSVP from attendees
              </span>
            </label>
          )}

          {/* RSVP Fields (shown when RSVP is enabled) */}
          {formData.requiresRsvp && canEdit && (
            <>
              {/* Player Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Invite Players
                </label>
                <div className="flex flex-wrap gap-2">
                  {teamPlayers.length === 0 ? (
                    <p className="text-sm text-slate-500">No team players available</p>
                  ) : (
                    teamPlayers.map(player => (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => handleToggleAttendee(player.id)}
                        disabled={isViewMode || isSaving}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                          formData.attendeeIds.includes(player.id)
                            ? 'bg-green-100 text-green-700 border-2 border-green-500'
                            : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:border-slate-300'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {player.first_name} {player.last_name}
                      </button>
                    ))
                  )}
                </div>
                {formData.attendeeIds.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    {formData.attendeeIds.length} player{formData.attendeeIds.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              {/* RSVP Deadline & Max Attendees Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    RSVP Deadline
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.rsvpDeadline || ''}
                    onChange={(e) => setFormData({ ...formData, rsvpDeadline: e.target.value || null })}
                    disabled={isViewMode || isSaving}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-slate-900 bg-white transition-colors disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Max Attendees
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxAttendees || ''}
                    onChange={(e) => setFormData({ ...formData, maxAttendees: e.target.value ? parseInt(e.target.value) : null })}
                    disabled={isViewMode || isSaving}
                    placeholder="Optional"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 text-slate-900 placeholder:text-slate-400 transition-colors disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
              </div>

              {/* Conflict Warning */}
              {checkingConflicts && (
                <div className="p-3 bg-slate-50 rounded-xl text-sm text-slate-600 flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full" />
                  Checking for scheduling conflicts...
                </div>
              )}

              {conflicts && conflicts.hasConflicts && (
                <ConflictWarning
                  conflicts={conflicts.conflicts}
                  suggestions={conflicts.suggestions}
                  onSelectTime={handleSelectSuggestedTime}
                />
              )}
            </>
          )}

          {/* RSVP Status Section (for existing events with RSVP) */}
          {!isCreating && event?.id && formData.requiresRsvp && (
            <div className="border-t border-slate-200 -mx-6 px-6 pt-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-3">RSVP Status</h4>
              <RSVPStatusSection eventId={event.id} />
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200/50 flex items-center justify-between">
          {/* Delete Button (left side) */}
          <div>
            {onDelete && !isCreating && (
              <>
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">Confirm delete?</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isSaving}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Yes, Delete
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
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
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
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              {isViewMode ? 'Close' : 'Cancel'}
            </Button>
            {!isViewMode && (
              <Button
                type="submit"
                onClick={handleSubmit}
                isLoading={isSaving}
              >
                {isCreating ? 'Create Event' : 'Save Changes'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
