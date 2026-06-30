'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { sanitizeDbError } from '@/lib/db-error';
import { revalidatePath } from 'next/cache';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';

// ============================================================================
// Types
// ============================================================================

interface CreateEventInput {
  title: string;
  eventType: string;
  startDate: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  isMandatory?: boolean;
  maxAttendees?: number | null;
  rsvpDeadline?: string | null;
  attendeeIds?: string[];
  requiresRsvp?: boolean;
  // Game/scrimmage fields — auto-creates a baseball_game record when eventType is 'game' or 'scrimmage'
  opponentName?: string | null;
  homeAway?: 'home' | 'away' | 'neutral' | null;
  /**
   * When provided, the event is created for this explicit team and capability
   * is checked against it. When omitted, team is resolved from the coach's
   * organization (existing behaviour for attachPracticeToCalendar etc.).
   */
  teamId?: string;
}

interface UpdateEventInput {
  title?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  isMandatory?: boolean;
  maxAttendees?: number | null;
  rsvpDeadline?: string | null;
  attendeeIds?: string[];
  requiresRsvp?: boolean;
}

type ActionResult<T = unknown> = { success: boolean; error?: string; data?: T };

const CALENDAR_PATH = '/baseball/dashboard/calendar';

// ============================================================================
// Helpers
// ============================================================================

function buildDateTime(date: string, time?: string | null): string {
  return time ? `${date}T${time}` : `${date}T00:00:00`;
}

function buildEndDateTime(
  endDate?: string | null,
  endTime?: string | null,
  fallbackDate?: string | null,
): string | null {
  const date = endDate || fallbackDate;
  if (!date) return null;
  return endTime ? `${date}T${endTime}` : `${date}T23:59:59`;
}

async function getCoachAndTeam(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, organization_id')
    .eq('user_id', userId)
    .single();

  if (!coach?.organization_id) return null;

  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id')
    .eq('organization_id', coach.organization_id)
    .single();

  if (!team) return null;

  return { coachId: coach.id, teamId: team.id };
}

async function getPlayerInfo(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: player } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', userId)
    .single();
  return player;
}

// ============================================================================
// Event CRUD
// ============================================================================

export async function createBaseballEvent(input: CreateEventInput): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const coachTeam = await getCoachAndTeam(supabase, user.id);
  if (!coachTeam) return { success: false, error: 'Coach or team not found' };

  // When an explicit teamId is provided (e.g. from the Events page multi-team
  // selector), verify team membership and capability before writing.
  const resolvedTeamId = input.teamId ?? coachTeam.teamId;
  if (input.teamId) {
    const allowed = await hasBaseballCapability(input.teamId, 'can_manage_practice');
    if (!allowed) {
      return { success: false, error: 'You do not have permission to create events for this team' };
    }
  }

  const startDateTime = buildDateTime(input.startDate, input.startTime);
  const endDateTime = buildEndDateTime(input.endDate, input.endTime, input.startDate);

  const { data, error } = await supabase
    .from('baseball_events')
    .insert({
      team_id: resolvedTeamId,
      created_by: coachTeam.coachId,
      title: input.title,
      event_type: input.eventType,
      start_time: startDateTime,
      end_time: endDateTime,
      location: input.location || null,
      description: input.description || null,
      is_mandatory: input.isMandatory ?? false,
      max_attendees: input.maxAttendees || null,
      rsvp_deadline: input.rsvpDeadline || null,
      created_by_id: user.id,
    })
    .select()
    .single();

  if (error) return { success: false, error: sanitizeDbError(error, 'calendar') };

  // If attendeeIds provided and RSVP required, create pending attendance records
  if (input.requiresRsvp && input.attendeeIds && input.attendeeIds.length > 0 && data) {
    const attendanceRecords = input.attendeeIds.map((playerId) => ({
      event_id: data.id,
      player_id: playerId,
      status: 'pending' as const,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('baseball_event_attendance').insert(attendanceRecords);
  }

  // Auto-create a baseball_game record when event type is game/scrimmage
  if (data && (input.eventType === 'game' || input.eventType === 'scrimmage')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('baseball_games').insert({
      team_id: resolvedTeamId,
      event_id: data.id,
      game_date: input.startDate,
      game_type: input.eventType,
      opponent_name: input.opponentName ?? null,
      location: input.location ?? null,
      home_away: input.homeAway ?? null,
      created_by: coachTeam.coachId,
      status: 'scheduled',
    });
  }

  revalidatePath(CALENDAR_PATH);
  revalidatePath('/baseball/dashboard/events');
  return { success: true, data };
}

export async function updateBaseballEvent(eventId: string, input: UpdateEventInput): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) return { success: false, error: 'Coach profile not found' };

  const { data: eventRow } = await supabase
    .from('baseball_events')
    .select('id, team_id')
    .eq('id', eventId)
    .single();

  if (!eventRow) {
    return { success: false, error: 'Event not found or you do not have permission to update it' };
  }

  const allowed = await hasBaseballCapability(eventRow.team_id, 'can_manage_practice');
  if (!allowed) {
    return { success: false, error: 'You do not have permission to update events for this team' };
  }

  const updateData: Record<string, unknown> = {};

  if (input.title !== undefined) updateData.title = input.title;
  if (input.eventType !== undefined) updateData.event_type = input.eventType;
  if (input.location !== undefined) updateData.location = input.location;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.isMandatory !== undefined) updateData.is_mandatory = input.isMandatory;
  if (input.maxAttendees !== undefined) updateData.max_attendees = input.maxAttendees;
  if (input.rsvpDeadline !== undefined) updateData.rsvp_deadline = input.rsvpDeadline;

  if (input.startDate !== undefined) {
    updateData.start_time = buildDateTime(input.startDate, input.startTime);
  }

  if (input.endDate !== undefined || input.endTime !== undefined) {
    updateData.end_time = buildEndDateTime(input.endDate, input.endTime, input.startDate);
  }

  const { data, error } = await fromUntyped(supabase, 'baseball_events')
    .update(updateData)
    .eq('id', eventId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { success: false, error: 'Event not found or you do not have permission to update it' };
    }
    return { success: false, error: sanitizeDbError(error, 'calendar') };
  }

  revalidatePath(CALENDAR_PATH);
  return { success: true, data };
}

export async function deleteBaseballEvent(eventId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) return { success: false, error: 'Coach profile not found' };

  // Resolve the team this event belongs to so we can check capability.
  const { data: eventRow } = await supabase
    .from('baseball_events')
    .select('id, team_id, created_by')
    .eq('id', eventId)
    .single();

  if (!eventRow) {
    return { success: false, error: 'Event not found or you do not have permission to delete it' };
  }

  // Verify team membership + can_manage_practice capability.
  const allowed = await hasBaseballCapability(eventRow.team_id, 'can_manage_practice');
  if (!allowed) {
    return { success: false, error: 'You do not have permission to delete events for this team' };
  }

  const { error, count } = await supabase
    .from('baseball_events')
    .delete({ count: 'exact' })
    .eq('id', eventId);

  if (error) return { success: false, error: sanitizeDbError(error, 'calendar') };
  if (count === 0) return { success: false, error: 'Event not found or you do not have permission to delete it' };

  revalidatePath(CALENDAR_PATH);
  revalidatePath('/baseball/dashboard/events');
  return { success: true };
}

// ============================================================================
// RSVP Actions
// ============================================================================

export async function rsvpToBaseballEvent(
  eventId: string,
  status: 'going' | 'maybe' | 'not_going',
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const player = await getPlayerInfo(supabase, user.id);
  if (!player) return { success: false, error: 'Player profile not found' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_event_attendance')
    .upsert(
      {
        event_id: eventId,
        player_id: player.id,
        status,
        responded_at: new Date().toISOString(),
      },
      { onConflict: 'event_id,player_id' },
    )
    .select()
    .single();

  if (error) return { success: false, error: sanitizeDbError(error, 'calendar') };

  revalidatePath(CALENDAR_PATH);
  return { success: true, data };
}

// ============================================================================
// Attendance / Check-in Actions
// ============================================================================

export async function getBaseballEventAttendance(eventId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_event_attendance')
    .select(`
      id,
      event_id,
      player_id,
      status,
      check_in_at,
      absence_reason,
      responded_at,
      player:baseball_players!player_id (
        id,
        first_name,
        last_name,
        avatar_url
      )
    `)
    .eq('event_id', eventId)
    .order('responded_at', { ascending: true });

  if (error) return { success: false, error: sanitizeDbError(error, 'calendar') };

  return { success: true, data };
}

export async function checkInBaseballPlayer(
  eventId: string,
  playerId: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Only coaches can check in players
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) return { success: false, error: 'Only coaches can check in players' };

  // Upsert: if attendance record exists, update check_in_at; otherwise create new one with going status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_event_attendance')
    .upsert(
      {
        event_id: eventId,
        player_id: playerId,
        status: 'going',
        check_in_at: new Date().toISOString(),
        responded_at: new Date().toISOString(),
      },
      { onConflict: 'event_id,player_id' },
    )
    .select()
    .single();

  if (error) return { success: false, error: sanitizeDbError(error, 'calendar') };

  revalidatePath(CALENDAR_PATH);
  return { success: true, data };
}

export async function uncheckInBaseballPlayer(
  eventId: string,
  playerId: string,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) return { success: false, error: 'Only coaches can manage check-ins' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_event_attendance')
    .update({ check_in_at: null })
    .eq('event_id', eventId)
    .eq('player_id', playerId)
    .select()
    .single();

  if (error) return { success: false, error: sanitizeDbError(error, 'calendar') };

  revalidatePath(CALENDAR_PATH);
  return { success: true, data };
}

// ============================================================================
// Query Helpers (for server-side fetching)
// ============================================================================

// ============================================================================
// Practice -> Calendar attach
// ============================================================================

interface AttachPracticeInput {
  title: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
}

/**
 * Create a calendar event for a published practice and return its event id so
 * the practice can store the back-reference (baseball_practices.event_id).
 *
 * Wires to the real createBaseballEvent path (auth + coach/team resolution +
 * RLS happen there), creating a 'practice'-typed baseball_events row. Returns
 * `{ success, data: { eventId } }` matching the publishPractice call site,
 * which treats a failed attach as a soft, non-rolling-back warning.
 */
export async function attachPracticeToCalendar(
  input: AttachPracticeInput,
): Promise<ActionResult<{ eventId: string }>> {
  const result = await createBaseballEvent({
    title: input.title,
    eventType: 'practice',
    startDate: input.date,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    location: input.location ?? null,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const eventId = (result.data as { id?: string } | undefined)?.id;
  if (!eventId) {
    return { success: false, error: 'Calendar event was created but no id was returned.' };
  }

  return { success: true, data: { eventId } };
}

export async function getTeamEvents(teamId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('baseball_events')
    .select(`
      *,
      attendance:baseball_event_attendance(
        id,
        player_id,
        status,
        check_in_at,
        responded_at
      )
    `)
    .eq('team_id', teamId)
    .order('start_time', { ascending: true });

  if (error) return { success: false, error: sanitizeDbError(error, 'calendar') };

  // Compute attendance counts per event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventsWithCounts = (data || []).map((event: any) => {
    const att = (event.attendance as Array<{ status: string }>) || [];
    return {
      ...event,
      rsvp_going_count: att.filter((a) => a.status === 'going').length,
      rsvp_maybe_count: att.filter((a) => a.status === 'maybe').length,
      rsvp_not_going_count: att.filter((a) => a.status === 'not_going').length,
      rsvp_pending_count: att.filter((a) => a.status === 'pending').length,
      rsvp_total_count: att.length,
    };
  });

  return { success: true, data: eventsWithCounts };
}
