'use client';

import { AlertTriangle, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================================================
// TYPES
// ============================================================================

interface Conflict {
  userId: string;
  userName: string;
  playerId?: string;
  avatarUrl?: string | null;
  conflictingEvents: Array<{
    title: string;
    start: string;
    end: string;
  }>;
}

interface SuggestedTime {
  start: Date;
  end: Date;
}

interface ConflictWarningProps {
  conflicts: Conflict[];
  suggestions: SuggestedTime[];
  onSelectTime: (time: SuggestedTime) => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatSuggestedTime(slot: SuggestedTime): string {
  const sameDay = slot.start.toDateString() === slot.end.toDateString();

  if (sameDay) {
    const dayName = slot.start.toLocaleDateString('en-US', { weekday: 'short' });
    const date = slot.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const startTime = slot.start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const endTime = slot.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    return `${dayName}, ${date} • ${startTime} - ${endTime}`;
  }

  return `${slot.start.toLocaleDateString()} ${slot.start.toLocaleTimeString()} - ${slot.end.toLocaleDateString()} ${slot.end.toLocaleTimeString()}`;
}

function formatConflictTime(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endTime = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${startTime} - ${endTime}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ConflictWarning({
  conflicts,
  suggestions,
  onSelectTime,
}: ConflictWarningProps) {
  if (conflicts.length === 0) {
    return null;
  }
  const uniqueUsers = new Set(conflicts.map(c => c.userId)).size;

  return (
    <div className="border-l-4 border-amber-500 bg-amber-50 p-4 rounded-r-xl backdrop-blur-sm">
      <div className="flex items-start gap-3">
        {/* Warning Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3 flex-1">
          {/* Header */}
          <div>
            <h4 className="font-medium text-amber-900 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Scheduling Conflict Detected
            </h4>
            <p className="text-sm text-amber-700 mt-1">
              {uniqueUsers === 1 ? '1 player has' : `${uniqueUsers} players have`} a conflict at
              this time
            </p>
          </div>

          {/* Conflict Details */}
          <div className="space-y-2">
            {conflicts.slice(0, 3).map((conflict, i) => (
              <div key={i} className="space-y-1">
                <p className="text-sm font-medium text-amber-900">{conflict.userName}</p>
                {conflict.conflictingEvents.map((event, j) => (
                  <div
                    key={j}
                    className="flex items-start gap-2 text-sm bg-cream-100/60 rounded-lg p-2 border border-amber-200"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <Clock className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-amber-900">
                        <span className="italic">{event.title}</span>
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        {formatConflictTime(event.start, event.end)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Show count if more conflicts */}
            {conflicts.length > 3 && (
              <p className="text-xs text-amber-600 pl-6">
                + {conflicts.length - 3} more player{conflicts.length - 3 > 1 ? 's' : ''} with conflicts
              </p>
            )}
          </div>

          {/* Suggested Times */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Suggested alternative times:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestions.map((time, i) => (
                  <Button variant="ghost"
                    key={i}
                    onClick={() => onSelectTime(time)}
                    className="px-3 py-2 bg-cream-50 hover:bg-amber-50 text-left rounded-lg text-sm border border-amber-200 hover:border-amber-400 transition-all shadow-sm hover:shadow group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-warm-700 group-hover:text-amber-900 font-medium">
                        {formatSuggestedTime(time)}
                      </span>
                      <span className="text-xs text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        Select →
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* No suggestions available */}
          {suggestions.length === 0 && (
            <div className="p-3 bg-cream-100/60 rounded-lg border border-amber-200">
              <p className="text-sm text-amber-700">
                No alternative times available this week. Please choose a different date or remove
                conflicting attendees.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
