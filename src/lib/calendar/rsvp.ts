/**
 * RSVP Management Utilities
 *
 * Handles event invitations, RSVP tracking, and notifications
 * for the GolfHelm calendar system
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GolfCoach, GolfEvent, GolfEventAttendance, GolfPlayer } from '@/lib/types/golf';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireWriteSuccess } from './write-integrity';

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
  const { data: event, error: eventError } = await supabase
    .from('golf_events')
    .select('*')
    .eq('id', eventId)
    .single();

  // A failed read is not "no such event". Throwing on both is right — nobody
  // should be invited to an event we could not confirm — but the caller and
  // the log deserve to know which one happened.
  if (eventError && eventError.code !== 'PGRST116') {
    throw new Error(`Could not load the event to send invitations: ${eventError.message}`);
  }
  if (!event) throw new Error('Event not found');

  // ONLY PLAYERS ON THE EVENT'S OWN TEAM MAY BE INVITED.
  //
  // `playerIds` arrived from the caller and was used as-is. Nothing checked it
  // against `event.team_id`, so a program head staffed on both squads — the
  // Shenandoah case exactly — could attach the men's roster to a women's
  // event. RLS does not catch it either: `golf_event_attendance` is gated on
  // the coach's relationship to the EVENT, and that coach really does staff
  // both teams, so the insert is permitted.
  //
  // The result is a men's player holding an RSVP for a women's event, counted
  // in its attendance totals, and notified about a trip they are not on.
  const { data: roster, error: rosterError } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', event.team_id)
    .eq('status', 'active');

  if (rosterError) {
    // Cannot establish who belongs, so invite nobody. Silently inviting the
    // requested list is how the wrong squad gets attached in the first place.
    throw new Error(`Could not verify the event's roster before inviting: ${rosterError.message}`);
  }

  const onTeam = new Set((roster ?? []).map((row) => row.player_id));
  const eligibleIds = playerIds.filter((id) => onTeam.has(id));
  const rejected = playerIds.filter((id) => !onTeam.has(id));

  if (rejected.length > 0) {
    console.warn(
      `[rsvp] refused to invite ${rejected.length} player(s) who are not active members of event ${eventId}'s team (${event.team_id})`,
    );
  }

  if (eligibleIds.length === 0) return;

  // Get player details (including user_id for notifications)
  const { data: players, error: playersError } = await supabase
    .from('golf_players')
    .select('id, user_id, first_name, last_name')
    .in('id', eligibleIds);

  // A failed read here returned silently, so the coach was told the event was
  // created and nobody was invited to it.
  if (playersError) {
    throw new Error(`Could not load players to invite: ${playersError.message}`);
  }

  if (!players || players.length === 0) return;

  // Create attendance records (pending status)
  const attendanceRecords = players.map(player => ({
    event_id: eventId,
    player_id: player.id,
    status: 'pending' as RSVPStatus,
    notified_at: new Date().toISOString(),
  }));

  // 2026-05-17: closes audit Finding 4 (same fix as updateRSVP).
  const inviteResult = await supabase
    .from('golf_event_attendance')
    .upsert(attendanceRecords, { onConflict: 'event_id,player_id' })
    .select('id');
  requireWriteSuccess(inviteResult, 'sendEventInvitations');

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

  // Idempotency key is CONTENT-BEARING (audit finding #18). The unique index
  // is (event_id, user_id, notification_type); a constant 'event_updated'
  // type with ignoreDuplicates meant the FIRST update notification blocked
  // every later one — a 2nd+ reschedule never notified and the surviving row
  // showed the superseded time. Folding the event's CURRENT timing into the
  // type means each distinct reschedule inserts exactly one fresh row
  // (repeat saves of the same time still dedupe) with no delete-then-reinsert.
  const timingKey = `${event.start_time ?? 'tbd'}|${event.end_time ?? ''}`;

  const notifications = userIds.map(userId => ({
    user_id: userId,
    event_id: eventId,
    notification_type: `event_updated:${timingKey}`,
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

// ============================================================================
// RSVP RESPONSES
// ============================================================================

/** Why an RSVP write was rejected — renderable by the UI. */
export type RSVPLockCode = 'deadline_passed' | 'event_started' | 'event_cancelled';

/**
 * Thrown when an RSVP change is locked (audit finding #16: there was no lock
 * after event start — a no-show could flip to "accepted" post-hoc).
 */
export class RSVPLockedError extends Error {
  constructor(public code: RSVPLockCode, message: string) {
    super(message);
    this.name = 'RSVPLockedError';
  }
}

export class RSVPDeadlinePassedError extends RSVPLockedError {
  constructor(public deadline: string) {
    super('deadline_passed', 'RSVP deadline has passed');
    this.name = 'RSVPDeadlinePassedError';
  }
}

export interface UpdateRSVPOptions {
  /**
   * Coaches correcting attendance records may bypass the deadline /
   * post-start / cancelled locks. Player self-RSVP paths must never set this;
   * callers are responsible for verifying the caller actually coaches the
   * event's team before passing it.
   */
  coachOverride?: boolean;
}

/**
 * Update a player's RSVP status.
 *
 * Locks (all skipped under options.coachOverride):
 * - RSVPDeadlinePassedError when rsvp_deadline has passed
 * - RSVPLockedError('event_started') once the event has started (all-day
 *   events lock 24h after their stored UTC-midnight start)
 * - RSVPLockedError('event_cancelled') for soft-cancelled events
 *
 * Server-side enforcement so a stale client tab can't slip a late RSVP in.
 */
export async function updateRSVP(
  eventId: string,
  playerId: string,
  status: RSVPStatus,
  supabase: SupabaseClient,
  options: UpdateRSVPOptions = {}
): Promise<void> {
  // Fetch event up front: we need it for lock enforcement and creator
  // notification, so paying the round-trip once keeps things cheap.
  const { data: eventData } = await supabase
    .from('golf_events')
    .select(`
      *,
      creator:golf_coaches(user_id)
    `)
    .eq('id', eventId)
    .single();
  const event = eventData as EventWithCreator | null;

  // Previously a missing/RLS-invisible event silently skipped enforcement and
  // upserted anyway. Locks can't be enforced against a row we can't see.
  if (!event) {
    throw new Error('Event not found');
  }

  if (!options.coachOverride) {
    if (event.status === 'cancelled') {
      throw new RSVPLockedError('event_cancelled', 'This event has been cancelled');
    }

    // Lock after the event starts. All-day events store start_time as
    // UTC midnight, so they get a 24h grace window covering the whole day.
    const startMs = event.start_time ? new Date(event.start_time).getTime() : null;
    if (startMs !== null && Number.isFinite(startMs)) {
      const lockMs = event.all_day ? startMs + 24 * 60 * 60 * 1000 : startMs;
      if (lockMs <= Date.now()) {
        throw new RSVPLockedError('event_started', 'This event has already started');
      }
    }

    if (event.rsvp_deadline && new Date(event.rsvp_deadline).getTime() < Date.now()) {
      throw new RSVPDeadlinePassedError(event.rsvp_deadline);
    }
  }

  // 2026-05-17: closes audit Finding 4. Previously this upsert discarded
  // its `{ data, error }` return — RLS denials and constraint violations
  // returned `success: true` to the user with zero rows persisted. Now we
  // .select('id') so the helper can verify a row actually changed, and
  // throw WriteIntegrityError if not.
  const upsertResult = await supabase
    .from('golf_event_attendance')
    .upsert(
      {
        event_id: eventId,
        player_id: playerId,
        status,
        rsvp_at: new Date().toISOString(),
      },
      { onConflict: 'event_id,player_id' }
    )
    .select('id');
  requireWriteSuccess(upsertResult, 'updateRSVP');

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

    // Per-player notification_type so multiple players RSVP'ing the same
    // event don't collide on the (event_id, user_id, notification_type)
    // unique key — each player gets their own row in the coach's feed.
    const adminClient = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: notifError } = await (adminClient as any)
      .from('golf_calendar_notifications')
      .upsert({
        user_id: event.creator.user_id,
        event_id: eventId,
        notification_type: `rsvp_response:${playerId}`,
        title: `${player?.first_name} ${statusText}`,
        message: `${player?.first_name} ${player?.last_name} has ${statusText} "${event.title}"`,
        action_url: `/golf/dashboard/calendar?event=${eventId}`,
      }, { onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: false });

    if (notifError) {
      console.error('[notifyRSVPResponse] Failed to insert notification:', notifError.message);
    }
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
  // !inner + status filter: soft-cancelled events keep their RSVP rows
  // (audit finding #19) but must not resurface as actionable invitations.
  const { data: attendances } = await supabase
    .from('golf_event_attendance')
    .select(`
      status,
      rsvp_at,
      event:golf_events!inner(*)
    `)
    .eq('player_id', playerId)
    .eq('status', 'pending')
    .neq('event.status', 'cancelled')
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

