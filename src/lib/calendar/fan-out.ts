import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * The post-response notification fan-outs a calendar write starts in `after()`, extracted from createGolfEvent and
 * deleteGolfEvent (P-5 WP-P5) so a tournament made from the calendar sends through the same code. No behaviour change:
 * the reads, the recipients, the three channels and every log line are what the two actions ran inline.
 *
 * Both run with the admin client (the request-scoped client is not guaranteed usable once the response has flushed),
 * and neither can fail the request: a failure is logged, never thrown.
 */

export interface EventInvitationFanOut {
  eventId: string;
  teamId: string;
  title: string;
  /** The date text the in-app row and the email show ("2026-11-05", or a tournament's range). */
  dateLabel: string;
  location: string;
  /** Only these players are told (Q-108); empty tells no one. */
  inviteeIds: ReadonlySet<string>;
  /** In-app title; the create path's own is `New event: <title>`. */
  inAppTitle?: string;
  /** In-app message; the create path's own is `<date> at <location>`. */
  inAppMessage?: string;
}

/** Notify a new event's invited players: in-app, email and push (createGolfEvent's fan-out, unchanged). */
export async function fanOutEventInvitation(p: EventInvitationFanOut): Promise<void> {
  if (p.inviteeIds.size === 0) return;
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
      .eq('team_id', p.teamId)
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
      .filter((id): id is string => Boolean(id) && p.inviteeIds.has(id as string));
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
      .map((pl) => pl.user_id)
      .filter((id): id is string => Boolean(id));
    if (userIds.length === 0) return;

    // 1. In-app notifications (golf_calendar_notifications)
    const inAppPromise = (async () => {
      const notifications = userIds.map((uid) => ({
        user_id: uid,
        event_id: p.eventId,
        notification_type: 'event_invitation',
        title: p.inAppTitle ?? `New event: ${p.title}`,
        message: p.inAppMessage ?? `${p.dateLabel}${p.location ? ` at ${p.location}` : ''}`,
        action_url: `/golf/dashboard/calendar`,
      }));
      const { error: notifError } = await adminClient.from('golf_calendar_notifications')
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
            eventName: p.title,
            eventDate: p.dateLabel,
            location: p.location,
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
        eventName: p.title,
        eventId: p.eventId,
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
          extra: { channel: channelNames[i], eventId: p.eventId },
        });
      }
    }
  } catch (notifErr) {
    await logServerError(`createGolfEvent notification creation failed: ${describeError(notifErr)}`, {
      action: 'createGolfEvent.notifications',
      featureArea: 'events',
    });
  }
}

export interface EventCancelledFanOut {
  eventId: string;
  teamId: string;
  title: string;
  startTime: string | null;
  location: string | null;
  reason: string;
  /** `golf_events.requires_rsvp` was on: only then is anyone told (owner, 2026-10-08). */
  notifies: boolean;
  /**
   * P-14 12.5 A (`changeMarksCapability().pushes`): P-14's push carries the change, so the in-app row is skipped and the
   * email kept, as updateGolfEvent/deleteGolfEvent do under it. Off (the default), both channels go as before.
   */
  skipInApp?: boolean;
}

/** Tell an event's invited players and the active team that it was cancelled: in-app and email (deleteGolfEvent's fan-out, unchanged). */
export async function fanOutEventCancelled(p: EventCancelledFanOut): Promise<void> {
  // Owner, 2026-10-08: RSVPs are off unless the coach turns them on, and players get no notification for an event
  // that doesn't ask for replies, including its cancellation.
  if (!p.notifies) return;
  const eventId = p.eventId;
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
      .eq('team_id', p.teamId)
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
        .map((pl) => pl.user_id)
        .filter((id): id is string => Boolean(id));
    }

    const userIds = [...new Set([...attendanceUserIds, ...teamUserIds])];
    if (userIds.length === 0) return;

    const startLabel = p.startTime
      ? new Date(p.startTime).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'TBD';
    const detail = `${startLabel}${p.location ? ` at ${p.location}` : ''}${p.reason ? ` — ${p.reason}` : ''}`;

    const inAppPromise = (async () => {
      if (p.skipInApp) return;
      const notifications = userIds.map((uid) => ({
        user_id: uid,
        event_id: eventId,
        notification_type: 'event_cancelled',
        title: `Cancelled: ${p.title}`,
        message: detail,
        action_url: `/golf/dashboard/calendar?event=${eventId}`,
      }));
      const { error: notifError } = await adminClient.from('golf_calendar_notifications')
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
            title: `Event cancelled: ${p.title}`,
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
}
