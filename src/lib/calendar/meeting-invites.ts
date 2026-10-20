/**
 * Server half of the meeting rule (`meeting-visibility.ts`): read which of a set
 * of meetings a player is invited to, and drop the rest from a player's list.
 *
 * Every Fairway reader that hands a player team events with their titles runs
 * its rows through `filterMeetingsForPlayer` (calendar page, player Home, the
 * player hub, the calendar events API, the iCal feed, busy periods). A coach's
 * read skips it, so coach paths are unchanged.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { hideUninvitedMeetings, isMeetingEvent } from '@/lib/calendar/meeting-visibility';

export interface MeetingInviteReadContext {
  /** `logServerError` action, e.g. 'golf.calendarPage.meetingInvites'. */
  action: string;
  featureArea?: string;
}

/**
 * The meeting ids, among `meetingIds`, that this player has their own
 * attendance row on. `null` when the read failed (logged): the caller then
 * shows no meeting at all.
 *
 * A player reads their own attendance rows before and after migration
 * 20261017102000, and `player_id` is filtered here, so a teammate's row never
 * counts as theirs. Works with the admin client too (the iCal feed), where the
 * `player_id` filter is the only scoping.
 */
export async function loadInvitedMeetingIds(
  supabase: SupabaseClient,
  playerId: string,
  meetingIds: readonly string[],
  context: MeetingInviteReadContext,
): Promise<Set<string> | null> {
  const invited = new Set<string>();
  for (const chunk of chunkIds([...new Set(meetingIds)])) {
    // One row per (event, player) at most, so a chunk of 200 ids is well under the row cap.
    const { data, error } = await supabase
      .from('golf_event_attendance')
      .select('event_id, player_id')
      .eq('player_id', playerId)
      .in('event_id', chunk)
      .limit(1000);
    if (error) {
      await logServerError(
        `[meetings] invite read failed for player ${playerId}; every meeting is hidden from them: ${describeError(error)}`,
        { action: context.action, featureArea: context.featureArea ?? 'calendar', playerId },
        'warning',
      );
      return null;
    }
    for (const row of (data ?? []) as Array<{ event_id: string; player_id: string }>) {
      if (row.player_id === playerId) invited.add(row.event_id);
    }
  }
  return invited;
}

/**
 * A player's view of `events`: every non-meeting event, plus the meetings they
 * are invited to. No meeting survives a failed invite read, and none survives
 * when there is no player id (a viewer who is neither coach nor player).
 */
export async function filterMeetingsForPlayer<T extends { id: string; event_type?: string | null }>(
  supabase: SupabaseClient,
  events: readonly T[],
  playerId: string | null | undefined,
  context: MeetingInviteReadContext,
): Promise<T[]> {
  const meetingIds = events.filter(isMeetingEvent).map((event) => event.id);
  if (meetingIds.length === 0) return [...events];
  const invited = playerId ? await loadInvitedMeetingIds(supabase, playerId, meetingIds, context) : null;
  return hideUninvitedMeetings(events, invited);
}
