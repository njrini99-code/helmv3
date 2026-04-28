/**
 * Event-reminder cron.
 *
 * Drops in-app reminder rows into `golf_calendar_notifications` for upcoming
 * events. Two cadences:
 *   - `event_reminder_24h`: events starting in the next ~25h
 *   - `event_reminder_1h`:  events starting in the next ~75min
 *
 * Idempotency comes from the UNIQUE (event_id, user_id, notification_type)
 * constraint on golf_calendar_notifications, so re-running the cron is a
 * no-op once a reminder has been sent. Schedule lives in vercel.json.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const REMINDER_24H_MS = 25 * 60 * 60 * 1000;
const REMINDER_1H_MS = 75 * 60 * 1000;

type ReminderKind = 'event_reminder_24h' | 'event_reminder_1h';

interface EventRow {
  id: string;
  title: string;
  start_time: string;
  location: string | null;
}

interface AttendanceRow {
  event_id: string;
  player_id: string;
  status: string | null;
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  let inserted24h = 0;
  let inserted1h = 0;

  try {
    inserted24h = await dispatchReminders(supabase, now, REMINDER_24H_MS, 'event_reminder_24h');
    inserted1h = await dispatchReminders(supabase, now, REMINDER_1H_MS, 'event_reminder_1h');
  } catch (err) {
    await logServerError(
      `cron.eventReminders failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'cron.eventReminders', featureArea: 'calendar' },
      'error',
    );
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }

  if (inserted24h > 0 || inserted1h > 0) {
    await logServerEvent(
      `event_reminders cron inserted 24h=${inserted24h} 1h=${inserted1h}`,
      {
        action: 'cron.eventReminders.summary',
        featureArea: 'calendar',
        extra: { inserted24h, inserted1h },
      },
      'info',
    );
  }

  return NextResponse.json({ success: true, inserted24h, inserted1h });
}

async function dispatchReminders(
  supabase: ReturnType<typeof createAdminClient>,
  now: Date,
  windowMs: number,
  kind: ReminderKind,
): Promise<number> {
  const horizon = new Date(now.getTime() + windowMs).toISOString();
  const nowIso = now.toISOString();

  const { data: events, error: eventsErr } = await supabase
    .from('golf_events')
    .select('id, title, start_time, location')
    .gt('start_time', nowIso)
    .lte('start_time', horizon)
    .eq('is_cancelled', false)
    .limit(500);

  if (eventsErr) {
    throw new Error(`fetch events: ${eventsErr.message}`);
  }

  const eventRows = (events ?? []) as EventRow[];
  if (eventRows.length === 0) return 0;

  const eventIds = eventRows.map((e) => e.id);

  // Pull invited attendees in one shot. We deliberately reuse
  // golf_event_attendance rows (the table that holds invite state) rather
  // than re-deriving from team membership: a player who explicitly declined
  // shouldn't get a 1h reminder.
  const { data: attendance, error: attendanceErr } = await supabase
    .from('golf_event_attendance')
    .select('event_id, player_id, status')
    .in('event_id', eventIds);

  if (attendanceErr) {
    throw new Error(`fetch attendance: ${attendanceErr.message}`);
  }

  const attendanceRows = (attendance ?? []) as AttendanceRow[];
  // Skip declined; remind everyone else (pending, accepted, tentative).
  const eligible = attendanceRows.filter((a) => a.status !== 'declined');
  if (eligible.length === 0) return 0;

  const playerIds = Array.from(new Set(eligible.map((a) => a.player_id)));
  const { data: players, error: playersErr } = await supabase
    .from('golf_players')
    .select('id, user_id')
    .in('id', playerIds);

  if (playersErr) {
    throw new Error(`fetch players: ${playersErr.message}`);
  }

  const userIdByPlayerId = new Map<string, string>();
  for (const p of players ?? []) {
    if (p.user_id) userIdByPlayerId.set(p.id, p.user_id);
  }

  const eventById = new Map(eventRows.map((e) => [e.id, e]));

  const notifications: Array<{
    user_id: string;
    event_id: string;
    notification_type: ReminderKind;
    title: string;
    message: string;
    action_url: string;
  }> = [];

  for (const a of eligible) {
    const userId = userIdByPlayerId.get(a.player_id);
    const event = eventById.get(a.event_id);
    if (!userId || !event) continue;

    notifications.push({
      user_id: userId,
      event_id: a.event_id,
      notification_type: kind,
      title: kind === 'event_reminder_24h'
        ? `Tomorrow: ${event.title}`
        : `Starting soon: ${event.title}`,
      message: buildMessage(event, kind),
      action_url: `/golf/dashboard/calendar?event=${event.id}`,
    });
  }

  if (notifications.length === 0) return 0;

  const { data: insertedRows, error: insertErr } = await supabase
    .from('golf_calendar_notifications')
    .upsert(notifications, {
      onConflict: 'event_id,user_id,notification_type',
      ignoreDuplicates: true,
    })
    .select('user_id, event_id');

  if (insertErr) {
    throw new Error(`insert notifications: ${insertErr.message}`);
  }

  const inserted = (insertedRows ?? []) as Array<{ user_id: string; event_id: string }>;
  if (inserted.length === 0) return 0;

  // Fan out push + email per newly-inserted reminder. Only firing for the
  // users who actually got a NEW notification row keeps reminders idempotent
  // across cron ticks: an already-notified user never gets a second blast.
  void dispatchExternalChannels(inserted, eventById, kind).catch(() => {
    // Already logged inside the helper; swallow so the upsert success path
    // doesn't depend on email/push deliverability.
  });

  return inserted.length;
}

async function dispatchExternalChannels(
  inserted: Array<{ user_id: string; event_id: string }>,
  eventById: Map<string, EventRow>,
  kind: ReminderKind,
): Promise<void> {
  const userIdsByEvent = new Map<string, string[]>();
  for (const row of inserted) {
    if (!userIdsByEvent.has(row.event_id)) userIdsByEvent.set(row.event_id, []);
    userIdsByEvent.get(row.event_id)!.push(row.user_id);
  }

  const [{ sendBulkPushNotification }, { sendBulkEmailNotification }, { createAdminClient: createAdmin }] = await Promise.all([
    import('@/lib/notifications/push'),
    import('@/lib/notifications/email'),
    import('@/lib/supabase/admin'),
  ]);
  const adminClient = createAdmin();

  for (const [eventId, userIds] of userIdsByEvent) {
    const event = eventById.get(eventId);
    if (!event) continue;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';
    const start = new Date(event.start_time);
    const data: Record<string, unknown> = {
      eventName: event.title,
      eventDate: event.start_time,
      eventDateFormatted: start.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
      location: event.location || '',
      eventUrl: `${baseUrl}/golf/dashboard/calendar?event=${eventId}`,
      reminderWindow: kind === 'event_reminder_24h' ? '24h' : '1h',
    };

    void sendBulkPushNotification('event_rsvp_reminder', userIds, data).catch(() => {
      // Push failure is non-fatal; the in-app row is already inserted.
    });

    // Email needs each user's email address.
    const { data: userRows } = await adminClient
      .from('users')
      .select('id, email')
      .in('id', userIds);
    const recipients = (userRows ?? [])
      .filter((u) => u.email)
      .map((u) => ({ id: u.id as string, email: u.email as string }));
    if (recipients.length > 0) {
      void sendBulkEmailNotification('event_rsvp_reminder', recipients, data).catch(() => {
        // Email failure is non-fatal; logged inside helper.
      });
    }
  }
}

function buildMessage(event: EventRow, kind: ReminderKind): string {
  const start = new Date(event.start_time);
  const timeStr = start.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const locationStr = event.location ? ` at ${event.location}` : '';
  return kind === 'event_reminder_24h'
    ? `${timeStr}${locationStr}`
    : `Starts at ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${locationStr}`;
}
