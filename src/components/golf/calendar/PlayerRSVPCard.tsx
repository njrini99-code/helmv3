'use client';

import { useState } from 'react';
import { Calendar, MapPin, Clock, Check, X, HelpCircle, AlertTriangle } from 'lucide-react';
import { respondToEvent } from '@/app/golf/actions/golf';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

interface EventInvitation {
  eventId: string;
  eventTitle: string;
  eventType: string;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
  requiresRsvp: boolean;
  rsvpDeadline: string | null;
  createdBy: string;
  status: 'pending' | 'accepted' | 'declined' | 'tentative';
}

interface PlayerRSVPCardProps {
  event: EventInvitation;
  onRespond?: () => void; // Callback after response
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatEventDateTime(event: EventInvitation): string {
  const startDate = new Date(event.startDate);
  const dateStr = startDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (event.startTime) {
    const [hours, minutes] = event.startTime.split(':');
    const hour = parseInt(hours ?? '0');
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const timeStr = `${displayHour}:${minutes ?? '00'} ${period}`;

    if (event.endTime) {
      const [endHours, endMinutes] = event.endTime.split(':');
      const endHour = parseInt(endHours ?? '0');
      const endPeriod = endHour >= 12 ? 'PM' : 'AM';
      const endDisplayHour = endHour > 12 ? endHour - 12 : endHour === 0 ? 12 : endHour;
      const endTimeStr = `${endDisplayHour}:${endMinutes ?? '00'} ${endPeriod}`;
      return `${dateStr} • ${timeStr} - ${endTimeStr}`;
    }

    return `${dateStr} • ${timeStr}`;
  }

  return dateStr;
}

function getEventTypeColor(eventType: string): {
  bg: string;
  text: string;
  border: string;
} {
  const defaultColor = { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-500' };

  const colors: Record<string, { bg: string; text: string; border: string }> = {
    practice: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-500' },
    tournament: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-500' },
    qualifier: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-500' },
    meeting: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-500' },
    travel: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-500' },
    other: defaultColor,
  };

  return colors[eventType] || defaultColor;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PlayerRSVPCard({ event, onRespond }: PlayerRSVPCardProps) {
  const [isResponding, setIsResponding] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(event.status);

  const colors = getEventTypeColor(event.eventType ?? 'other');

  const handleRespond = async (status: 'accepted' | 'declined' | 'tentative') => {
    setIsResponding(true);

    try {
      const result = await respondToEvent(event.eventId, status);

      if (result.success) {
        setCurrentStatus(status);
        toast.success(
          `You've marked yourself as ${status === 'accepted' ? 'going' : status === 'declined' ? "can't go" : 'maybe'}`
        );
        onRespond?.();
      } else {
        toast.error(result.error || 'Failed to update RSVP');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsResponding(false);
    }
  };

  // Check if RSVP deadline has passed
  const deadlinePassed = event.rsvpDeadline ? new Date(event.rsvpDeadline) < new Date() : false;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4 shadow-sm hover:shadow-md transition-all">
      {/* Header */}
      <div className="flex items-start gap-4">
        {/* Event Type Icon */}
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors.bg} ${colors.border} border-2 flex-shrink-0`}
        >
          <Calendar className={`w-6 h-6 ${colors.text}`} />
        </div>

        {/* Event Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-900 truncate">{event.eventTitle}</h4>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1 flex-wrap">
            <Clock className="w-3 h-3" />
            {formatEventDateTime(event)}
          </p>
          {event.location && (
            <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" />
              {event.location}
            </p>
          )}
        </div>

        {/* Event Type Badge */}
        <span
          className={`px-2.5 py-1 text-xs font-medium rounded-full ${colors.bg} ${colors.text} capitalize`}
        >
          {event.eventType}
        </span>
      </div>

      {/* Description */}
      {event.description && (
        <div className="p-3 bg-slate-50 rounded-lg">
          <p className="text-sm text-slate-600 line-clamp-2">{event.description}</p>
        </div>
      )}

      {/* RSVP Deadline Warning */}
      {event.rsvpDeadline && !deadlinePassed && (
        <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700">
            <Clock className="w-3 h-3 inline mr-1" />
            Please respond by{' '}
            {new Date(event.rsvpDeadline).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
      )}

      {/* Deadline Passed Warning */}
      {deadlinePassed && currentStatus === 'pending' && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-700">
            <AlertTriangle className="w-3 h-3 inline mr-1" />
            RSVP deadline has passed
          </p>
        </div>
      )}

      {/* RSVP Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => handleRespond('accepted')}
          disabled={isResponding || deadlinePassed}
          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all ${
            currentStatus === 'accepted'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Check className="w-4 h-4" />
          Going
        </button>

        <button
          onClick={() => handleRespond('tentative')}
          disabled={isResponding || deadlinePassed}
          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all ${
            currentStatus === 'tentative'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <HelpCircle className="w-4 h-4" />
          Maybe
        </button>

        <button
          onClick={() => handleRespond('declined')}
          disabled={isResponding || deadlinePassed}
          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all ${
            currentStatus === 'declined'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <X className="w-4 h-4" />
          Can't Go
        </button>
      </div>

      {/* Current Status Indicator */}
      {currentStatus !== 'pending' && (
        <div className="text-center">
          <p className="text-xs text-slate-500">
            You responded:{' '}
            <span className="font-medium text-slate-700">
              {currentStatus === 'accepted' && 'Going'}
              {currentStatus === 'declined' && "Can't Go"}
              {currentStatus === 'tentative' && 'Maybe'}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
