/**
 * Conflict Detection Utilities
 *
 * Detects scheduling conflicts when creating/editing events
 * and suggests alternative available times (like Outlook/Google Calendar)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getUserBusyPeriods,
  findCommonAvailability,
  periodsOverlap,
  getStartOfWeek,
  getEndOfWeek,
  TimeSlot,
} from './availability';

// ============================================================================
// TYPES
// ============================================================================

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: Array<{
    userId: string;
    userName: string;
    playerId?: string;
    avatarUrl?: string | null;
    conflictingEvent: {
      title: string;
      start: Date;
      end: Date;
      type: 'event' | 'class' | 'blocked';
    };
  }>;
  suggestedTimes: Array<{ start: Date; end: Date }>;
}

interface ConflictCheckOptions {
  /** When editing an event, exclude it from conflict detection */
  excludeEventId?: string;
  /** Number of suggested alternative times to return */
  maxSuggestions?: number;
  /** Working hours for suggestions (default: 7 AM - 7 PM) */
  workingHours?: { start: number; end: number };
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Check if a proposed event time conflicts with any attendee's schedule
 * Returns conflicts AND suggested alternative times
 */
export async function checkEventConflicts(
  proposedStart: Date,
  proposedEnd: Date,
  attendeePlayerIds: string[], // golf_players.id
  supabase: SupabaseClient,
  options: ConflictCheckOptions = {}
): Promise<ConflictResult> {
  const {
    excludeEventId,
    maxSuggestions = 5,
    workingHours = { start: 7, end: 19 },
  } = options;

  const conflicts: ConflictResult['conflicts'] = [];

  // Get player details and user IDs
  const { data: players } = await supabase
    .from('golf_players')
    .select('id, user_id, first_name, last_name, avatar_url')
    .in('id', attendeePlayerIds);

  if (!players || players.length === 0) {
    return {
      hasConflict: false,
      conflicts: [],
      suggestedTimes: [],
    };
  }

  const userIds = players.map(p => p.user_id).filter(Boolean) as string[];

  // Check each user for conflicts
  for (const player of players) {
    if (!player.user_id) continue;

    const busyPeriods = await getUserBusyPeriods(
      player.user_id,
      proposedStart,
      proposedEnd,
      supabase
    );

    // Filter out the event being edited
    const relevantPeriods = busyPeriods.filter(p => p.eventId !== excludeEventId);

    // Find conflicts
    for (const period of relevantPeriods) {
      if (periodsOverlap({ start: proposedStart, end: proposedEnd }, period)) {
        conflicts.push({
          userId: player.user_id,
          userName: `${player.first_name} ${player.last_name}`,
          playerId: player.id,
          avatarUrl: player.avatar_url,
          conflictingEvent: {
            title: period.title || 'Busy',
            start: period.start,
            end: period.end,
            type: period.type,
          },
        });
        break; // Only report first conflict per user
      }
    }
  }

  // If conflicts exist, suggest alternative times
  let suggestedTimes: TimeSlot[] = [];

  if (conflicts.length > 0 && userIds.length > 0) {
    const duration = (proposedEnd.getTime() - proposedStart.getTime()) / (1000 * 60); // minutes

    // Look within the same week for alternatives
    const weekStart = getStartOfWeek(proposedStart);
    const weekEnd = getEndOfWeek(proposedStart);

    const availableSlots = await findCommonAvailability(
      userIds,
      { start: weekStart, end: weekEnd },
      duration,
      workingHours,
      supabase
    );

    // Filter out the proposed time itself and limit results
    suggestedTimes = availableSlots
      .filter(slot => !isSameTimeSlot(slot, { start: proposedStart, end: proposedEnd }))
      .slice(0, maxSuggestions);

    // If no suggestions in same week, try next week
    if (suggestedTimes.length === 0) {
      const nextWeekStart = new Date(weekEnd);
      nextWeekStart.setDate(nextWeekStart.getDate() + 1);
      const nextWeekEnd = getEndOfWeek(nextWeekStart);

      const nextWeekSlots = await findCommonAvailability(
        userIds,
        { start: nextWeekStart, end: nextWeekEnd },
        duration,
        workingHours,
        supabase
      );

      suggestedTimes = nextWeekSlots.slice(0, maxSuggestions);
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    suggestedTimes,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if two time slots represent the same time
 */
function isSameTimeSlot(a: TimeSlot, b: TimeSlot): boolean {
  return (
    a.start.getTime() === b.start.getTime() &&
    a.end.getTime() === b.end.getTime()
  );
}

/**
 * Format suggested time for display
 */
export function formatSuggestedTime(slot: TimeSlot): string {
  const sameDay = slot.start.toDateString() === slot.end.toDateString();

  if (sameDay) {
    const dayName = slot.start.toLocaleDateString('en-US', { weekday: 'short' });
    const date = slot.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const startTime = slot.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTime = slot.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    return `${dayName}, ${date} • ${startTime} - ${endTime}`;
  }

  return `${slot.start.toLocaleDateString()} ${slot.start.toLocaleTimeString()} - ${slot.end.toLocaleDateString()} ${slot.end.toLocaleTimeString()}`;
}

