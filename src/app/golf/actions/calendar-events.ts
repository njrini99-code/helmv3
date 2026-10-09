'use server';

import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { z } from 'zod';
// roundTypeToDb was a no-op (identity function) and has been removed.
// Frontend and DB both use 'practice' | 'qualifier' | 'tournament'.
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import type { RSVPStatus } from '@/lib/calendar/rsvp';
import { isClassEvent } from '@/lib/calendar/class-events';
import { logServerError, logServerException } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { createAdminClient } from '@/lib/supabase/admin';
import { describeError } from '@/lib/utils/describe-error';
import { dateString, getCoachTeamId } from './golf-action-shared';
import type { ActionResult } from './golf-action-shared';

// ============================================================================
// ACTION RESULT DATA TYPES
// ============================================================================

// Golf event types: 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other' | 'class'

/**
 * Build a timezone offset string from minutes offset (from Date.getTimezoneOffset()).
 * getTimezoneOffset() returns positive for west of UTC (e.g. 360 for UTC-6).
 * We need the ISO 8601 format: "-06:00" for UTC-6, "+05:30" for UTC+5:30.
 */
function formatTimezoneOffset(offsetMinutes: number): string {
  // getTimezoneOffset returns positive for behind UTC, negative for ahead
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
/**
 * Build a full ISO datetime string from date, time, and optional timezone offset.
 * If timezoneOffset is not provided, no offset is appended (Supabase treats as UTC).
 */
function buildDateTimeString(date: string, time: string | undefined, timezoneOffset?: number): string {
  if (!time) return `${date}T00:00:00+00:00`;
  const tz = timezoneOffset !== undefined ? formatTimezoneOffset(timezoneOffset) : '+00:00';
  return `${date}T${time}${tz}`;
}
/**
 * Normalize an RSVP deadline through the SAME timezone-offset convention that
 * start_time uses (buildDateTimeString). The UI sends datetime-local wall
 * time ("YYYY-MM-DDTHH:MM"); storing that verbatim made Postgres treat it as
 * UTC, shifting an ET coach's 6 PM deadline to 2 PM (audit finding #15).
 * Strings that already carry an explicit offset (Z or ±HH:MM) pass through.
 */
function buildRsvpDeadlineString(
  deadline: string | undefined | null,
  timezoneOffset?: number
): string | null {
  if (!deadline) return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(deadline)) return deadline;
  const [date, time] = deadline.split('T');
  if (!date) return null;
  // datetime-local yields HH:MM (occasionally HH:MM:SS) — buildDateTimeString
  // accepts either; date-only deadlines resolve to midnight in the coach's tz.
  return buildDateTimeString(date, time || '00:00', timezoneOffset);
}
/**
 * Golf event insert data
 * Note: Maps to the actual golf_events table which uses:
 * - start_time (required string) as the primary date/time field
 * - team_id (required string)
 * - event_type (required string)
 * - title (required string)
 */
interface GolfEventInsertData {
  team_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time?: string | null;
  all_day?: boolean | null;
  location?: string | null;
  description?: string | null;
  created_by?: string | null;
  status?: string | null;
  requires_rsvp?: boolean | null;
  rsvp_deadline?: string | null;
  max_attendees?: number | null;
  // Fields that might not exist in schema but we want to track
  [key: string]: unknown;
}
/** Conflict check result - re-exported from calendar lib */
export interface ConflictResult {
  hasConflict: boolean;
  partial?: boolean;
  conflicts: Array<{
    userId: string;
    userName: string;
    playerId?: string;
    conflictingEvent: {
      id?: string;
      title: string;
      type: 'event' | 'class' | 'blocked';
      start: string;
      end: string;
    };
  }>;
  suggestions: Array<{
    start: Date | string;
    end: Date | string;
  }>;
}
/** Busy period for availability - serialized version */
export interface SerializedBusyPeriod {
  start: string;
  end: string;
  type: 'event' | 'class' | 'blocked';
  title?: string;
  eventId?: string;
}
/** Event invitation - re-exported from calendar lib */
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
  status: 'pending' | 'accepted' | 'declined' | 'tentative';
}
/** RSVP stats for an event */
export interface RSVPStats {
  summary: {
    total: number;
    accepted: number;
    declined: number;
    tentative: number;
    pending: number;
    attendees: Array<{
      playerId: string;
      playerName: string;
      avatarUrl: string | null;
      status: 'pending' | 'accepted' | 'declined' | 'tentative';
      respondedAt: string | null;
    }>;
  };
  acceptanceRate: number;
  responseRate: number;
}
const timeString = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM');
const golfEventType = z.enum(['practice', 'tournament', 'qualifier', 'meeting', 'travel', 'other', 'class']);
/**
 * End must not precede start (audit finding #17 — 3 inverted rows reached
 * prod and exported inverted DTEND to external calendars). The DB CHECK
 * golf_events_end_after_start is live as the backstop; this refine produces a
 * friendly message first. Wall-time string comparison is valid because both
 * sides carry the same timezone offset.
 */
function refineEventEndAfterStart(
  d: { startDate?: string; endDate?: string; startTime?: string; endTime?: string; allDay?: boolean },
  ctx: z.RefinementCtx
): void {
  if (!d.startDate) return;
  // A strictly earlier end DATE is inverted under every all-day/timed
  // convention (create defaults allDay→true, update defaults timed — only
  // flag what is wrong in both).
  if (d.endDate && d.endDate < d.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be on or after the start date',
      path: ['endDate'],
    });
    return;
  }
  // Explicitly timed with both times on the same effective dates.
  if (d.allDay === false && d.startTime && d.endTime) {
    const start = `${d.startDate}T${d.startTime}`;
    const end = `${d.endDate || d.startDate}T${d.endTime}`;
    if (end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time must be after the start time',
        path: ['endTime'],
      });
    }
  }
}
const golfEventSchema = z.object({
  title: z.string().min(1).max(200),
  eventType: golfEventType,
  startDate: dateString,
  endDate: dateString.optional(),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(500).optional(),
  courseName: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  isMandatory: z.boolean().optional(),
  // RSVP fields
  requiresRsvp: z.boolean().optional(),
  rsvpDeadline: z.string().optional(),
  maxAttendees: z.number().int().positive().optional(),
  attendeeIds: z.array(z.string().uuid()).optional(),
  // Timezone offset from client (minutes from UTC, e.g. 360 for UTC-6)
  timezoneOffset: z.number().int().optional(),
  requestId: z.string().uuid().optional(),
}).superRefine(refineEventEndAfterStart);
export interface GolfEventInput {
  title: string;
  eventType: 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  courseName?: string;
  description?: string;
  isMandatory?: boolean;
  // RSVP fields
  requiresRsvp?: boolean;
  rsvpDeadline?: string;
  maxAttendees?: number;
  attendeeIds?: string[];
  // Timezone offset from client (minutes from UTC, e.g. 360 for UTC-6)
  timezoneOffset?: number;
  /**
   * Makes the create safe to repeat. The caller makes one id per attempt and
   * keeps it across a Retry; it becomes the event's primary key, so a repeat
   * after a lost reply hits the key instead of adding the event twice, and the
   * existing row is returned as the answer (only once it is read back as this
   * coach's own event on this team). Without it the create behaves as it
   * always has.
   */
  requestId?: string;
}
/**
 * Input contract for updateGolfEvent.
 *
 * ATTENDEE SEMANTICS (2026-06-10, audit finding #4): the legacy `attendeeIds`
 * field is ADDITIVE-ONLY — players missing from the list are NEVER removed
 * (edit forms used to seed it empty and silently wipe every existing RSVP).
 * Removals must be explicit via `removeAttendeeIds`.
 */
export type GolfEventUpdateInput = Partial<GolfEventInput> & {
  /** Players to invite (attendance row + invitation). Additive. */
  addAttendeeIds?: string[];
  /** Players to explicitly remove from the event's attendance list. */
  removeAttendeeIds?: string[];
};
/** Options for deleteGolfEvent. Default (no options) = soft cancellation. */
export interface DeleteGolfEventOptions {
  /**
   * Permanently delete the row. Only permitted when the event is already
   * cancelled OR has zero attendance rows — otherwise the action fails and
   * the caller must cancel first.
   */
  hard?: boolean;
  /** Optional cancellation reason shown to attendees (soft-cancel only). */
  reason?: string;
}
/**
 * Machine-readable RSVP failure codes the UI can branch on. The lock strings
 * match useRSVP's RsvpLockCode union (rsvpLockMessage renders them).
 */
export type RSVPErrorCode =
  | 'rsvp_deadline_passed'
  | 'event_started'
  | 'event_cancelled'
  | 'not_team_member'
  | 'class_meeting'
  | 'write_failed';
export type RespondToEventResult =
  | { success: true; data: undefined }
  | { success: false; error: string; code?: RSVPErrorCode };
type GolfEventUpdateData = {
  updated_at: string;
  title?: string;
  event_type?: 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other' | 'class';
  start_time?: string;
  end_time?: string | null;
  all_day?: boolean;
  location?: string | null;
  description?: string | null;
  requires_rsvp?: boolean;
  rsvp_deadline?: string | null;
  max_attendees?: number | null;
  status?: string;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
}
// ============================================================================
// EVENT ACTIONS
// ============================================================================

/** The create's own words for an invitation failure: the event is real, the invitations are not. */
const EVENT_INVITATIONS_FAILED = "The event was created, but its invitations didn't all go out.";
async function createGolfEventImpl(data: GolfEventInput): Promise<ActionResult<{ eventId: string; invitationsError?: string }>> {
  try {
    // Validate input
    const validatedData = golfEventSchema.parse(data);

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to create events' };
    }

    // Try to get coach profile first
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // If not a coach, try to get player profile
    let teamId: string | null = null;
    let createdBy: string | null = null;

    if (coach) {
      // Coach - get team_id via organization
      teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
      if (!teamId) {
        return { success: false, error: 'Coach not assigned to a team' };
      }
      createdBy = coach.id;
    } else {
      // Players cannot create team events (RLS policy restricts INSERT to coaches only)
      return { success: false, error: 'Only coaches can create team events' };
    }

    // Build insert data matching the actual golf_events table schema
    // Note: golf_events uses start_time as the primary datetime field (not start_date)
    const tz = validatedData.timezoneOffset;
    const isAllDay = validatedData.allDay ?? true;
    const insertData: GolfEventInsertData = {
      team_id: teamId,
      title: validatedData.title,
      event_type: validatedData.eventType,
      // For all-day events, store with T00:00:00+00:00 to avoid timezone date shifts
      start_time: isAllDay
        ? `${validatedData.startDate}T00:00:00+00:00`
        : buildDateTimeString(validatedData.startDate, validatedData.startTime, tz),
      end_time: isAllDay
        ? `${validatedData.endDate || validatedData.startDate}T00:00:00+00:00`
        : validatedData.endTime
          ? buildDateTimeString(validatedData.endDate || validatedData.startDate, validatedData.endTime, tz)
          : validatedData.endDate ? `${validatedData.endDate}T00:00:00+00:00` : null,
      all_day: isAllDay,
      location: validatedData.location || null,
      description: validatedData.description || null,
      // RSVP config (audit finding #5): these were silently dropped — every
      // event created with RSVP on landed disarmed. The deadline goes through
      // the same timezone-offset convention as start_time (finding #15).
      requires_rsvp: validatedData.requiresRsvp ?? false,
      rsvp_deadline: buildRsvpDeadlineString(validatedData.rsvpDeadline, tz),
      max_attendees: validatedData.maxAttendees ?? null,
      // F042: stamp the active lifecycle status so one-off events match the
      // recurring path (recurring-events.ts inserts 'confirmed'). Without it the
      // row landed with a null status, leaving it outside the 'confirmed'
      // lifecycle (restore/cancel transitions key off 'confirmed') — the event
      // was effectively "stuck" in an undefined state on some surfaces.
      status: 'confirmed',
    };

    // Only add created_by if it's not null (coaches only)
    if (createdBy) {
      insertData.created_by = createdBy;
    }

    // The request id IS the row id, so a repeat of the same create collides on
    // the primary key instead of inserting a second event.
    if (validatedData.requestId) {
      insertData.id = validatedData.requestId;
    }

    // Legacy UI shape: timed event with an endDate but no endTime resolves to
    // midnight, which can precede a same-day timed start. The DB CHECK
    // golf_events_end_after_start (live) would reject the row — store an open
    // end instead. (Explicitly inverted endTime is rejected by zod above.)
    if (
      insertData.end_time &&
      new Date(insertData.end_time).getTime() < new Date(insertData.start_time).getTime()
    ) {
      insertData.end_time = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: event, error } = await (supabase as any)
      .from('golf_events')
      .insert(insertData)
      .select()
      .single();

    if (error && validatedData.requestId && (error as { code?: string }).code === '23505') {
      // The id is taken. This is a repeat of a create that already landed (the
      // reply was lost) only if the row is read back as the same event, made by
      // this coach, on this team. RLS hides another team's row from this read, so
      // an id that collides with anything else comes back empty and is refused
      // below, never reported as saved. A failed read falls through to the
      // insert's own error: the repeat is refused rather than guessed.
      // Invitations and the fan-out already ran with the first attempt, so a
      // repeat must not send them again.
      const { data: existing, error: existingError } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from('golf_events')
        .select('id, team_id, created_by, title, start_time')
        .eq('id', validatedData.requestId)
        .maybeSingle();
      if (
        !existingError &&
        existing &&
        existing.team_id === teamId &&
        existing.created_by === createdBy &&
        existing.title === insertData.title &&
        new Date(existing.start_time).getTime() === new Date(insertData.start_time).getTime()
      ) {
        revalidatePath('/golf/dashboard');
        revalidatePath('/golf/dashboard/calendar');
        updateTag(CACHE_TAGS.DASHBOARD);
        updateTag(CACHE_TAGS.CALENDAR);
        return { success: true, data: { eventId: existing.id as string } };
      }
    }

    if (error) {
      // 23514 = CHECK violation (golf_events_end_after_start backstop).
      if ((error as { code?: string }).code === '23514') {
        return { success: false, error: 'End time must be after the start time.' };
      }
      return { success: false, error: 'Failed to create event. Please try again.' };
    }

    // Send invitations if attendeeIds provided.
    //
    // A failure here used to be swallowed ("don't fail the whole operation"), so
    // the coach saw "players notified" for an event nobody was invited to. The
    // event is real and stays created; the failure comes back beside the id so
    // the caller can say the invitations did not go out. `success` stays true:
    // callers that never look at the field behave as before, and nothing may
    // replay the create to fix the invitations.
    let invitationsError: string | undefined;
    if (validatedData.attendeeIds && validatedData.attendeeIds.length > 0) {
      try {
        const { sendEventInvitations } = await import('@/lib/calendar/rsvp');
        await sendEventInvitations(event.id, validatedData.attendeeIds, supabase);
      } catch (inviteErr) {
        invitationsError = EVENT_INVITATIONS_FAILED;
        await logServerError(
          `[createGolfEvent] invitations failed for event ${event.id}; created without them: ${describeError(inviteErr)}`,
          { action: 'golf.createGolfEvent.invitations', featureArea: 'calendar', extra: { eventId: event.id } },
          'error',
        );
      }
    }

    // Notify all team players about the new event (in-app + email + push).
    // 2026-06-10 (audit finding #11): the save previously awaited a sequential
    // per-player email loop (prefs query + Resend HTTP each), adding ~3–10s of
    // latency on a 15-player roster. The whole fan-out now runs post-response
    // via next/server `after()` (same pattern as invalidateOnRoundComplete),
    // with the three channels parallelized through Promise.allSettled. Reads
    // inside the callback use the admin client — the request-scoped client is
    // not guaranteed usable once the response has flushed.
    const fanOutEventId: string = event.id;
    const fanOutTeamId = teamId;
    const fanOutTitle = validatedData.title;
    const fanOutStartDate = validatedData.startDate;
    const fanOutLocation = validatedData.location || '';
    // Q-108 (owner, 2026-10-01): only the invited players are told, as the editor promises ("Attendees will be notified");
    // an event with no invitees notifies nobody. It used to email and push every active player on the team.
    // Owner, 2026-10-08: RSVPs are off unless the coach turns them on, and players get no notification for an event
    // that doesn't ask for replies.
    const fanOutInvitees = new Set(validatedData.requiresRsvp ? (validatedData.attendeeIds ?? []) : []);
    after(async () => {
      if (fanOutInvitees.size === 0) return;
      try {
        const adminClient = createAdminClient();
        // Fire-and-forget fan-out for a newly created event. Both reads
        // discarded their error and both `length === 0` guards then `return`,
        // so a failed roster read meant NOBODY was told about a new team event
        // — and because this runs inside after(), there is no return value to
        // carry a failure and nothing surfaced anywhere. Silent in the truest
        // sense: no error, no user feedback, no record.
        //
        // It cannot fail the request (the event was created successfully and
        // should stay created), so the honest thing is to say so in the log.
        const { data: teamMembers, error: teamMembersError } = await adminClient
          .from('golf_team_members')
          .select('player_id')
          .eq('team_id', fanOutTeamId)
          .eq('status', 'active');

        if (teamMembersError) {
          await logServerError(
            `[createGolfEvent.fanOut] roster read failed — no one was notified about this event: ${describeError(teamMembersError)}`,
            { action: 'golf.createEvent.fanOut', featureArea: 'calendar' },
          );
          return;
        }

        const playerIds = (teamMembers ?? [])
          .map((m) => m.player_id)
          .filter((id): id is string => Boolean(id) && fanOutInvitees.has(id as string));
        if (playerIds.length === 0) return;

        const { data: players, error: playersError } = await adminClient
          .from('golf_players')
          .select('id, user_id')
          .in('id', playerIds);

        if (playersError) {
          await logServerError(
            `[createGolfEvent.fanOut] player lookup failed — no one was notified about this event: ${describeError(playersError)}`,
            { action: 'golf.createEvent.fanOut', featureArea: 'calendar' },
          );
          return;
        }

        const userIds = (players ?? [])
          .map((p) => p.user_id)
          .filter((id): id is string => Boolean(id));
        if (userIds.length === 0) return;

        // 1. In-app notifications (golf_calendar_notifications)
        const inAppPromise = (async () => {
          const notifications = userIds.map((uid) => ({
            user_id: uid,
            event_id: fanOutEventId,
            notification_type: 'event_invitation',
            title: `New event: ${fanOutTitle}`,
            message: `${fanOutStartDate}${fanOutLocation ? ` at ${fanOutLocation}` : ''}`,
            action_url: `/golf/dashboard/calendar`,
          }));
          const { error: notifError } = await fromUntyped(adminClient, 'golf_calendar_notifications')
            .upsert(notifications, { onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: true });
          if (notifError) {
            await logServerError(`createGolfEvent notification insert failed: ${notifError.message}`, {
              action: 'createGolfEvent.insertNotifications',
              featureArea: 'events',
              extra: { errorCode: notifError.code },
            });
          }
        })();

        // 2. Email notifications — parallel per recipient (the bulk helper
        // loops sequentially; Promise.allSettled keeps one slow Resend call
        // from serializing the rest).
        const emailPromise = (async () => {
          const { sendEmailNotification } = await import('@/lib/notifications/email');
          const { data: userRows } = await adminClient
            .from('users')
            .select('id, email')
            .in('id', userIds);
          const recipients = (userRows ?? [])
            .filter((u) => Boolean(u.email))
            .map((u) => ({ id: u.id, email: u.email as string }));
          if (recipients.length === 0) return;
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';
          const results = await Promise.allSettled(
            recipients.map((u) =>
              sendEmailNotification('event_rsvp_reminder', u.id, u.email, {
                eventName: fanOutTitle,
                eventDate: fanOutStartDate,
                location: fanOutLocation,
                eventUrl: `${baseUrl}/golf/dashboard/calendar`,
              })
            )
          );
          const failed = results.filter((r) => r.status === 'rejected').length;
          if (failed > 0) {
            await logServerError(`createGolfEvent email notification failed for ${failed}/${recipients.length} recipients`, {
              action: 'createGolfEvent.emailNotification',
              featureArea: 'events',
            });
          }
        })();

        // 3. Push notifications
        const pushPromise = (async () => {
          const { sendBulkPushNotification } = await import('@/lib/notifications/push');
          await sendBulkPushNotification('event_rsvp_reminder', userIds, {
            eventName: fanOutTitle,
            eventId: fanOutEventId,
          });
        })();

        const channelResults = await Promise.allSettled([inAppPromise, emailPromise, pushPromise]);
        const channelNames = ['inApp', 'email', 'push'] as const;
        for (let i = 0; i < channelResults.length; i++) {
          const result = channelResults[i];
          if (result?.status === 'rejected') {
            await logServerError(`createGolfEvent ${channelNames[i]} fan-out failed: ${describeError(result.reason)}`, {
              action: 'createGolfEvent.notificationFanOut',
              featureArea: 'events',
              extra: { channel: channelNames[i], eventId: fanOutEventId },
            });
          }
        }
      } catch (notifErr) {
        await logServerError(`createGolfEvent notification creation failed: ${describeError(notifErr)}`, {
          action: 'createGolfEvent.notifications',
          featureArea: 'events',
        });
      }
    });

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.CALENDAR);

    return { success: true, data: { eventId: event.id, ...(invitationsError ? { invitationsError } : {}) } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0]?.message;
      return { success: false, error: firstIssue || 'Invalid event data. Please check your inputs.' };
    }
    return formatSafeErrorResponse(error);
  }
}
const observedCreateGolfEvent = withAdminObserved(
  'createGolfEvent',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  createGolfEventImpl,
);
export async function createGolfEvent(data: GolfEventInput): Promise<ActionResult<{ eventId: string; invitationsError?: string }>> {
  return observedCreateGolfEvent(data);
}
// Validation schema for golf event updates
const golfEventUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  eventType: golfEventType.optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  requiresRsvp: z.boolean().optional(),
  rsvpDeadline: z.string().optional(),
  maxAttendees: z.number().int().positive().optional(),
  // ADDITIVE-ONLY (audit finding #4): players listed here are invited if
  // missing; players absent from this list are never touched.
  attendeeIds: z.array(z.string().uuid()).optional(),
  addAttendeeIds: z.array(z.string().uuid()).optional(),
  // The ONLY way to remove attendees — explicit, never derived from an
  // incomplete client list.
  removeAttendeeIds: z.array(z.string().uuid()).optional(),
  timezoneOffset: z.number().int().optional(),
  // Restore (un-cancel) a soft-cancelled event. Constrained to 'confirmed' so
  // this update path can never be used to silently flip an event to other
  // lifecycle states; cancellation still flows exclusively through
  // deleteGolfEvent (which also notifies attendees). Setting it clears the
  // cancellation bookkeeping below.
  status: z.literal('confirmed').optional(),
}).superRefine(refineEventEndAfterStart);
async function updateGolfEventImpl(
  eventId: string,
  data: GolfEventUpdateInput
): Promise<{ success: boolean; error?: string; data?: { invitationsError?: string } }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to update events' };
    }

    // Try to get coach profile first
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // Denying on a failed read is right — a gate that could not run must not
    // pass — but "Only coaches can update team events" and "Event not found"
    // are statements about the caller and the event, not about the query. A
    // coach told they are not a coach, or that the event open in front of them
    // does not exist, has no reason to try again.
    if (coachError) {
      await logServerError(
        `update event: coach read failed: ${describeError(coachError)}`,
        { action: 'golf.updateGolfEvent', featureArea: 'calendar' },
        'warning',
      );
      return { success: false, error: "Couldn't verify your access to this event. Please try again." };
    }

    // Only coaches can update team events (matches createGolfEvent behavior)
    if (!coach) {
      return { success: false, error: 'Only coaches can update team events' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify event belongs to coach's team
    const { data: existingEvent, error: existingEventError } = await supabase
      .from('golf_events')
      .select('team_id')
      .eq('id', eventId)
      .single();

    // `.single()` reports a genuine no-row as PGRST116 — that one really is
    // "event not found" and keeps its message.
    if (existingEventError && existingEventError.code !== 'PGRST116') {
      await logServerError(
        `event lifecycle: event read failed for ${eventId}: ${describeError(existingEventError)}`,
        { action: 'golf.eventLifecycle', featureArea: 'calendar' },
        'warning',
      );
      return { success: false, error: "Couldn't verify your access to this event. Please try again." };
    }

    if (!existingEvent) {
      return { success: false, error: 'Event not found' };
    }

    if (existingEvent.team_id !== teamId) {
      return { success: false, error: 'Access denied' };
    }

    // Validate input
    const validatedData = golfEventUpdateSchema.parse(data);

    const updateData: GolfEventUpdateData = { updated_at: new Date().toISOString() };

    if (validatedData.title !== undefined) updateData.title = validatedData.title;
    if (validatedData.eventType !== undefined) updateData.event_type = validatedData.eventType;
    // Combine date+time into start_time/end_time timestamptz with timezone offset
    // For all-day events, store with T00:00:00+00:00 to avoid timezone date shifts
    const tz = validatedData.timezoneOffset;
    const isAllDay = validatedData.allDay;
    if (validatedData.startDate !== undefined) {
      updateData.start_time = isAllDay
        ? `${validatedData.startDate}T00:00:00+00:00`
        : buildDateTimeString(validatedData.startDate, validatedData.startTime, tz);
    }
    // Only recalculate end_time when an end-related field was explicitly provided.
    // Previously, `|| isAllDay` caused end_time to be recomputed even when no end
    // fields changed, collapsing multi-day events to a single day.
    if (validatedData.endDate !== undefined || validatedData.endTime !== undefined) {
      const endDate = validatedData.endDate || validatedData.startDate;
      if (isAllDay) {
        updateData.end_time = endDate ? `${endDate}T00:00:00+00:00` : null;
      } else if (validatedData.endTime && endDate) {
        updateData.end_time = buildDateTimeString(endDate, validatedData.endTime, tz);
      } else if (endDate && !validatedData.endTime) {
        updateData.end_time = `${endDate}T00:00:00+00:00`;
      } else {
        updateData.end_time = null;
      }
    }
    if (validatedData.allDay !== undefined) updateData.all_day = validatedData.allDay;
    if (validatedData.location !== undefined) updateData.location = validatedData.location || null;
    if (validatedData.description !== undefined) updateData.description = validatedData.description || null;
    if (validatedData.requiresRsvp !== undefined) updateData.requires_rsvp = validatedData.requiresRsvp;
    // Deadline goes through the same timezone-offset convention as start_time
    // (audit finding #15: stored as UTC wall-time, shifting the coach's
    // intended deadline by the UTC offset).
    if (validatedData.rsvpDeadline !== undefined) {
      updateData.rsvp_deadline = buildRsvpDeadlineString(validatedData.rsvpDeadline, tz);
    }
    if (validatedData.maxAttendees !== undefined) updateData.max_attendees = validatedData.maxAttendees;
    // Restore (un-cancel): flip back to confirmed and clear the cancellation
    // bookkeeping set by deleteGolfEvent's soft-cancel path so the event no
    // longer renders as cancelled.
    if (validatedData.status === 'confirmed') {
      updateData.status = 'confirmed';
      updateData.cancelled_at = null;
      updateData.cancellation_reason = null;
    }

    let query = supabase
      .from('golf_events')
      .update(updateData)
      .eq('id', eventId);

    // Handle null team_id for personal events
    if (teamId === null) {
      query = query.is('team_id', null);
    } else {
      query = query.eq('team_id', teamId);
    }

    const { data: updatedRows, error } = await query.select('id');

    if (error) {
      // 23514 = CHECK violation (golf_events_end_after_start). Partial updates
      // can invert against the UNCHANGED half of the range (e.g. moving the
      // start past the existing end) — the DB constraint is the arbiter.
      if ((error as { code?: string }).code === '23514') {
        return { success: false, error: 'End time must be after the start time. Adjust the event end as well.' };
      }
      void logServerError(`updateGolfEvent write failed: ${describeError(error)}`, {
        action: 'golf.updateGolfEvent.write',
        featureArea: 'calendar',
        extra: { eventId },
      }, 'warning');
      return { success: false, error: 'Failed to update event' };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: 'Event could not be updated. You may not have permission to edit this event.' };
    }

    // Attendee sync — ADDITIVE-ONLY contract (audit finding #4).
    // Previously this diffed golf_event_attendance against the client's
    // attendeeIds and DELETED every player missing from the list. Edit forms
    // seeded attendeeIds: [] — so adding one player silently wiped every other
    // attendance row (RSVPs, check-in state, reminder eligibility). House rule:
    // no destructive deletes driven by incomplete client state.
    //
    // New contract: attendeeIds + addAttendeeIds insert missing players and
    // NEVER delete; removals happen only via explicit removeAttendeeIds.
    const inviteIds = Array.from(new Set([
      ...(validatedData.attendeeIds ?? []),
      ...(validatedData.addAttendeeIds ?? []),
    ]));
    const removeIds = validatedData.removeAttendeeIds ?? [];

    // An invitation failure used to be swallowed, so the coach saw a clean save
    // for players who were never invited. The edit is real and stays saved; the
    // failure comes back beside `success` so the caller can say so.
    let invitationsError: string | undefined;
    if (inviteIds.length > 0) {
      const { data: attendanceRows } = await supabase
        .from('golf_event_attendance')
        .select('player_id')
        .eq('event_id', eventId);

      const existingIds = new Set((attendanceRows || []).map(row => row.player_id));
      const toAdd = inviteIds.filter((id) => !existingIds.has(id));

      if (toAdd.length > 0) {
        try {
          const { sendEventInvitations } = await import('@/lib/calendar/rsvp');
          await sendEventInvitations(eventId, toAdd, supabase);
        } catch (inviteErr) {
          invitationsError = "The changes were saved, but the new invitations didn't go out.";
          await logServerError(
            `[updateGolfEvent] invitations failed for event ${eventId}; saved without inviting ${toAdd.length} player(s): ${describeError(inviteErr)}`,
            { action: 'golf.updateGolfEvent.invitations', featureArea: 'calendar', extra: { eventId } },
            'error',
          );
        }
      }
    }

    if (removeIds.length > 0) {
      const { error: removeError } = await supabase
        .from('golf_event_attendance')
        .delete()
        .eq('event_id', eventId)
        .in('player_id', removeIds);

      if (removeError) {
        await logServerError(`updateGolfEvent attendee removal failed: ${removeError.message}`, {
          action: 'updateGolfEvent.removeAttendees',
          featureArea: 'events',
          extra: { eventId, removeIds },
        });
        return { success: false, error: 'Event updated, but removing attendees failed. Please retry.' };
      }
    }

    // Notify team players about event update. Time / location / title /
    // type all matter to a player who's already RSVP'd — a drag-and-drop
    // reschedule is exactly the case where attendees need to hear about it.
    const meaningfulChange =
      validatedData.title !== undefined ||
      validatedData.location !== undefined ||
      validatedData.eventType !== undefined ||
      validatedData.startDate !== undefined ||
      validatedData.startTime !== undefined ||
      validatedData.endDate !== undefined ||
      validatedData.endTime !== undefined;
    if (teamId && meaningfulChange) {
      try {
        const { notifyEventUpdate } = await import('@/lib/calendar/rsvp');
        await notifyEventUpdate(eventId, supabase);
      } catch {
        // Don't fail update if notifications fail
      }
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.CALENDAR);
    // Same shape as createGolfEvent's (`data.invitationsError`), the one the Clubhouse
    // action wrapper carries through to the editor.
    return invitationsError ? { success: true, data: { invitationsError } } : { success: true };

  } catch (err) {
    if (err instanceof z.ZodError) {
      const firstIssue = err.issues[0]?.message;
      return { success: false, error: firstIssue || 'Invalid input data' };
    }
    // Previously fully silent: any unexpected throw here (not a validation
    // error, not one of the already-logged read failures above) reached
    // neither Bridge nor Sentry — a calendar-save critical path with a
    // real bug would only ever show as a generic user-facing message.
    void logServerException(err, { action: 'golf.updateGolfEvent.unexpected', featureArea: 'calendar' }, 'error');
    return { success: false, error: 'An unexpected error occurred' };
  }
}
const observedUpdateGolfEvent = withAdminObserved(
  'updateGolfEvent',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  updateGolfEventImpl,
);
export async function updateGolfEvent(
  eventId: string,
  data: GolfEventUpdateInput
): Promise<{ success: boolean; error?: string; data?: { invitationsError?: string } }> {
  return observedUpdateGolfEvent(eventId, data);
}
/**
 * Delete a golf event.
 *
 * 2026-06-10 (audit finding #19): the default is now a SOFT CANCELLATION —
 * the event's status flips to 'cancelled' (cancelled_at/cancellation_reason
 * set), attendees are notified (in-app + email), and all RSVP rows are kept.
 * The previous behavior was a hard DELETE whose FK cascade silently erased
 * every attendance row and the attendees' notification history with no
 * warning to anyone.
 *
 * A hard delete ({ hard: true } or deleteGolfEventPermanently) is only
 * permitted when the event is already cancelled OR has zero attendance rows.
 */
async function deleteGolfEventImpl(
  eventId: string,
  options?: DeleteGolfEventOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to delete events' };
    }

    // Try to get coach profile first
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // Denying on a failed read is right — a gate that could not run must not
    // pass — but "Only coaches can update team events" and "Event not found"
    // are statements about the caller and the event, not about the query. A
    // coach told they are not a coach, or that the event open in front of them
    // does not exist, has no reason to try again.
    if (coachError) {
      await logServerError(
        `delete event: coach read failed: ${describeError(coachError)}`,
        { action: 'golf.deleteGolfEvent', featureArea: 'calendar' },
        'warning',
      );
      return { success: false, error: "Couldn't verify your access to this event. Please try again." };
    }

    // Only coaches can delete team events (matches createGolfEvent behavior)
    if (!coach) {
      return { success: false, error: 'Only coaches can delete team events' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify event belongs to coach's team
    const { data: existingEvent, error: existingEventError } = await supabase
      .from('golf_events')
      .select('team_id, title, status, start_time, location, requires_rsvp')
      .eq('id', eventId)
      .single();

    // `.single()` reports a genuine no-row as PGRST116 — that one really is
    // "event not found" and keeps its message.
    if (existingEventError && existingEventError.code !== 'PGRST116') {
      await logServerError(
        `event lifecycle: event read failed for ${eventId}: ${describeError(existingEventError)}`,
        { action: 'golf.eventLifecycle', featureArea: 'calendar' },
        'warning',
      );
      return { success: false, error: "Couldn't verify your access to this event. Please try again." };
    }

    if (!existingEvent) {
      return { success: false, error: 'Event not found' };
    }

    if (existingEvent.team_id !== teamId) {
      return { success: false, error: 'Access denied' };
    }

    if (options?.hard) {
      // Hard delete is gated: only an already-cancelled event, or one with
      // zero attendance rows, may be permanently removed (the FK cascade
      // destroys RSVPs and attendee notification history).
      if (existingEvent.status !== 'cancelled') {
        const { count } = await supabase
          .from('golf_event_attendance')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId);

        if ((count ?? 0) > 0) {
          return {
            success: false,
            error: 'This event has invitees. Cancel it first — permanent deletion is only allowed for cancelled events or events with no attendance records.',
          };
        }
      }

      const { data: deletedRows, error } = await supabase
        .from('golf_events')
        .delete()
        .eq('id', eventId)
        .eq('team_id', teamId)
        .select('id');

      if (error) {
        void logServerError(`deleteGolfEvent hard-delete failed: ${describeError(error)}`, {
          action: 'golf.deleteGolfEvent.hardDelete',
          featureArea: 'calendar',
          extra: { eventId },
        }, 'warning');
        return { success: false, error: 'Failed to delete event' };
      }

      if (!deletedRows || deletedRows.length === 0) {
        return { success: false, error: 'Event could not be deleted. You may not have permission to delete this event.' };
      }
    } else {
      // Soft cancellation — keep the row + every RSVP, mark cancelled,
      // notify attendees.
      if (existingEvent.status === 'cancelled') {
        // Idempotent: already cancelled, don't re-notify.
        revalidatePath('/golf/dashboard/calendar');
        updateTag(CACHE_TAGS.DASHBOARD);
        updateTag(CACHE_TAGS.CALENDAR);
        return { success: true };
      }

      const { data: cancelledRows, error } = await supabase
        .from('golf_events')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: options?.reason ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .eq('team_id', teamId)
        .select('id');

      if (error) {
        void logServerError(`deleteGolfEvent soft-cancel failed: ${describeError(error)}`, {
          action: 'golf.deleteGolfEvent.softCancel',
          featureArea: 'calendar',
          extra: { eventId },
        }, 'warning');
        return { success: false, error: 'Failed to cancel event' };
      }

      if (!cancelledRows || cancelledRows.length === 0) {
        return { success: false, error: 'Event could not be cancelled. You may not have permission to modify this event.' };
      }

      // Notify every invited player post-response (same after() pattern as
      // the create fan-out): in-app 'event_cancelled' rows + email.
      const cancelTitle = existingEvent.title;
      const cancelStart = existingEvent.start_time;
      const cancelLocation = existingEvent.location;
      const cancelReason = options?.reason ?? '';
      const cancelNotifies = existingEvent.requires_rsvp === true;
      after(async () => {
        // Owner, 2026-10-08: RSVPs are off unless the coach turns them on, and players get no notification for an event
        // that doesn't ask for replies, including its cancellation.
        if (!cancelNotifies) return;
        try {
          const adminClient = createAdminClient();
          const { data: attendances } = await adminClient
            .from('golf_event_attendance')
            .select('player:golf_players(user_id)')
            .eq('event_id', eventId);

          const attendanceUserIds = (attendances ?? [])
            .map((row) => {
              const playerRef = (row as { player: { user_id: string | null } | Array<{ user_id: string | null }> | null }).player;
              const playerRow = Array.isArray(playerRef) ? playerRef[0] ?? null : playerRef;
              return playerRow?.user_id ?? null;
            })
            .filter((id): id is string => Boolean(id));

          // Union with the whole active team (2026-07-10 calendar-travel
          // audit, P1): a coach's CREATE fan-out notifies every active
          // golf_team_members row unconditionally, regardless of whether
          // attendeeIds was populated — but this cancel fan-out previously
          // queried golf_event_attendance ONLY, so a whole-team event
          // cancelled before anyone RSVP'd (zero attendance rows) silently
          // notified nobody even though the team was told it was happening.
          // Same two-query shape as the create fan-out above (team_members →
          // player_id → golf_players.user_id) rather than an embedded join.
          const { data: teamMembers } = await adminClient
            .from('golf_team_members')
            .select('player_id')
            .eq('team_id', teamId)
            .eq('status', 'active');
          const activePlayerIds = (teamMembers ?? [])
            .map((m) => m.player_id)
            .filter((id): id is string => Boolean(id));
          let teamUserIds: string[] = [];
          if (activePlayerIds.length > 0) {
            const { data: activePlayers, error: activePlayersError } = await adminClient
              .from('golf_players')
              .select('id, user_id')
              .in('id', activePlayerIds);
            // Same fan-out, same silence: a failed lookup here drops the whole
            // team from the recipient set for an event UPDATE, leaving only
            // whoever had already RSVP'd.
            if (activePlayersError) {
              await logServerError(
                `[golf event update.fanOut] player lookup failed — the team was dropped from this notification: ${describeError(activePlayersError)}`,
                { action: 'golf.updateEvent.fanOut', featureArea: 'calendar' },
              );
            }
            teamUserIds = (activePlayers ?? [])
              .map((p) => p.user_id)
              .filter((id): id is string => Boolean(id));
          }

          const userIds = [...new Set([...attendanceUserIds, ...teamUserIds])];
          if (userIds.length === 0) return;

          const startLabel = cancelStart
            ? new Date(cancelStart).toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
            : 'TBD';
          const detail = `${startLabel}${cancelLocation ? ` at ${cancelLocation}` : ''}${cancelReason ? ` — ${cancelReason}` : ''}`;

          const inAppPromise = (async () => {
            const notifications = userIds.map((uid) => ({
              user_id: uid,
              event_id: eventId,
              notification_type: 'event_cancelled',
              title: `Cancelled: ${cancelTitle}`,
              message: detail,
              action_url: `/golf/dashboard/calendar?event=${eventId}`,
            }));
            const { error: notifError } = await fromUntyped(adminClient, 'golf_calendar_notifications')
              .upsert(notifications, { onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: false });
            if (notifError) {
              await logServerError(`deleteGolfEvent cancellation notification insert failed: ${notifError.message}`, {
                action: 'deleteGolfEvent.insertNotifications',
                featureArea: 'events',
                extra: { eventId },
              });
            }
          })();

          const emailPromise = (async () => {
            const { sendEmailNotification } = await import('@/lib/notifications/email');
            const { data: userRows } = await adminClient
              .from('users')
              .select('id, email')
              .in('id', userIds);
            const recipients = (userRows ?? [])
              .filter((u) => Boolean(u.email))
              .map((u) => ({ id: u.id, email: u.email as string }));
            if (recipients.length === 0) return;
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';
            const results = await Promise.allSettled(
              recipients.map((u) =>
                sendEmailNotification('team_announcement', u.id, u.email, {
                  title: `Event cancelled: ${cancelTitle}`,
                  content: `This event has been cancelled. ${detail}`,
                  announcementUrl: `${baseUrl}/golf/dashboard/calendar`,
                })
              )
            );
            const failed = results.filter((r) => r.status === 'rejected').length;
            if (failed > 0) {
              await logServerError(`deleteGolfEvent cancellation email failed for ${failed}/${recipients.length} recipients`, {
                action: 'deleteGolfEvent.emailNotification',
                featureArea: 'events',
                extra: { eventId },
              });
            }
          })();

          const channelResults = await Promise.allSettled([inAppPromise, emailPromise]);
          for (const result of channelResults) {
            if (result.status === 'rejected') {
              await logServerError(`deleteGolfEvent cancellation fan-out failed: ${describeError(result.reason)}`, {
                action: 'deleteGolfEvent.cancellationFanOut',
                featureArea: 'events',
                extra: { eventId },
              });
            }
          }
        } catch (notifErr) {
          await logServerError(`deleteGolfEvent cancellation notify failed: ${describeError(notifErr)}`, {
            action: 'deleteGolfEvent.cancellationNotify',
            featureArea: 'events',
            extra: { eventId },
          });
        }
      });
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.CALENDAR);
    return { success: true };

  } catch (err) {
    // Previously fully bare (no error binding at all) — a calendar-delete
    // critical path with a real bug had zero Bridge/Sentry signal.
    void logServerException(err, { action: 'golf.deleteGolfEvent.unexpected', featureArea: 'calendar' }, 'error');
    return { success: false, error: 'An unexpected error occurred' };
  }
}
const observedDeleteGolfEvent = withAdminObserved(
  'deleteGolfEvent',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  deleteGolfEventImpl,
);
export async function deleteGolfEvent(
  eventId: string,
  options?: DeleteGolfEventOptions
): Promise<{ success: boolean; error?: string }> {
  return observedDeleteGolfEvent(eventId, options);
}
/**
 * Permanently delete an event. Gated: only allowed when the event is already
 * cancelled OR has zero attendance rows (see deleteGolfEvent).
 */
async function deleteGolfEventPermanentlyImpl(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  return deleteGolfEvent(eventId, { hard: true });
}
const observedDeleteGolfEventPermanently = withAdminObserved(
  'deleteGolfEventPermanently',
  { demoSafe: true, sport: 'golf', feature: 'calendar_events' },
  deleteGolfEventPermanentlyImpl,
);
export async function deleteGolfEventPermanently(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  return observedDeleteGolfEventPermanently(eventId);
}
// ============================================================================
// RSVP & CALENDAR ACTIONS
// ============================================================================

/**
 * Player responds to an event invitation
 */
/**
 * Player self-RSVP.
 *
 * 2026-06-10 (audit findings #8, #16):
 * - Authz is team membership, not a pre-seeded invite: any ACTIVE member of
 *   the event's team may RSVP. The write is an upsert on
 *   (event_id, player_id) — the golf_event_attendance_insert_self RLS policy
 *   (live) lets a player INSERT their own row, so whole-team events no longer
 *   hard-error for players the coach didn't pre-pick.
 * - Locks: RSVPs are rejected after the event starts and after rsvp_deadline
 *   (enforced inside updateRSVP). Failures carry a machine-readable `code`
 *   the UI can branch on.
 */
async function respondToEventImpl(
  eventId: string,
  status: 'pending' | 'accepted' | 'declined' | 'tentative'
): Promise<RespondToEventResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // The three reads below decide what a player is told when they tap Going.
    // Refusing on a failed read is right — RSVP is authorized here as well as
    // at the DB, and a check that could not run must not pass. What each one
    // must NOT do is dress a failure up as a finding: this path otherwise
    // tells a player with a profile "Player profile not found", tells them the
    // event they are looking at does not exist, or tells an active member of
    // the team that only active members may RSVP. All three read as the app
    // having lost them, and none suggests trying again.
    const UNREADABLE = "Couldn't check your RSVP for this event. Please try again.";

    // Get player ID
    const { data: player, error: playerError } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (playerError && playerError.code !== 'PGRST116') {
      await logServerError(
        `RSVP player read failed: ${describeError(playerError)}`,
        { action: 'golf.respondToEvent', featureArea: 'calendar' },
        'warning'
      );
      return { success: false, error: UNREADABLE };
    }

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Authorize: the event must be visible and the caller must be an ACTIVE
    // member of its team. The RLS INSERT policy enforces the same rule at the
    // DB — this check exists to return a typed, renderable error instead of a
    // generic write failure.
    const { data: event, error: eventError } = await supabase
      .from('golf_events')
      .select('id, team_id, event_type, description')
      .eq('id', eventId)
      .maybeSingle();

    if (eventError) {
      await logServerError(
        `RSVP event read failed for ${eventId}: ${describeError(eventError)}`,
        { action: 'golf.respondToEvent', featureArea: 'calendar' },
        'warning'
      );
      return { success: false, error: UNREADABLE };
    }

    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    // A synced class meeting is one player's personal commitment on the team
    // calendar, not an invitation (class-events.ts). It takes no RSVPs: an
    // attendance row on it was the only way a teammate could pull another
    // player's class — real title and all — into their own busy schedule.
    // `isClassEvent` also honours the `[class:<id>]` tag so a row with a stale
    // event_type is refused the same way every read path already treats it.
    if (isClassEvent(event)) {
      return { success: false, error: 'Class meetings don\'t take RSVPs.', code: 'class_meeting' };
    }

    const { data: membership, error: membershipError } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('team_id', event.team_id)
      .eq('player_id', player.id)
      .eq('status', 'active')
      .maybeSingle();

    if (membershipError) {
      await logServerError(
        `RSVP membership read failed for player ${player.id}: ${describeError(membershipError)}`,
        { action: 'golf.respondToEvent', featureArea: 'calendar' },
        'warning'
      );
      return { success: false, error: UNREADABLE };
    }

    if (!membership) {
      return {
        success: false,
        error: "Only active members of this event's team can RSVP.",
        code: 'not_team_member',
      };
    }

    const { updateRSVP, RSVPDeadlinePassedError, RSVPLockedError } = await import('@/lib/calendar/rsvp');
    const { WriteIntegrityError } = await import('@/lib/calendar/write-integrity');
    try {
      await updateRSVP(eventId, player.id, status, supabase);
    } catch (err) {
      if (err instanceof RSVPDeadlinePassedError) {
        return { success: false, error: 'RSVP deadline has passed for this event.', code: 'rsvp_deadline_passed' };
      }
      if (err instanceof RSVPLockedError) {
        const message = err.code === 'event_cancelled'
          ? 'This event has been cancelled — RSVPs are closed.'
          : 'This event has already started — RSVPs are locked.';
        // Lib code 'deadline_passed' is unreachable here (caught above) but
        // map it anyway so the union stays exhaustive.
        const code: RSVPErrorCode = err.code === 'deadline_passed' ? 'rsvp_deadline_passed' : err.code;
        return { success: false, error: message, code };
      }
      // 2026-05-17: closes audit Finding 4 + Q-NEW-14. Previously this
      // catch was bare (`catch {}`) — every error returned the same
      // "Failed to update RSVP" string with nothing logged. Now we
      // discriminate, log via logServerError with context, and tell the
      // user something useful when RLS / a constraint denies the write.
      if (err instanceof WriteIntegrityError) {
        await logServerError(`respondToEvent: ${err.message}`, {
          action: 'respondToEvent.writeIntegrity',
          featureArea: 'calendar',
          playerId: player.id,
          extra: { eventId, status, underlying: err.underlying },
        }, 'warning');
        return {
          success: false,
          error: 'Could not record your RSVP. Please try again or contact your coach.',
          code: 'write_failed',
        };
      }
      throw err;
    }

    revalidatePath('/golf/dashboard/calendar');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.CALENDAR);
    return { success: true, data: undefined };

  } catch (err) {
    await logServerError(`respondToEvent failed: ${describeError(err)}`, {
      action: 'respondToEvent.unexpected',
      featureArea: 'calendar',
      extra: { stack: err instanceof Error ? err.stack : undefined },
    }, 'warning');
    return { success: false, error: 'Failed to update RSVP', code: 'write_failed' };
  }
}
const observedRespondToEvent = withAdminObserved(
  'respondToEvent',
  { sport: 'golf', feature: 'calendar_events' },
  respondToEventImpl,
);
export async function respondToEvent(
  eventId: string,
  status: 'pending' | 'accepted' | 'declined' | 'tentative'
): Promise<RespondToEventResult> {
  return observedRespondToEvent(eventId, status);
}
/**
 * Coach-triggered reminder: drops in-app rows into golf_calendar_notifications
 * for the supplied players, deduplicated against the cron-generated reminders
 * by a distinct notification_type. Use admin client because notifications are
 * inserted on behalf of other users.
 */
async function sendEventReminderToPlayersImpl(
  eventId: string,
  playerIds: string[],
): Promise<ActionResult<{ sent: number }>> {
  if (!eventId || playerIds.length === 0) {
    return { success: false, error: 'Event id and at least one player required' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: event } = await supabase
      .from('golf_events')
      .select('id, title, start_time, location, team_id')
      .eq('id', eventId)
      .maybeSingle();
    if (!event) return { success: false, error: 'Event not found' };

    // Authorize: caller must coach this event's team. Without this gate any
    // authenticated user could spam reminders into any team's notification
    // table (we use the admin client below, which bypasses RLS).
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) {
      return { success: false, error: 'Only this team\'s coaches can send reminders' };
    }
    const { data: staffRow } = await supabase
      .from('golf_team_coach_staff')
      .select('id')
      .eq('team_id', event.team_id)
      .eq('coach_id', coach.id)
      .maybeSingle();
    if (!staffRow) {
      return { success: false, error: 'Only this team\'s coaches can send reminders' };
    }

    // Restrict the recipient set to players who actually belong to this
    // event's team. Without this, a coach of team A could pass arbitrary
    // playerIds (e.g. UUIDs from team B) and admin-bypass-insert
    // notifications targeting other teams' players.
    const { data: teamPlayers, error: teamPlayersError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', event.team_id)
      .eq('status', 'active')
      .in('player_id', playerIds);

    // Scoping to the event's team must FAIL CLOSED — that is the point of this
    // read and it is kept. What was wrong is that it failed closed while
    // reporting `success: true, sent: 0`: the coach is told the send worked
    // and that it reached nobody, in the same breath, and no player gets the
    // reminder for an event they are expected to attend.
    //
    // Third instance of this shape found today, after the announcements roster
    // read and createTaskFromTemplate. Sending to nobody is never a success.
    if (teamPlayersError) {
      await logServerError(
        `[notifyEventPlayers] recipient scoping read failed — nothing was sent: ${describeError(teamPlayersError)}`,
        { action: 'golf.notifyEventPlayers', featureArea: 'calendar' },
      );
      return { success: false, error: "Couldn't confirm who to notify, so nothing was sent. Please try again." };
    }

    const allowedPlayerIds = (teamPlayers ?? [])
      .map((m) => m.player_id)
      .filter((id): id is string => Boolean(id));
    if (allowedPlayerIds.length === 0) {
      return { success: true, data: { sent: 0 } };
    }

    const { data: players, error: playersError } = await supabase
      .from('golf_players')
      .select('id, user_id')
      .in('id', allowedPlayerIds);

    if (playersError) {
      await logServerError(
        `[notifyEventPlayers] player lookup failed — nothing was sent: ${describeError(playersError)}`,
        { action: 'golf.notifyEventPlayers', featureArea: 'calendar' },
      );
      return { success: false, error: "Couldn't confirm who to notify, so nothing was sent. Please try again." };
    }

    const userIds = (players ?? [])
      .map((p) => p.user_id)
      .filter((u): u is string => Boolean(u));
    if (userIds.length === 0) {
      return { success: true, data: { sent: 0 } };
    }

    const start = new Date(event.start_time);
    const timeStr = start.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const message = event.location
      ? `${timeStr} at ${event.location}`
      : timeStr;

    const { createAdminClient } = await import('@/lib/supabase/admin');
    const adminClient = createAdminClient();

    const rows = userIds.map((uid) => ({
      user_id: uid,
      event_id: eventId,
      notification_type: 'event_reminder_manual' as const,
      title: `Reminder: ${event.title}`,
      message,
      action_url: `/golf/dashboard/calendar?event=${eventId}`,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (adminClient as any)
      .from('golf_calendar_notifications')
      .upsert(rows, {
        onConflict: 'event_id,user_id,notification_type',
        ignoreDuplicates: false,
      });

    if (error) {
      await logServerError(`sendEventReminderToPlayers failed: ${error.message}`, {
        action: 'sendEventReminderToPlayers',
        featureArea: 'calendar',
        extra: { eventId, count: userIds.length },
      });
      return { success: false, error: 'Failed to send reminders' };
    }

    revalidatePath('/golf/dashboard/calendar');
    revalidatePath('/golf/dashboard/notifications');
    return { success: true, data: { sent: userIds.length } };
  } catch (err) {
    await logServerError(`sendEventReminderToPlayers error: ${describeError(err)}`, {
      action: 'sendEventReminderToPlayers',
      featureArea: 'calendar',
      extra: { eventId },
    });
    return { success: false, error: 'Failed to send reminders' };
  }
}
const observedSendEventReminderToPlayers = withAdminObserved(
  'sendEventReminderToPlayers',
  { sport: 'golf', feature: 'calendar_events' },
  sendEventReminderToPlayersImpl,
);
export async function sendEventReminderToPlayers(
  eventId: string,
  playerIds: string[],
): Promise<ActionResult<{ sent: number }>> {
  return observedSendEventReminderToPlayers(eventId, playerIds);
}
/**
 * Check for scheduling conflicts when creating/editing an event
 */
/**
 * Restrict a conflict check to people the caller actually shares a team with.
 *
 * `attendeeIds` are golf_players TABLE ids — NOT auth user ids. The comment
 * that previously said "auth user ids" was the bug: the editor's roster picker
 * sends `golf_players.id` (calendar page selects `golf_players(id, ...)`), and
 * the conflict library filters `golf_players .in('id', attendeeIds)` — so the
 * ids were always player ids end to end. This gate compared them against a set
 * of USER ids, which contains no player id, ever, so every conflict check with
 * at least one attendee was denied for every coach from the moment the gate
 * shipped. Caught in the Bridge 2026-08-20 19:03Z: the Guilford HEAD COACH
 * told "Not authorized to check availability for these people" about his own
 * roster.
 *
 * The allowed set is therefore the PLAYER ids on the caller's teams — staffed
 * teams if they are a coach, joined teams if they are a player, both if both.
 * (The picker offers only players, so coach ids never appear in the list.)
 *
 * Fails CLOSED on a failed read, and says so separately from a real denial — a
 * coach whose roster read timed out must be told to retry, not told their own
 * athletes are strangers.
 */
async function resolveSharedScheduleScope(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  attendeeIds: string[],
  /** The event being edited, when there is one. Its existing attendees are in
   * scope even if they have since left the roster — see the note below. */
  excludeEventId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const requested = [...new Set(attendeeIds.filter(Boolean))].filter((id) => id !== userId);
  if (requested.length === 0) return { ok: true };

  const RETRY = "Couldn't verify your team just now. Please try again.";
  const DENIED = 'Not authorized to check availability for these people';

  const [{ data: coachRows, error: coachErr }, { data: playerRows, error: playerErr }] =
    await Promise.all([
      supabase.from('golf_coaches').select('id').eq('user_id', userId),
      supabase.from('golf_players').select('id').eq('user_id', userId),
    ]);
  if (coachErr || playerErr) return { ok: false, error: RETRY };

  const coachIds = (coachRows ?? []).map((r) => r.id);
  const playerIds = (playerRows ?? []).map((r) => r.id);

  const [staffTeams, memberTeams] = await Promise.all([
    coachIds.length
      ? supabase.from('golf_team_coach_staff').select('team_id').in('coach_id', coachIds)
      : Promise.resolve({ data: [] as Array<{ team_id: string }>, error: null }),
    playerIds.length
      ? supabase.from('golf_team_members').select('team_id').in('player_id', playerIds)
      : Promise.resolve({ data: [] as Array<{ team_id: string }>, error: null }),
  ]);
  if (staffTeams.error || memberTeams.error) return { ok: false, error: RETRY };

  const teamIds = [
    ...new Set([
      ...(staffTeams.data ?? []).map((r) => r.team_id),
      ...(memberTeams.data ?? []).map((r) => r.team_id),
    ]),
  ].filter((t): t is string => Boolean(t));

  if (teamIds.length === 0) return { ok: false, error: DENIED };

  const teamPlayers = await supabase
    .from('golf_team_members')
    .select('player_id')
    .in('team_id', teamIds);
  if (teamPlayers.error) return { ok: false, error: RETRY };

  // PLAYER-table ids, matching what the client sends and what
  // checkEventConflicts filters on. The caller's own player ids are included
  // so a player checking their own availability passes without a roster row
  // lookup ordering hazard.
  const allowed = new Set<string>(playerIds);
  for (const row of teamPlayers.data ?? []) {
    if (row.player_id) allowed.add(row.player_id);
  }

  // PLAYERS WHO HAVE LEFT THE TEAM ARE STILL ON THE EVENTS THEY ATTENDED.
  //
  // The roster is current; an event's attendee list is historical. When a coach
  // opens an existing event the editor seeds attendeeIds from that event, so a
  // single departed player makes every event they ever attended un-checkable —
  // the whole conflict check is denied, not just their row.
  //
  // Measured 2026-09-01 on the Guilford team: 12 current members, but 41 events
  // carrying attendance rows for 2 players with zero team rows left. That is
  // the SAME denial message as the 2026-08-20 user-id/player-id bug and a
  // completely different cause — worth stating, because the message alone sent
  // the last reader to the wrong fix.
  //
  // Widening to "already attending the event under edit" keeps the gate's
  // point intact: it still refuses an arbitrary id list, and the widening is
  // bounded by an event the caller's own team owns, which they can already see
  // in the UI. It is not a general escape hatch.
  if (excludeEventId) {
    const existing = await supabase
      .from('golf_event_attendance')
      .select('player_id, golf_events!inner(team_id)')
      .eq('event_id', excludeEventId)
      .in('golf_events.team_id', teamIds);
    if (existing.error) return { ok: false, error: RETRY };
    for (const row of (existing.data ?? []) as Array<{ player_id: string | null }>) {
      if (row.player_id) allowed.add(row.player_id);
    }
  }

  if (requested.some((id) => !allowed.has(id))) return { ok: false, error: DENIED };
  return { ok: true };
}
async function checkScheduleConflictsImpl(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  attendeeIds: string[],
  excludeEventId?: string,
  /** Client timezone offset (Date.getTimezoneOffset() minutes). When provided,
   * the proposed window is anchored to the coach's wall clock instead of the
   * server's (audit finding #7 — server-TZ parse made the comparison window
   * drift against UTC-stored timed events). Omitted → UTC, which matches the
   * previous prod behavior deterministically. */
  timezoneOffset?: number,
  allDay = false
): Promise<ActionResult<ConflictResult>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // `attendeeIds` are auth user ids, and authentication was the only gate on
    // them. checkEventConflicts returns each attendee's NAME, AVATAR and the
    // TITLE of whatever they are busy with — including class schedules — so an
    // arbitrary id list turned this into a scheduling oracle for anyone the
    // caller could name. The editor only ever offers roster members, so
    // requiring a shared team costs legitimate callers nothing.
    const scope = await resolveSharedScheduleScope(supabase, user.id, attendeeIds, excludeEventId);
    if (!scope.ok) {
      return { success: false, error: scope.error };
    }

    const effectiveEndDate = allDay
      ? new Date(new Date(`${endDate}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)
      : endDate;
    const start = new Date(buildDateTimeString(startDate, allDay ? '00:00' : startTime, timezoneOffset));
    const end = new Date(buildDateTimeString(effectiveEndDate, allDay ? '00:00' : endTime, timezoneOffset));
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) {
      return { success: false, error: 'Choose an end time after the start.' };
    }

    const { checkEventConflicts } = await import('@/lib/calendar/conflicts');
    const result = await checkEventConflicts(
      start,
      end,
      attendeeIds,
      supabase,
      { excludeEventId }
    );

    /**
     * Serialize Date objects to ISO strings for client transport.
     *
     * `checkEventConflicts` returns the alternative slots as `suggestedTimes`.
     * This action's client contract calls the same field `suggestions`, and the
     * mapping below used to READ `.suggestions` off the library result — a key
     * that type never had. It was therefore always `undefined || []`, so the
     * editor's suggested-time chips (which render from `conflicts.suggestions`)
     * could not appear even when the engine had found slots. The whole
     * "find a time" path was dead on a one-word mismatch, and the
     * `as unknown as` double cast is what stopped the compiler saying so.
     */
    const { getUserBusyPeriodsWithStatus, periodsOverlap } = await import('@/lib/calendar/availability');
    const own = await getUserBusyPeriodsWithStatus(user.id, start, end, supabase);
    const ownConflicts = own.periods.filter((period) =>
      (!excludeEventId || period.eventId !== excludeEventId) && periodsOverlap({ start, end }, period)
    ).map((period) => ({
      userId: user.id, userName: 'You',
      conflictingEvent: { id: period.eventId, title: period.title || 'Busy', type: period.type,
        start: period.start.toISOString(), end: period.end.toISOString() },
    }));
    const conflicts = [...result.conflicts.filter((conflict) => conflict.userId !== user.id).map((conflict) => ({
      ...conflict, conflictingEvent: { ...conflict.conflictingEvent,
        start: new Date(conflict.conflictingEvent.start).toISOString(),
        end: new Date(conflict.conflictingEvent.end).toISOString() },
    })), ...ownConflicts];
    // Suggestions must also be checked against the organizer's full window.
    const candidateSlots = result.partial || own.partial ? [] : result.suggestedTimes ?? [];
    const candidateOwn = candidateSlots.length ? await getUserBusyPeriodsWithStatus(user.id,
      new Date(Math.min(...candidateSlots.map((slot) => +new Date(slot.start)))),
      new Date(Math.max(...candidateSlots.map((slot) => +new Date(slot.end)))), supabase) : own;
    const serialized: ConflictResult = {
      hasConflict: conflicts.length > 0,
      partial: Boolean(result.partial || own.partial || candidateOwn.partial), conflicts,
      suggestions: candidateOwn.partial ? [] : candidateSlots.filter((slot) => !candidateOwn.periods.some((period) =>
        (!excludeEventId || period.eventId !== excludeEventId) && periodsOverlap(slot, period)
      )).map((slot) => ({ start: new Date(slot.start).toISOString(), end: new Date(slot.end).toISOString() })),
    };
    return { success: true, data: serialized };

  } catch {
    return { success: false, error: 'Failed to check conflicts' };
  }
}
const observedCheckScheduleConflicts = withAdminObserved(
  'checkScheduleConflicts',
  { sport: 'golf', feature: 'calendar_events' },
  checkScheduleConflictsImpl,
);
export async function checkScheduleConflicts(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  attendeeIds: string[],
  excludeEventId?: string,
  timezoneOffset?: number,
  allDay = false
): Promise<ActionResult<ConflictResult>> {
  return observedCheckScheduleConflicts(startDate, startTime, endDate, endTime, attendeeIds, excludeEventId, timezoneOffset, allDay);
}
/**
 * Get availability for a specific player on a specific date
 * Used for the availability day view overlay
 */
async function getPlayerAvailabilityImpl(
  memberId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  /** Client timezone offset (Date.getTimezoneOffset() minutes). Anchors the
   * day window to the viewer's local day; omitted → UTC day (deterministic,
   * matches previous prod behavior). */
  timezoneOffset?: number
): Promise<ActionResult<SerializedBusyPeriod[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // First, check if this is a player
    const { data: player } = await supabase
      .from('golf_players')
      .select('user_id')
      .eq('id', memberId)
      .maybeSingle();

    let userId: string | null = player?.user_id || null;

    // If not a player, check if it's a coach
    if (!userId) {
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('user_id')
        .eq('id', memberId)
        .maybeSingle();

      userId = coach?.user_id || null;
    }

    if (!userId) {
      return { success: false, error: 'Team member not found' };
    }

    // Defense-in-depth: require the caller to share at least one team with
    // the target before exposing busy periods. RLS on the underlying tables
    // already protects most surfaces, but golf_player_classes has its own
    // policy and an explicit overlap check stops cross-team probing at the
    // action layer.
    const { data: callerCoach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: callerPlayer } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const callerTeamIds = new Set<string>();
    if (callerCoach?.organization_id) {
      const { data: coachTeams } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', callerCoach.organization_id);
      for (const t of coachTeams ?? []) callerTeamIds.add(t.id as string);
    }
    if (callerPlayer) {
      const { data: playerTeams } = await supabase
        .from('golf_team_members')
        .select('team_id')
        .eq('player_id', callerPlayer.id)
        .eq('status', 'active');
      for (const m of playerTeams ?? []) {
        if (m.team_id) callerTeamIds.add(m.team_id as string);
      }
    }

    const targetTeamIds = new Set<string>();
    const { data: targetPlayerRow } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (targetPlayerRow) {
      const { data: targetMemberships } = await supabase
        .from('golf_team_members')
        .select('team_id')
        .eq('player_id', targetPlayerRow.id)
        .eq('status', 'active');
      for (const m of targetMemberships ?? []) {
        if (m.team_id) targetTeamIds.add(m.team_id as string);
      }
    }
    const { data: targetCoachRow } = await supabase
      .from('golf_coaches')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (targetCoachRow?.organization_id) {
      const { data: targetCoachTeams } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', targetCoachRow.organization_id);
      for (const t of targetCoachTeams ?? []) targetTeamIds.add(t.id as string);
    }

    const sharesTeam = Array.from(callerTeamIds).some((id) => targetTeamIds.has(id));
    if (!sharesTeam) {
      return { success: false, error: 'Not authorized to view this schedule' };
    }

    // Deterministic window bounds — the old bare `new Date('...T00:00:00')`
    // parsed in the SERVER's timezone (audit finding #7).
    const dayStart = new Date(buildDateTimeString(startDate, '00:00:00', timezoneOffset));
    const dayEnd = new Date(buildDateTimeString(endDate, '23:59:59', timezoneOffset));

    const { getUserBusyPeriods } = await import('@/lib/calendar/availability');
    const busyPeriods = await getUserBusyPeriods(
      userId,
      dayStart,
      dayEnd,
      supabase
    );

    // Convert to serializable format
    const serialized = busyPeriods.map(period => ({
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      type: period.type,
      title: period.title,
      eventId: period.eventId,
    }));

    return { success: true, data: serialized };

  } catch {
    return { success: false, error: 'Failed to get availability' };
  }
}
const observedGetPlayerAvailability = withAdminObserved(
  'getPlayerAvailability',
  { sport: 'golf', feature: 'calendar_events' },
  getPlayerAvailabilityImpl,
);
export async function getPlayerAvailability(
  memberId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  timezoneOffset?: number
): Promise<ActionResult<SerializedBusyPeriod[]>> {
  return observedGetPlayerAvailability(memberId, startDate, endDate, timezoneOffset);
}
/**
 * Get the current user's busy periods (works for both coaches and players)
 * Used to show YOUR schedule when viewing availability alongside a team member
 */
async function getCurrentUserBusyPeriodsImpl(
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  /** Client timezone offset (Date.getTimezoneOffset() minutes) — see
   * getPlayerAvailability. */
  timezoneOffset?: number
): Promise<ActionResult<SerializedBusyPeriod[]>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const dayStart = new Date(buildDateTimeString(startDate, '00:00:00', timezoneOffset));
    const dayEnd = new Date(buildDateTimeString(endDate, '23:59:59', timezoneOffset));

    const { getUserBusyPeriods } = await import('@/lib/calendar/availability');
    const busyPeriods = await getUserBusyPeriods(
      user.id,
      dayStart,
      dayEnd,
      supabase
    );

    // Convert to serializable format
    const serialized = busyPeriods.map(period => ({
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      type: period.type,
      title: period.title,
      eventId: period.eventId,
    }));

    return { success: true, data: serialized };

  } catch {
    return { success: false, error: 'Failed to get availability' };
  }
}
const observedGetCurrentUserBusyPeriods = withAdminObserved(
  'getCurrentUserBusyPeriods',
  { sport: 'golf', feature: 'calendar_events' },
  getCurrentUserBusyPeriodsImpl,
);
export async function getCurrentUserBusyPeriods(
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  timezoneOffset?: number
): Promise<ActionResult<SerializedBusyPeriod[]>> {
  return observedGetCurrentUserBusyPeriods(startDate, endDate, timezoneOffset);
}
/**
 * Get pending event invitations for the current player
 */
async function getPendingInvitationsImpl(): Promise<ActionResult<EventInvitation[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get player ID
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    const { getPlayerPendingInvitations } = await import('@/lib/calendar/rsvp');
    const invitations = await getPlayerPendingInvitations(player.id, supabase);

    return { success: true, data: invitations };

  } catch {
    return { success: false, error: 'Failed to fetch invitations' };
  }
}
const observedGetPendingInvitations = withAdminObserved(
  'getPendingInvitations',
  { sport: 'golf', feature: 'roster_management' },
  getPendingInvitationsImpl,
);
export async function getPendingInvitations(): Promise<ActionResult<EventInvitation[]>> {
  return observedGetPendingInvitations();
}
/**
 * Get the current player's RSVP status for an event
 */
async function getPlayerEventRSVPImpl(
  eventId: string
): Promise<ActionResult<{ status: RSVPStatus; respondedAt: string | null } | null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Note: golf_event_attendance uses rsvp_at, not responded_at
    const { data: attendance } = await supabase
      .from('golf_event_attendance')
      .select('status, rsvp_at')
      .eq('event_id', eventId)
      .eq('player_id', player.id)
      .maybeSingle();

    if (!attendance) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        status: (attendance.status ?? 'pending') as RSVPStatus,
        respondedAt: attendance.rsvp_at ?? null,
      },
    };
  } catch {
    return { success: false, error: 'Failed to fetch RSVP status' };
  }
}
const observedGetPlayerEventRSVP = withAdminObserved(
  'getPlayerEventRSVP',
  { sport: 'golf', feature: 'calendar_events' },
  getPlayerEventRSVPImpl,
);
export async function getPlayerEventRSVP(
  eventId: string
): Promise<ActionResult<{ status: RSVPStatus; respondedAt: string | null } | null>> {
  return observedGetPlayerEventRSVP(eventId);
}
/**
 * Get RSVP summary for an event (coach view)
 */
async function getEventRSVPImpl(eventId: string): Promise<ActionResult<RSVPStats>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { getEventRSVPStats } = await import('@/lib/calendar/rsvp');
    const stats = await getEventRSVPStats(eventId, supabase);

    return { success: true, data: stats };

  } catch {
    return { success: false, error: 'Failed to fetch RSVP data' };
  }
}
const observedGetEventRSVP = withAdminObserved(
  'getEventRSVP',
  { sport: 'golf', feature: 'calendar_events' },
  getEventRSVPImpl,
);
export async function getEventRSVP(eventId: string): Promise<ActionResult<RSVPStats>> {
  return observedGetEventRSVP(eventId);
}
