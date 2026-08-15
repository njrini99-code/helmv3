/**
 * Conflict Detection Utilities
 *
 * Detects scheduling conflicts when creating/editing events
 * and suggests alternative available times (like Outlook/Google Calendar)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import {
  getUserBusyPeriodsWithStatus,
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
  /**
   * A read this answer depends on FAILED, so "no conflict" is not a finding —
   * it is the absence of one. The UI must say the check could not run rather
   * than showing an all-clear.
   *
   * This is the shortest path to a false all-clear in the whole scheduler: the
   * attendee read below returned early with `hasConflict: false` before
   * availability.ts was ever entered, so ONE failed query told a coach that
   * EVERY attendee was free.
   */
  partial?: boolean;
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
  const { data: players, error: playersError } = await supabase
    .from('golf_players')
    .select('id, user_id, first_name, last_name, avatar_url')
    .in('id', attendeePlayerIds);

  if (playersError) {
    await logServerError(
      `[conflicts] attendee read failed; the conflict check could not run: ${describeError(playersError)}`,
      { action: 'calendar.checkEventConflicts', featureArea: 'calendar' },
      'warning',
    );
    return { hasConflict: false, conflicts: [], suggestedTimes: [], partial: true };
  }

  // A genuinely empty attendee list is a real answer: nobody to conflict with.
  if (!players || players.length === 0) {
    return {
      hasConflict: false,
      conflicts: [],
      suggestedTimes: [],
    };
  }

  let partial = false;

  const userIds = players.map(p => p.user_id).filter(Boolean) as string[];

  // Check each user for conflicts
  for (const player of players) {
    if (!player.user_id) continue;

    const { periods: busyPeriods, partial: playerPartial } = await getUserBusyPeriodsWithStatus(
      player.user_id,
      proposedStart,
      proposedEnd,
      supabase
    );
    if (playerPartial) partial = true;

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
    // Only ever true when a read failed. A clean run omits it, so existing
    // callers that never look at it behave exactly as before.
    ...(partial ? { partial: true } : {}),
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

/*
 * `formatSuggestedTime` was exported from here and had zero callers (removed
 * 2026-08-15). `ConflictWarning.tsx` — the only surface that renders suggested
 * times — carries its own private, functionally-equivalent copy and always has.
 *
 * The rest of this module is live: `checkEventConflicts` is reached from the
 * event editor via `checkScheduleConflicts` (`src/app/golf/actions/golf.ts`,
 * dynamic `await import` at :4363), and it calls `findCommonAvailability` twice.
 */

