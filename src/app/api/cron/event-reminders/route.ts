/**
 * Event-reminder cron.
 *
 * Sends reminders (in-app row + push + email) for upcoming events. Two
 * cadences, designed for an HOURLY schedule (`0 * * * *` in vercel.json):
 *   - `event_reminder_24h`: events starting in the next ~25h
 *   - `event_reminder_1h`:  events starting in the next ~75min
 *
 * Idempotency comes from the UNIQUE (event_id, user_id, notification_type)
 * constraint on golf_calendar_notifications. Ordering matters: the external
 * fan-out (push + email) is AWAITED first, and the reminder row is only
 * upserted for recipients whose sends succeeded. A failed or frozen send is
 * therefore NOT marked done and is retried on the next hourly tick; the
 * upsert's ignoreDuplicates keeps re-runs a no-op for already-reminded users.
 *
 * All fetches are paginated (PostgREST hard-caps responses at 1000 rows) and
 * id-lists are chunked to keep request URLs bounded.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { sendPushNotification } from '@/lib/notifications/push';
import { sendEmailNotification } from '@/lib/notifications/email';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { recordJobRun } from '@/lib/admin/job-log';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const REMINDER_24H_MS = 25 * 60 * 60 * 1000;
const REMINDER_1H_MS = 75 * 60 * 1000;

/** Stop launching new send batches past this point so the row upsert for
 * already-completed sends always lands within maxDuration (300s). Recipients
 * skipped at the deadline are simply not marked and retry next tick. */
const SOFT_DEADLINE_MS = 240 * 1000;

/** Recipients fanned out concurrently per batch. */
const SEND_CONCURRENCY = 8;

/** Max ids per `.in(...)` filter to keep request URLs bounded. */
const ID_CHUNK_SIZE = 200;

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

interface KindResult {
  sent: number;
  failed: number;
  skipped: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  return recordJobRun('event-reminders', async () => {
    const supabase = createAdminClient();
    const now = new Date();
    const deadlineAt = Date.now() + SOFT_DEADLINE_MS;

    // No initializers: the catch below returns, so these are definitely
    // assigned wherever they are read (also silences CodeQL useless-assignment).
    let result24h: KindResult;
    let result1h: KindResult;

    try {
      result24h = await dispatchReminders(supabase, now, REMINDER_24H_MS, 'event_reminder_24h', deadlineAt);
      result1h = await dispatchReminders(supabase, now, REMINDER_1H_MS, 'event_reminder_1h', deadlineAt);
    } catch (err) {
      await logServerError(
        `cron.eventReminders failed: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'cron.eventReminders', featureArea: 'calendar' },
        'error',
      );
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }

    const anyActivity =
      result24h.sent + result24h.failed + result24h.skipped +
      result1h.sent + result1h.failed + result1h.skipped > 0;

    if (anyActivity) {
      await logServerEvent(
        `event_reminders cron 24h sent=${result24h.sent} failed=${result24h.failed} ` +
        `1h sent=${result1h.sent} failed=${result1h.failed}`,
        {
          action: 'cron.eventReminders.summary',
          featureArea: 'calendar',
          extra: { result24h, result1h },
        },
        result24h.failed + result1h.failed > 0 ? 'warning' : 'info',
      );
    }

    return NextResponse.json({
      success: true,
      inserted24h: result24h.sent,
      inserted1h: result1h.sent,
      failed24h: result24h.failed,
      failed1h: result1h.failed,
      skipped24h: result24h.skipped,
      skipped1h: result1h.skipped,
    });
  });
}

async function dispatchReminders(
  supabase: ReturnType<typeof createAdminClient>,
  now: Date,
  windowMs: number,
  kind: ReminderKind,
  deadlineAt: number,
): Promise<KindResult> {
  const horizon = new Date(now.getTime() + windowMs).toISOString();
  const nowIso = now.toISOString();

  // Skip cancelled events. Schema uses cancelled_at (timestamp set when an
  // event is cancelled) plus a status enum that includes 'cancelled'. Both
  // are checked so we don't remind on either signal.
  // Paginated: this is a platform-wide fetch, so it can exceed the PostgREST
  // 1000-row cap once enough teams have events in the window.
  const { data: events, error: eventsErr } = await fetchAllRowsResult((from, to) =>
    supabase
      .from('golf_events')
      .select('id, title, start_time, location, cancelled_at, status')
      .gt('start_time', nowIso)
      .lte('start_time', horizon)
      .is('cancelled_at', null)
      .neq('status', 'cancelled')
      .order('id', { ascending: true })
      .range(from, to),
  );

  if (eventsErr) {
    throw new Error(`fetch events: ${eventsErr.message}`);
  }

  const eventRows = (events ?? []) as EventRow[];
  if (eventRows.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const eventIds = eventRows.map((e) => e.id);

  // Pull invited attendees, chunked + paginated. We deliberately reuse
  // golf_event_attendance rows (the table that holds invite state) rather
  // than re-deriving from team membership: a player who explicitly declined
  // shouldn't get a 1h reminder.
  const attendanceRows: AttendanceRow[] = [];
  for (const ids of chunk(eventIds, ID_CHUNK_SIZE)) {
    const { data: attendance, error: attendanceErr } = await fetchAllRowsResult((from, to) =>
      supabase
        .from('golf_event_attendance')
        .select('event_id, player_id, status')
        .in('event_id', ids)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (attendanceErr) {
      throw new Error(`fetch attendance: ${attendanceErr.message}`);
    }
    attendanceRows.push(...((attendance ?? []) as AttendanceRow[]));
  }

  // Skip declined; remind everyone else (pending, accepted, tentative).
  const eligible = attendanceRows.filter((a) => a.status !== 'declined');
  if (eligible.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const playerIds = Array.from(new Set(eligible.map((a) => a.player_id)));
  const userIdByPlayerId = new Map<string, string>();
  for (const ids of chunk(playerIds, ID_CHUNK_SIZE)) {
    const { data: players, error: playersErr } = await fetchAllRowsResult((from, to) =>
      supabase
        .from('golf_players')
        .select('id, user_id')
        .in('id', ids)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (playersErr) {
      throw new Error(`fetch players: ${playersErr.message}`);
    }
    for (const p of players ?? []) {
      if (p.user_id) userIdByPlayerId.set(p.id, p.user_id);
    }
  }

  const eventById = new Map(eventRows.map((e) => [e.id, e]));

  // Already-reminded (event, user) pairs for this cadence. Sends happen BEFORE
  // the reminder row lands, so this read (not the upsert) is what dedupes
  // across hourly ticks.
  const alreadySent = new Set<string>();
  for (const ids of chunk(eventIds, ID_CHUNK_SIZE)) {
    const { data: existing, error: existingErr } = await fetchAllRowsResult((from, to) =>
      supabase
        .from('golf_calendar_notifications')
        .select('event_id, user_id')
        .eq('notification_type', kind)
        .in('event_id', ids)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (existingErr) {
      throw new Error(`fetch existing notifications: ${existingErr.message}`);
    }
    for (const row of existing ?? []) {
      alreadySent.add(`${row.event_id}:${row.user_id}`);
    }
  }

  interface Recipient {
    userId: string;
    event: EventRow;
  }

  const pending: Recipient[] = [];
  const seen = new Set<string>();
  for (const a of eligible) {
    const userId = userIdByPlayerId.get(a.player_id);
    const event = eventById.get(a.event_id);
    if (!userId || !event) continue;
    const key = `${a.event_id}:${userId}`;
    if (alreadySent.has(key) || seen.has(key)) continue;
    seen.add(key);
    pending.push({ userId, event });
  }

  if (pending.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  // Email needs each user's address; fetch once for the whole pending set.
  const pendingUserIds = Array.from(new Set(pending.map((r) => r.userId)));
  const emailByUserId = new Map<string, string>();
  for (const ids of chunk(pendingUserIds, ID_CHUNK_SIZE)) {
    const { data: userRows, error: usersErr } = await fetchAllRowsResult((from, to) =>
      supabase
        .from('users')
        .select('id, email')
        .in('id', ids)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (usersErr) {
      throw new Error(`fetch users: ${usersErr.message}`);
    }
    for (const u of userRows ?? []) {
      if (u.email) emailByUserId.set(u.id, u.email);
    }
  }

  // Fan out push + email per recipient, awaited in bounded-concurrency
  // batches. Only recipients whose sends fully succeed get a reminder row;
  // failures (and deadline-skipped recipients) stay unmarked and are
  // retried on the next hourly tick.
  const succeeded: Recipient[] = [];
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < pending.length; i += SEND_CONCURRENCY) {
    if (Date.now() >= deadlineAt) {
      skipped += pending.length - i;
      break;
    }
    const batch = pending.slice(i, i + SEND_CONCURRENCY);
    const outcomes = await Promise.allSettled(
      batch.map((recipient) => sendReminderToRecipient(recipient.userId, recipient.event, kind, emailByUserId)),
    );
    outcomes.forEach((outcome, idx) => {
      const recipient = batch[idx];
      if (!recipient) return;
      if (outcome.status === 'fulfilled' && outcome.value) {
        succeeded.push(recipient);
      } else {
        failed += 1;
      }
    });
  }

  if (succeeded.length === 0) return { sent: 0, failed, skipped };

  const notifications = succeeded.map(({ userId, event }) => ({
    user_id: userId,
    event_id: event.id,
    notification_type: kind,
    title: kind === 'event_reminder_24h'
      ? `Tomorrow: ${event.title}`
      : `Starting soon: ${event.title}`,
    message: buildMessage(event, kind),
    action_url: `/golf/dashboard/calendar?event=${event.id}`,
  }));

  // Idempotent mark: UNIQUE (event_id, user_id, notification_type) +
  // ignoreDuplicates makes concurrent/duplicate runs a no-op.
  const { error: insertErr } = await supabase
    .from('golf_calendar_notifications')
    .upsert(notifications, {
      onConflict: 'event_id,user_id,notification_type',
      ignoreDuplicates: true,
    });

  if (insertErr) {
    throw new Error(`insert notifications: ${insertErr.message}`);
  }

  return { sent: succeeded.length, failed, skipped };
}

/**
 * Send both external channels for one recipient. Returns true only when every
 * applicable channel succeeded — partial failure leaves the recipient
 * unmarked so the next tick retries (the channel helpers treat opt-outs and
 * missing device tokens as success, so this can't retry forever on users who
 * simply have no push setup).
 */
async function sendReminderToRecipient(
  userId: string,
  event: EventRow,
  kind: ReminderKind,
  emailByUserId: Map<string, string>,
): Promise<boolean> {
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
    eventUrl: `${baseUrl}/golf/dashboard/calendar?event=${event.id}`,
    reminderWindow: kind === 'event_reminder_24h' ? '24h' : '1h',
  };

  const email = emailByUserId.get(userId);
  const [pushResult, emailResult] = await Promise.all([
    sendPushNotification('event_rsvp_reminder', userId, data),
    email
      ? sendEmailNotification('event_rsvp_reminder', userId, email, data)
      : Promise.resolve({ success: true as const }),
  ]);

  return pushResult.success && emailResult.success;
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
