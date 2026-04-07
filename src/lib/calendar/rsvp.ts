/**
 * RSVP Management Utilities
 *
 * Handles event invitations, RSVP tracking, and notifications
 * for the GolfHelm calendar system
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GolfCoach, GolfEvent, GolfEventAttendance, GolfPlayer } from '@/lib/types/golf';
import { createAdminClient } from '@/lib/supabase/admin';

// ============================================================================
// TYPES
// ============================================================================

export type RSVPStatus = 'pending' | 'accepted' | 'declined' | 'tentative';

export interface RSVPSummary {
  total: number;
  accepted: number;
  declined: number;
  tentative: number;
  pending: number;
  attendees: Array<{
    playerId: string;
    playerName: string;
    avatarUrl: string | null;
    status: RSVPStatus;
    respondedAt: string | null;
  }>;
}

export interface EventInvitation {
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
  createdBy: string | null;
  status: RSVPStatus;
}

type AttendanceWithPlayer = GolfEventAttendance & {
  player: Pick<GolfPlayer, 'id' | 'first_name' | 'last_name' | 'avatar_url'> | null;
};

type AttendanceWithUser = {
  player: Pick<GolfPlayer, 'user_id'> | Array<Pick<GolfPlayer, 'user_id'>> | null;
};

type AttendanceWithEvent = Pick<GolfEventAttendance, 'status' | 'rsvp_at'> & {
  event: GolfEvent | GolfEvent[] | null;
};

type EventWithCreator = GolfEvent & {
  creator: Pick<GolfCoach, 'user_id'> | null;
};

type ReminderAttendance = Pick<GolfEventAttendance, 'player_id'> & {
  player: Pick<GolfPlayer, 'user_id' | 'first_name'> | Array<Pick<GolfPlayer, 'user_id' | 'first_name'>> | null;
};

type EventDateInput = Pick<GolfEvent, 'start_time'>;
type MaybeArray<T> = T | T[] | null | undefined;

function firstOrNull<T>(value: MaybeArray<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

// ============================================================================
// RSVP SUMMARY
// ============================================================================

/**
 * Get RSVP summary for an event
 * Shows attendance status breakdown and attendee list
 */
async function getEventRSVPSummary(
  eventId: string,
  supabase: SupabaseClient
): Promise<RSVPSummary> {
  const { data: attendances } = await supabase
    .from('golf_event_attendance')
    .select(`
      *,
      player:golf_players(id, first_name, last_name, avatar_url)
    `)
    .eq('event_id', eventId);

  const attendanceRows = (attendances || []) as AttendanceWithPlayer[];
  const attendees = attendanceRows.map(attendance => {
    const firstName = attendance.player?.first_name ?? '';
    const lastName = attendance.player?.last_name ?? '';
    const fullName = `${firstName} ${lastName}`.trim();

    return {
      playerId: attendance.player_id,
      playerName: fullName || 'Unknown',
      avatarUrl: attendance.player?.avatar_url || null,
      status: (attendance.status ?? 'pending') as RSVPStatus,
      respondedAt: attendance.rsvp_at,
    };
  });

  return {
    total: attendees.length,
    accepted: attendees.filter(a => a.status === 'accepted').length,
    declined: attendees.filter(a => a.status === 'declined').length,
    tentative: attendees.filter(a => a.status === 'tentative').length,
    pending: attendees.filter(a => a.status === 'pending').length,
    attendees,
  };
}

/**
 * Get RSVP summary with percentage calculations
 * Useful for displaying attendance rates
 */
export async function getEventRSVPStats(
  eventId: string,
  supabase: SupabaseClient
): Promise<{
  summary: RSVPSummary;
  acceptanceRate: number;
  responseRate: number;
}> {
  const summary = await getEventRSVPSummary(eventId, supabase);

  const responseRate = summary.total > 0
    ? ((summary.total - summary.pending) / summary.total) * 100
    : 0;

  const acceptanceRate = summary.total > 0
    ? (summary.accepted / summary.total) * 100
    : 0;

  return {
    summary,
    acceptanceRate: Math.round(acceptanceRate),
    responseRate: Math.round(responseRate),
  };
}

// ============================================================================
// INVITATIONS
// ============================================================================

/**
 * Send invitations to players for an event
 * Creates attendance records and notifications
 */
export async function sendEventInvitations(
  eventId: string,
  playerIds: string[],
  supabase: SupabaseClient
): Promise<void> {
  if (playerIds.length === 0) return;

  // Get event details
  const { data: event } = await supabase
    .from('golf_events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  // Get player details (including user_id for notifications)
  const { data: players } = await supabase
    .from('golf_players')
    .select('id, user_id, first_name, last_name')
    .in('id', playerIds);

  if (!players || players.length === 0) return;

  // Create attendance records (pending status)
  const attendanceRecords = players.map(player => ({
    event_id: eventId,
    player_id: player.id,
    status: 'pending' as RSVPStatus,
    notified_at: new Date().toISOString(),
  }));

  await supabase
    .from('golf_event_attendance')
    .upsert(attendanceRecords, { onConflict: 'event_id,player_id' });

  // Create notifications for each player
  const notifications = players
    .filter(p => p.user_id)
    .map(player => ({
      user_id: player.user_id!,
      event_id: eventId,
      notification_type: 'event_invitation',
      title: `You're invited: ${event.title}`,
      message: `${formatEventDate(event)} ${event.location ? `at ${event.location}` : ''}`.trim(),
      action_url: `/golf/dashboard/calendar?event=${eventId}`,
    }));

  if (notifications.length > 0) {
    // Use admin client to bypass RLS — inserting notifications for other users
    const adminClient = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: notifError } = await (adminClient as any)
      .from('golf_calendar_notifications')
      .upsert(notifications, { onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: true });

    if (notifError) {
      console.error('[sendEventInvitations] Failed to insert notifications:', notifError.message);
    }
  }
}

/**
 * Update invitations when event details change
 * Notifies attendees of the update
 */
export async function notifyEventUpdate(
  eventId: string,
  supabase: SupabaseClient,
  changes?: string
): Promise<void> {
  // Get event details
  const { data: event } = await supabase
    .from('golf_events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (!event) return;

  // Get all attendees
  const { data: attendances } = await supabase
    .from('golf_event_attendance')
    .select('player:golf_players(user_id)')
    .eq('event_id', eventId);

  if (!attendances || attendances.length === 0) return;

  // Create update notifications
  const attendanceRows = (attendances || []) as unknown as AttendanceWithUser[];
  const userIds = attendanceRows
    .map(attendance => firstOrNull(attendance.player)?.user_id)
    .filter((userId): userId is string => Boolean(userId));

  if (userIds.length === 0) return;

  const notifications = userIds.map(userId => ({
    user_id: userId,
    event_id: eventId,
    notification_type: 'event_updated',
    title: `Event updated: ${event.title}`,
    message: changes || `${formatEventDate(event)} ${event.location ? `at ${event.location}` : ''}`.trim(),
    action_url: `/golf/dashboard/calendar?event=${eventId}`,
  }));

  // Use admin client to bypass RLS — inserting notifications for other users
  const adminClient = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: notifError } = await (adminClient as any)
    .from('golf_calendar_notifications')
    .upsert(notifications, { onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: true });

  if (notifError) {
    console.error('[notifyEventUpdate] Failed to insert notifications:', notifError.message);
  }
}

/**
 * Cancel an event and notify all attendees
 */
async function cancelEventAndNotify(
  eventId: string,
  supabase: SupabaseClient,
  reason?: string
): Promise<void> {
  // Get event details
  const { data: event } = await supabase
    .from('golf_events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (!event) throw new Error('Event not found');

  // Get all attendees
  const { data: attendances } = await supabase
    .from('golf_event_attendance')
    .select('player:golf_players(user_id)')
    .eq('event_id', eventId);

  if (attendances && attendances.length > 0) {
    const attendanceRows = (attendances || []) as unknown as AttendanceWithUser[];
    const userIds = attendanceRows
      .map(attendance => firstOrNull(attendance.player)?.user_id)
      .filter((userId): userId is string => Boolean(userId));

    if (userIds.length > 0) {
      // Create cancellation notifications
      const notifications = userIds.map(userId => ({
        user_id: userId,
        event_id: eventId,
        notification_type: 'event_cancelled',
        title: `Event cancelled: ${event.title}`,
        message: reason || `${formatEventDate(event)} has been cancelled`,
        action_url: `/golf/dashboard/calendar`,
      }));

      // Use admin client to bypass RLS — inserting notifications for other users
      const adminClient = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: notifError } = await (adminClient as any)
        .from('golf_calendar_notifications')
        .upsert(notifications, { onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: true });

      if (notifError) {
        console.error('[cancelEventAndNotify] Failed to insert notifications:', notifError.message);
      }
    }
  }

  // Delete the event (cascade will remove attendances)
  await supabase
    .from('golf_events')
    .delete()
    .eq('id', eventId);
}

// ============================================================================
// RSVP RESPONSES
// ============================================================================

/**
 * Update a player's RSVP status
 * Notifies event creator of the response
 */
export async function updateRSVP(
  eventId: string,
  playerId: string,
  status: RSVPStatus,
  supabase: SupabaseClient
): Promise<void> {
  // Upsert attendance record so players can respond even if no invite exists yet
  await supabase
    .from('golf_event_attendance')
    .upsert(
      {
        event_id: eventId,
        player_id: playerId,
        status,
        rsvp_at: new Date().toISOString(),
      },
      { onConflict: 'event_id,player_id' }
    );

  // Get event and player details for notification
  const { data: eventData } = await supabase
    .from('golf_events')
    .select(`
      *,
      creator:golf_coaches(user_id)
    `)
    .eq('id', eventId)
    .single();
  const event = eventData as EventWithCreator | null;

  const { data: player } = await supabase
    .from('golf_players')
    .select('first_name, last_name')
    .eq('id', playerId)
    .single();

  // Notify event creator (if it's a coach)
  if (event?.created_by && event.creator?.user_id) {
    const statusText = status === 'accepted' ? 'accepted' :
                      status === 'declined' ? 'declined' :
                      status === 'tentative' ? 'marked as tentative for' : 'updated';

    // Use admin client to bypass RLS — inserting notification for another user
    const adminClient = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: notifError } = await (adminClient as any)
      .from('golf_calendar_notifications')
      .upsert({
        user_id: event.creator.user_id,
        event_id: eventId,
        notification_type: 'rsvp_response',
        title: `${player?.first_name} ${statusText}`,
        message: `${player?.first_name} ${player?.last_name} has ${statusText} "${event.title}"`,
        action_url: `/golf/dashboard/calendar?event=${eventId}`,
      }, { onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: true });

    if (notifError) {
      console.error('[notifyRSVPResponse] Failed to insert notification:', notifError.message);
    }
  }
}

/**
 * Batch update RSVPs for multiple players
 * Useful for "accept all" or "decline all" scenarios
 */
async function batchUpdateRSVPs(
  updates: Array<{ eventId: string; playerId: string; status: RSVPStatus }>,
  supabase: SupabaseClient
): Promise<void> {
  for (const update of updates) {
    await updateRSVP(update.eventId, update.playerId, update.status, supabase);
  }
}

// ============================================================================
// PLAYER INVITATIONS
// ============================================================================

/**
 * Get all pending invitations for a player
 * Used to display invitation list on player dashboard
 */
export async function getPlayerPendingInvitations(
  playerId: string,
  supabase: SupabaseClient
): Promise<EventInvitation[]> {
  const { data: attendances } = await supabase
    .from('golf_event_attendance')
    .select(`
      status,
      rsvp_at,
      event:golf_events(*)
    `)
    .eq('player_id', playerId)
    .eq('status', 'pending')
    .order('event(start_time)', { ascending: true });

  if (!attendances) return [];

  const attendanceRows = (attendances || []) as unknown as AttendanceWithEvent[];
  const invitations: EventInvitation[] = [];
  for (const attendance of attendanceRows) {
    const event = firstOrNull(attendance.event);
    if (!event) continue;
    invitations.push({
      eventId: event.id,
      eventTitle: event.title,
      eventType: event.event_type,
      startDate: event.start_time, // Using start_time as date
      startTime: event.start_time,
      endDate: event.end_time,
      endTime: event.end_time,
      location: event.location,
      description: event.description,
      requiresRsvp: event.requires_rsvp ?? false,
      rsvpDeadline: event.rsvp_deadline ?? null,
      createdBy: event.created_by,
      status: (attendance.status ?? 'pending') as RSVPStatus,
    });
  }
  return invitations;
}

/**
 * Get all upcoming events for a player (any status)
 * Includes events they've RSVP'd to
 */
async function getPlayerUpcomingEvents(
  playerId: string,
  supabase: SupabaseClient
): Promise<EventInvitation[]> {
  const { data: attendances } = await supabase
    .from('golf_event_attendance')
    .select(`
      status,
      rsvp_at,
      event:golf_events(*)
    `)
    .eq('player_id', playerId)
    .gte('event(start_time)', new Date().toISOString())
    .order('event(start_time)', { ascending: true });

  if (!attendances) return [];

  const attendanceRows = (attendances || []) as unknown as AttendanceWithEvent[];
  const invitations: EventInvitation[] = [];
  for (const attendance of attendanceRows) {
    const event = firstOrNull(attendance.event);
    if (!event) continue;
    invitations.push({
      eventId: event.id,
      eventTitle: event.title,
      eventType: event.event_type,
      startDate: event.start_time, // Using start_time as date
      startTime: event.start_time,
      endDate: event.end_time,
      endTime: event.end_time,
      location: event.location,
      description: event.description,
      requiresRsvp: event.requires_rsvp ?? false,
      rsvpDeadline: event.rsvp_deadline ?? null,
      createdBy: event.created_by,
      status: (attendance.status ?? 'pending') as RSVPStatus,
    });
  }
  return invitations;
}

// ============================================================================
// REMINDERS
// ============================================================================

/**
 * Send RSVP reminder to players who haven't responded
 * Typically called by a scheduled job before the deadline
 */
async function sendRSVPReminders(
  eventId: string,
  supabase: SupabaseClient
): Promise<number> {
  // Get event details
  const { data: event } = await supabase
    .from('golf_events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (!event) return 0;

  // Get pending attendances
  const { data: pendingAttendances } = await supabase
    .from('golf_event_attendance')
    .select(`
      player_id,
      player:golf_players(user_id, first_name)
    `)
    .eq('event_id', eventId)
    .eq('status', 'pending');

  if (!pendingAttendances || pendingAttendances.length === 0) return 0;

  // Create reminder notifications
  const attendanceRows = (pendingAttendances || []) as unknown as ReminderAttendance[];
  const notifications = attendanceRows.flatMap(attendance => {
    const userId = firstOrNull(attendance.player)?.user_id;
    if (!userId) return [];
    return [{
      user_id: userId,
      event_id: eventId,
      notification_type: 'rsvp_reminder',
      title: `RSVP reminder: ${event.title}`,
      message: `Please respond to "${event.title}" by ${formatEventDate(event)}`,
      action_url: `/golf/dashboard/calendar?event=${eventId}`,
    }];
  });

  if (notifications.length > 0) {
    // Use admin client to bypass RLS — inserting notifications for other users
    const adminClient = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: notifError } = await (adminClient as any)
      .from('golf_calendar_notifications')
      .upsert(notifications, { onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: true });

    if (notifError) {
      console.error('[sendRSVPReminders] Failed to insert notifications:', notifError.message);
    }
  }

  return notifications.length;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format event date for display in notifications
 */
function formatEventDate(event: EventDateInput): string {
  if (!event.start_time) return 'TBD';

  const startDate = new Date(event.start_time);
  const dateStr = startDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const timeStr = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${dateStr} at ${timeStr}`;
}

/**
 * Check if RSVP deadline has passed
 */
function isRSVPDeadlinePassed(rsvpDeadline: string | null): boolean {
  if (!rsvpDeadline) return false;
  return new Date(rsvpDeadline) < new Date();
}

/**
 * Get RSVP status color for UI
 */
function getRSVPStatusColor(status: RSVPStatus): {
  bg: string;
  text: string;
  border: string;
} {
  switch (status) {
    case 'accepted':
      return {
        bg: 'bg-emerald-100',
        text: 'text-emerald-700',
        border: 'border-emerald-500',
      };
    case 'declined':
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
        border: 'border-red-500',
      };
    case 'tentative':
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        border: 'border-amber-500',
      };
    case 'pending':
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-600',
        border: 'border-slate-300',
      };
  }
}

/**
 * Get RSVP status label
 */
function getRSVPStatusLabel(status: RSVPStatus): string {
  switch (status) {
    case 'accepted':
      return 'Going';
    case 'declined':
      return "Can't Go";
    case 'tentative':
      return 'Maybe';
    case 'pending':
    default:
      return 'Pending';
  }
}
