'use client';

import { useState } from 'react';
import { Plus, Clock } from 'lucide-react';
import { TeamMember } from './CalendarAvatarSidebar';

// ============================================================================
// TYPES
// ============================================================================

export interface BusyPeriod {
  start: string; // ISO string
  end: string; // ISO string
  type: 'event' | 'class' | 'blocked';
  title?: string;
  eventId?: string;
  ownerId?: string;
  ownerType?: 'coach' | 'player';
}

interface AvailabilityDayViewProps {
  date: Date;
  coachBusyPeriods: BusyPeriod[]; // Coach's blocked time
  playerBusyPeriods: BusyPeriod[]; // Selected player's blocked time
  selectedPlayer: TeamMember | null;
  onTimeSlotClick: (date: Date, hour: number) => void; // Quick event creation
}

// ============================================================================
// COLOR CODING SYSTEM
// ============================================================================

const EVENT_COLORS = {
  // Team events (coach-created)
  practice: { bg: 'bg-primary-500/20', border: 'border-primary-500', text: 'text-primary-700' },
  tournament: { bg: 'bg-amber-500/20', border: 'border-amber-500', text: 'text-amber-700' },
  qualifier: { bg: 'bg-primary-500/20', border: 'border-primary-500', text: 'text-primary-700' },
  meeting: { bg: 'bg-warm-500/20', border: 'border-warm-500', text: 'text-warm-700' },
  travel: { bg: 'bg-warm-500/20', border: 'border-warm-500', text: 'text-warm-700' },
  other: { bg: 'bg-warm-500/20', border: 'border-warm-500', text: 'text-warm-700' },

  // Coach-specific
  blocked: { bg: 'bg-orange-500/10', border: 'border-orange-400', text: 'text-orange-700' },

  // Player-specific
  class: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-300',
    text: 'text-rose-600',
    pattern: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(244, 63, 94, 0.05) 10px, rgba(244, 63, 94, 0.05) 20px)',
  },
  playerEvent: { bg: 'bg-primary-500/20', border: 'border-primary-500', text: 'text-primary-700' },

  // Availability states
  free: { bg: 'bg-primary-50', border: 'border-primary-200', text: 'text-primary-700' },
  busy: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-600' },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function AvailabilityDayView({
  date,
  coachBusyPeriods,
  playerBusyPeriods,
  selectedPlayer,
  onTimeSlotClick,
}: AvailabilityDayViewProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  // Working hours: 7 AM to 7 PM
  const startHour = 7;
  const endHour = 19;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  /**
   * Check if a specific hour is free for both coach and player
   */
  const isBothFree = (hour: number): boolean => {
    const hourStart = new Date(date);
    hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(date);
    hourEnd.setHours(hour + 1, 0, 0, 0);

    const isCoachBusy = coachBusyPeriods.some(period => {
      const start = new Date(period.start);
      const end = new Date(period.end);
      return start < hourEnd && end > hourStart;
    });

    const isPlayerBusy = playerBusyPeriods.some(period => {
      const start = new Date(period.start);
      const end = new Date(period.end);
      return start < hourEnd && end > hourStart;
    });

    return !isCoachBusy && !isPlayerBusy;
  };

  /**
   * Get busy periods that overlap with a specific hour
   */
  const getBusyPeriodsForHour = (hour: number): { coach: BusyPeriod[]; player: BusyPeriod[] } => {
    const hourStart = new Date(date);
    hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(date);
    hourEnd.setHours(hour + 1, 0, 0, 0);

    const coach = coachBusyPeriods.filter(period => {
      const start = new Date(period.start);
      const end = new Date(period.end);
      return start < hourEnd && end > hourStart;
    });

    const player = playerBusyPeriods.filter(period => {
      const start = new Date(period.start);
      const end = new Date(period.end);
      return start < hourEnd && end > hourStart;
    });

    return { coach, player };
  };

  /**
   * Format hour for display
   */
  const formatHour = (hour: number): string => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour} ${period}`;
  };

  /**
   * Format time range for busy period
   */
  const formatTimeRange = (period: BusyPeriod): string => {
    const start = new Date(period.start);
    const end = new Date(period.end);
    return `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  };

  return (
    <div className="bg-white rounded-2xl border border-warm-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-warm-200 bg-warm-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-warm-900">
              Availability: {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            {selectedPlayer && (
              <p className="text-sm text-warm-500 mt-1">
                Viewing schedule for <span className="font-medium text-warm-700">{selectedPlayer.first_name} {selectedPlayer.last_name}</span>
              </p>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-primary-500"></div>
              <span className="text-warm-600">Your Event</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-orange-500"></div>
              <span className="text-warm-600">Your Class</span>
            </div>
            {selectedPlayer && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-rose-400" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(244, 63, 94, 0.2) 2px, rgba(244, 63, 94, 0.2) 4px)' }}></div>
                  <span className="text-warm-600">{selectedPlayer.first_name}&apos;s Class</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-primary-500"></div>
                  <span className="text-warm-600">{selectedPlayer.first_name}&apos;s Event</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-primary-100 border border-primary-300"></div>
                  <span className="text-warm-600">Both Free</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Time Grid */}
      <div className="divide-y divide-warm-200">
        {hours.map(hour => {
          const busyPeriods = getBusyPeriodsForHour(hour);
          const bothFree = selectedPlayer && isBothFree(hour);
          const isHovered = hoveredHour === hour;

          return (
            <div
              key={hour}
              className="flex items-stretch transition-colors duration-150"
              style={{ minHeight: '80px' }}
              onMouseEnter={() => setHoveredHour(hour)}
              onMouseLeave={() => setHoveredHour(null)}
            >
              {/* Hour Label */}
              <div className="flex items-center justify-center w-24 py-4 px-4 bg-warm-50 border-r border-warm-200">
                <div className="text-center">
                  <p className="text-sm font-semibold text-warm-700">{formatHour(hour)}</p>
                  <Clock className="w-3 h-3 text-warm-400 mx-auto mt-1" />
                </div>
              </div>

              {/* Time Slot Content */}
              <div className="flex-1 p-3 relative">
                {/* Free slot indicator */}
                {bothFree && (
                  <div className="absolute inset-0 bg-primary-50/50 border-l-2 border-primary-400">
                    <div className="flex items-center justify-between h-full px-4">
                      <span className="text-sm font-medium text-primary-700">
                        ✓ Both available
                      </span>
                      {isHovered && (
                        <button
                          onClick={() => onTimeSlotClick(date, hour)}
                          className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg flex items-center gap-1 shadow-sm transition-all"
                        >
                          <Plus className="w-4 h-4" />
                          Quick Add
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Your busy periods (current user) */}
                {busyPeriods.coach.map((period, index) => {
                  const isClass = period.type === 'class';
                  const isBlocked = period.type === 'blocked';
                  return (
                    <div
                      key={`you-${index}`}
                      className={`mb-2 p-3 rounded-lg border-l-3 backdrop-blur-sm ${
                        isClass
                          ? 'bg-orange-500/10 border-orange-400'
                          : isBlocked
                            ? 'bg-orange-500/10 border-orange-400'
                            : 'bg-primary-500/10 border-primary-500'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded ${
                                isClass || isBlocked
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-primary-600 text-white'
                              }`}
                            >
                              {isClass ? 'Your Class' : isBlocked ? 'Blocked' : 'You'}
                            </span>
                            <span
                              className={`text-sm font-medium ${
                                isClass || isBlocked ? 'text-orange-900' : 'text-primary-900'
                              }`}
                            >
                              {period.title || 'Busy'}
                            </span>
                          </div>
                          <p className="text-xs text-warm-500 mt-1">{formatTimeRange(period)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Player busy periods */}
                {busyPeriods.player.map((period, index) => {
                  const isClass = period.type === 'class';
                  return (
                    <div
                      key={`player-${index}`}
                      className={`mb-2 p-3 rounded-lg border-l-3 backdrop-blur-sm ${
                        isClass
                          ? 'bg-rose-500/5 border-rose-400'
                          : 'bg-primary-500/10 border-primary-500'
                      }`}
                      style={isClass ? { backgroundImage: EVENT_COLORS.class.pattern } : undefined}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded ${
                                isClass ? 'bg-rose-500 text-white' : 'bg-primary-600 text-white'
                              }`}
                            >
                              {isClass ? 'Class' : 'Player Event'}
                            </span>
                            <span className={`text-sm font-medium ${isClass ? 'text-rose-900' : 'text-primary-900'}`}>
                              {period.title || 'Busy'}
                            </span>
                          </div>
                          <p className="text-xs text-warm-500 mt-1">{formatTimeRange(period)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Empty state */}
                {busyPeriods.coach.length === 0 && busyPeriods.player.length === 0 && !bothFree && (
                  <div className="flex items-center justify-center h-full text-warm-400">
                    <span className="text-sm">No scheduled events</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
