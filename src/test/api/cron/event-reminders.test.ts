/**
 * Event-reminders cron route tests (calendar audit 2026-06-10, findings
 * #3 / #13 / #27).
 *
 * Extended 2026-07-25 for per-team lead times (migration 20260725150000).
 *
 * Verifies the hourly-window contract the route was designed around:
 *   - the default leads (24h / 60min) produce the expected reminder rows
 *     (early + late as separate notification types)
 *   - a team's OWN configured leads drive its events, independently of other
 *     teams in the same run, and a team with reminders disabled gets nothing
 *   - user-facing copy is generated from the real lead, so a 3-day reminder is
 *     never announced as "Tomorrow" just because the slot is still named
 *     event_reminder_24h
 *   - fan-out is AWAITED before marking: a failed push/email send is NOT
 *     marked sent (no golf_calendar_notifications row → retried next tick)
 *   - declined attendees and already-reminded (event,user) pairs are skipped
 *   - platform-wide event fetch is paginated past the PostgREST 1000-row cap
 *   - idempotent upsert options (onConflict + ignoreDuplicates)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---- Mock harness -----------------------------------------------------------
// A recording admin-client. Every from(table) returns a fresh builder whose
// filter methods record (name, args) and whose .range(from, to) resolves a
// page sliced from the rows the dispatcher computes for that table — i.e. the
// mock honors the route's own filters (windows, .in() chunks) like the DB.

interface EventRow {
  id: string;
  title: string;
  start_time: string;
  location: string | null;
  cancelled_at: string | null;
  status: string | null;
  team_id: string;
}

/** Per-team reminder lead times (migration 20260725150000). */
interface TeamSettingsRow {
  team_id: string;
  event_reminders_enabled?: boolean | null;
  event_reminder_early_hours?: number | null;
  event_reminder_late_minutes?: number | null;
}

interface AttendanceRow {
  event_id: string;
  player_id: string;
  status: string | null;
}

interface MockConfig {
  events?: EventRow[];
  teamSettings?: TeamSettingsRow[];
  attendance?: AttendanceRow[];
  players?: Array<{ id: string; user_id: string | null }>;
  existingNotifications?: Array<{ event_id: string; user_id: string; notification_type: string }>;
  users?: Array<{ id: string; email: string | null }>;
  upsertError?: { message: string } | null;
}

interface RecordedCall {
  name: string;
  args: unknown[];
}

interface UpsertRecord {
  rows: Array<Record<string, unknown>>;
  options: Record<string, unknown> | undefined;
}

const upserts: UpsertRecord[] = [];
const rangeCalls: Array<{ table: string; from: number; to: number }> = [];

function getFilterArg(calls: RecordedCall[], name: string): unknown[] | undefined {
  return calls.find((c) => c.name === name)?.args;
}

function makeClient(cfg: MockConfig) {
  function rowsFor(table: string, calls: RecordedCall[]): Array<Record<string, unknown>> {
    switch (table) {
      case 'golf_events': {
        const gt = getFilterArg(calls, 'gt')?.[1] as string;
        const lte = getFilterArg(calls, 'lte')?.[1] as string;
        return (cfg.events ?? []).filter(
          (e) =>
            e.start_time > gt &&
            e.start_time <= lte &&
            e.cancelled_at === null &&
            e.status !== 'cancelled',
        ) as unknown as Array<Record<string, unknown>>;
      }
      case 'golf_event_attendance': {
        const ids = (getFilterArg(calls, 'in')?.[1] ?? []) as string[];
        return (cfg.attendance ?? []).filter((a) =>
          ids.includes(a.event_id),
        ) as unknown as Array<Record<string, unknown>>;
      }
      case 'golf_players': {
        const ids = (getFilterArg(calls, 'in')?.[1] ?? []) as string[];
        return (cfg.players ?? []).filter((p) => ids.includes(p.id)) as unknown as Array<
          Record<string, unknown>
        >;
      }
      case 'golf_calendar_notifications': {
        const kind = getFilterArg(calls, 'eq')?.[1] as string;
        const ids = (getFilterArg(calls, 'in')?.[1] ?? []) as string[];
        return (cfg.existingNotifications ?? []).filter(
          (n) => n.notification_type === kind && ids.includes(n.event_id),
        ) as unknown as Array<Record<string, unknown>>;
      }
      case 'golf_team_settings': {
        const ids = (getFilterArg(calls, 'in')?.[1] ?? []) as string[];
        return (cfg.teamSettings ?? []).filter((t) =>
          ids.includes(t.team_id),
        ) as unknown as Array<Record<string, unknown>>;
      }
      case 'users': {
        const ids = (getFilterArg(calls, 'in')?.[1] ?? []) as string[];
        return (cfg.users ?? []).filter((u) => ids.includes(u.id)) as unknown as Array<
          Record<string, unknown>
        >;
      }
      default:
        throw new Error(`unexpected table ${table}`);
    }
  }

  function makeBuilder(table: string) {
    const calls: RecordedCall[] = [];
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'gt', 'lte', 'is', 'neq', 'order', 'eq', 'in']) {
      builder[m] = vi.fn((...args: unknown[]) => {
        calls.push({ name: m, args });
        return builder;
      });
    }
    builder.range = vi.fn((from: number, to: number) => {
      rangeCalls.push({ table, from, to });
      const all = rowsFor(table, calls);
      return Promise.resolve({ data: all.slice(from, to + 1), error: null });
    });
    builder.upsert = vi.fn(
      (rows: Array<Record<string, unknown>>, options?: Record<string, unknown>) => {
        upserts.push({ rows, options });
        return Promise.resolve({ error: cfg.upsertError ?? null });
      },
    );
    return builder;
  }

  return {
    from: vi.fn((table: string) => makeBuilder(table)),
  };
}

let currentClient: ReturnType<typeof makeClient>;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => currentClient,
}));

const sendPushMock = vi.fn();
const sendEmailMock = vi.fn();
vi.mock('@/lib/notifications/push', () => ({
  sendPushNotification: (...args: unknown[]) => sendPushMock(...args),
}));
vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotification: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/event-reminders/route';

// ---- Fixtures ---------------------------------------------------------------

const NOW = new Date('2026-06-10T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

function eventAt(id: string, offsetMs: number, overrides: Partial<EventRow> = {}): EventRow {
  return {
    id,
    title: `Event ${id}`,
    start_time: new Date(NOW.getTime() + offsetMs).toISOString(),
    location: 'Range',
    cancelled_at: null,
    status: 'confirmed',
    team_id: 'T1',
    ...overrides,
  };
}

function authed(): NextRequest {
  return new NextRequest('http://x/api/cron/event-reminders', {
    headers: { authorization: 'Bearer cron-secret-value' },
  });
}

function upsertsForKind(kind: string): Array<Record<string, unknown>> {
  return upserts
    .flatMap((u) => u.rows)
    .filter((r) => r.notification_type === kind);
}

describe('event-reminders cron route', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    process.env.CRON_SECRET = 'cron-secret-value';
    upserts.length = 0;
    rangeCalls.length = 0;
    sendPushMock.mockReset().mockResolvedValue({ success: true });
    sendEmailMock.mockReset().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    currentClient = makeClient({});
    const res = await GET(new NextRequest('http://x/api/cron/event-reminders'));
    expect(res.status).toBe(401);
  });

  it('rejects when CRON_SECRET is unset (fail-closed)', async () => {
    delete process.env.CRON_SECRET;
    currentClient = makeClient({});
    const res = await GET(authed());
    expect(res.status).toBe(401);
  });

  it('hourly windows: the default leads drive the early and late slots', async () => {
    // E1 at +2h  → inside 25h window only
    // E2 at +30m → inside BOTH windows (gets a 24h row AND a 1h row)
    // E3 at +30h → outside both windows
    currentClient = makeClient({
      events: [eventAt('E1', 2 * HOUR), eventAt('E2', 30 * MIN), eventAt('E3', 30 * HOUR)],
      attendance: [
        { event_id: 'E1', player_id: 'P1', status: 'accepted' },
        { event_id: 'E2', player_id: 'P1', status: 'pending' },
        { event_id: 'E3', player_id: 'P1', status: 'accepted' },
      ],
      players: [{ id: 'P1', user_id: 'U1' }],
      users: [{ id: 'U1', email: 'u1@x.test' }],
    });

    const res = await GET(authed());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.inserted24h).toBe(2);
    expect(body.inserted1h).toBe(1);
    expect(body.failed24h).toBe(0);
    expect(body.failed1h).toBe(0);

    const rows24 = upsertsForKind('event_reminder_24h');
    expect(rows24.map((r) => `${r.event_id}:${r.user_id}`).sort()).toEqual(['E1:U1', 'E2:U1']);
    const rows1 = upsertsForKind('event_reminder_1h');
    expect(rows1.map((r) => `${r.event_id}:${r.user_id}`)).toEqual(['E2:U1']);

    // Idempotency contract on the mark.
    for (const u of upserts) {
      expect(u.options).toMatchObject({
        onConflict: 'event_id,user_id,notification_type',
        ignoreDuplicates: true,
      });
    }
  });

  it('honours per-team lead times: two teams, two different schedules', async () => {
    // T1 keeps the defaults (24h / 60min). T2 is set to 3 days / 6 hours.
    // E1 at +30h is OUTSIDE T1's early window but INSIDE T2's.
    // E2 at +5h is INSIDE T2's late window (6h) but not T1's (60min).
    currentClient = makeClient({
      events: [
        eventAt('E1', 30 * HOUR, { team_id: 'T1' }),
        eventAt('E2', 30 * HOUR, { team_id: 'T2' }),
        eventAt('E3', 5 * HOUR, { team_id: 'T2' }),
      ],
      teamSettings: [
        { team_id: 'T1' },
        { team_id: 'T2', event_reminder_early_hours: 72, event_reminder_late_minutes: 360 },
      ],
      attendance: [
        { event_id: 'E1', player_id: 'P1', status: 'accepted' },
        { event_id: 'E2', player_id: 'P1', status: 'accepted' },
        { event_id: 'E3', player_id: 'P1', status: 'accepted' },
      ],
      players: [{ id: 'P1', user_id: 'U1' }],
      users: [{ id: 'U1', email: 'u1@x.test' }],
    });

    const res = await GET(authed());
    expect(res.status).toBe(200);

    // E1 (T1, 30h out) must NOT be reminded — T1's early lead is 24h.
    // E2 (T2, 30h out) and E3 (T2, 5h out) both fall inside T2's 72h early lead.
    const rows24 = upsertsForKind('event_reminder_24h');
    expect(rows24.map((r) => r.event_id).sort()).toEqual(['E2', 'E3']);

    // Only E3 is inside a late window: T2's 6h lead. E2 is 30h out.
    const rows1 = upsertsForKind('event_reminder_1h');
    expect(rows1.map((r) => r.event_id)).toEqual(['E3']);
  });

  it('a team with reminders disabled gets nothing, without affecting other teams', async () => {
    currentClient = makeClient({
      events: [
        eventAt('E1', 2 * HOUR, { team_id: 'T1' }),
        eventAt('E2', 2 * HOUR, { team_id: 'T2' }),
      ],
      teamSettings: [
        { team_id: 'T1', event_reminders_enabled: false },
        { team_id: 'T2', event_reminders_enabled: true },
      ],
      attendance: [
        { event_id: 'E1', player_id: 'P1', status: 'accepted' },
        { event_id: 'E2', player_id: 'P2', status: 'accepted' },
      ],
      players: [
        { id: 'P1', user_id: 'U1' },
        { id: 'P2', user_id: 'U2' },
      ],
      users: [
        { id: 'U1', email: 'u1@x.test' },
        { id: 'U2', email: 'u2@x.test' },
      ],
    });

    const res = await GET(authed());
    expect(res.status).toBe(200);

    const all = upserts.flatMap((u) => u.rows);
    expect(all.map((r) => r.event_id)).toEqual(['E2']);
    // Nothing was even attempted for the muted team.
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(sendPushMock).toHaveBeenCalledWith('event_rsvp_reminder', 'U2', expect.anything());
  });

  it('reminder copy describes the team\u2019s real lead, not the slot name', async () => {
    currentClient = makeClient({
      events: [eventAt('E1', 60 * HOUR, { team_id: 'T2' })],
      teamSettings: [
        { team_id: 'T2', event_reminder_early_hours: 72, event_reminder_late_minutes: 360 },
      ],
      attendance: [{ event_id: 'E1', player_id: 'P1', status: 'accepted' }],
      players: [{ id: 'P1', user_id: 'U1' }],
      users: [{ id: 'U1', email: 'u1@x.test' }],
    });

    await GET(authed());

    // A 3-day lead must not be announced as "Tomorrow" just because the slot
    // is still called event_reminder_24h in the database.
    const row = upsertsForKind('event_reminder_24h')[0];
    expect(row?.title).toBe('In 3 days: Event E1');
    expect(row?.title).not.toContain('Tomorrow');

    // The email/push payload carries the same wording.
    expect(sendEmailMock).toHaveBeenCalledWith(
      'event_rsvp_reminder',
      'U1',
      'u1@x.test',
      expect.objectContaining({ reminderWindow: '3 days' }),
    );
  });

  it('a failed push send is NOT marked sent (retryable next tick); successes still are', async () => {
    currentClient = makeClient({
      events: [eventAt('E1', 20 * HOUR)],
      attendance: [
        { event_id: 'E1', player_id: 'P1', status: 'accepted' },
        { event_id: 'E1', player_id: 'P2', status: 'accepted' },
      ],
      players: [
        { id: 'P1', user_id: 'U1' },
        { id: 'P2', user_id: 'U2' },
      ],
      users: [
        { id: 'U1', email: 'u1@x.test' },
        { id: 'U2', email: 'u2@x.test' },
      ],
    });
    sendPushMock.mockImplementation((_type: unknown, userId: unknown) =>
      Promise.resolve({ success: userId !== 'U2' }),
    );

    const res = await GET(authed());
    const body = await res.json();
    expect(body.inserted24h).toBe(1);
    expect(body.failed24h).toBe(1);

    const marked = upsertsForKind('event_reminder_24h');
    expect(marked.map((r) => r.user_id)).toEqual(['U1']);
  });

  it('a REJECTED send (thrown, not {success:false}) is also unmarked — Promise.allSettled path', async () => {
    currentClient = makeClient({
      events: [eventAt('E1', 20 * HOUR)],
      attendance: [{ event_id: 'E1', player_id: 'P1', status: 'accepted' }],
      players: [{ id: 'P1', user_id: 'U1' }],
      users: [{ id: 'U1', email: 'u1@x.test' }],
    });
    sendPushMock.mockRejectedValue(new Error('apns down'));

    const res = await GET(authed());
    const body = await res.json();
    expect(res.status).toBe(200); // one recipient failing must not 500 the tick
    expect(body.inserted24h).toBe(0);
    expect(body.failed24h).toBe(1);
    expect(upserts.flatMap((u) => u.rows)).toHaveLength(0);
  });

  it('a failed EMAIL send also leaves the recipient unmarked', async () => {
    currentClient = makeClient({
      events: [eventAt('E1', 20 * HOUR)],
      attendance: [{ event_id: 'E1', player_id: 'P1', status: 'accepted' }],
      players: [{ id: 'P1', user_id: 'U1' }],
      users: [{ id: 'U1', email: 'u1@x.test' }],
    });
    sendEmailMock.mockResolvedValue({ success: false, error: 'resend 500' });

    const res = await GET(authed());
    const body = await res.json();
    expect(body.inserted24h).toBe(0);
    expect(body.failed24h).toBe(1);
    expect(upserts).toHaveLength(0);
  });

  it('declined attendees are never reminded', async () => {
    currentClient = makeClient({
      events: [eventAt('E1', 20 * HOUR)],
      attendance: [
        { event_id: 'E1', player_id: 'P1', status: 'declined' },
        { event_id: 'E1', player_id: 'P2', status: 'tentative' },
      ],
      players: [
        { id: 'P1', user_id: 'U1' },
        { id: 'P2', user_id: 'U2' },
      ],
      users: [
        { id: 'U1', email: 'u1@x.test' },
        { id: 'U2', email: 'u2@x.test' },
      ],
    });

    await GET(authed());
    const marked = upsertsForKind('event_reminder_24h');
    expect(marked.map((r) => r.user_id)).toEqual(['U2']);
    expect(sendPushMock).not.toHaveBeenCalledWith('event_rsvp_reminder', 'U1', expect.anything());
  });

  it('already-reminded (event,user) pairs are skipped BEFORE sending (no duplicate sends across ticks)', async () => {
    currentClient = makeClient({
      events: [eventAt('E1', 20 * HOUR)],
      attendance: [{ event_id: 'E1', player_id: 'P1', status: 'accepted' }],
      players: [{ id: 'P1', user_id: 'U1' }],
      users: [{ id: 'U1', email: 'u1@x.test' }],
      existingNotifications: [
        { event_id: 'E1', user_id: 'U1', notification_type: 'event_reminder_24h' },
      ],
    });

    const res = await GET(authed());
    const body = await res.json();
    expect(body.inserted24h).toBe(0);
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it('paginates the platform-wide events fetch past the PostgREST 1000-row cap', async () => {
    const COUNT = 1003;
    const events = Array.from({ length: COUNT }, (_, i) =>
      eventAt(`E${String(i).padStart(4, '0')}`, 20 * HOUR),
    );
    currentClient = makeClient({
      events,
      attendance: events.map((e) => ({ event_id: e.id, player_id: 'P1', status: 'accepted' })),
      players: [{ id: 'P1', user_id: 'U1' }],
      users: [{ id: 'U1', email: 'u1@x.test' }],
    });

    const res = await GET(authed());
    const body = await res.json();
    // Every event past row 1000 still produced a reminder → the fetch paged.
    expect(body.inserted24h).toBe(COUNT);
    const eventPages = rangeCalls.filter((r) => r.table === 'golf_events');
    expect(eventPages.some((r) => r.from === 1000)).toBe(true);
  }, 30_000);

  it('returns 500 and reports when the mark upsert itself fails (sends are at-least-once, never lost-marked)', async () => {
    currentClient = makeClient({
      events: [eventAt('E1', 20 * HOUR)],
      attendance: [{ event_id: 'E1', player_id: 'P1', status: 'accepted' }],
      players: [{ id: 'P1', user_id: 'U1' }],
      users: [{ id: 'U1', email: 'u1@x.test' }],
      upsertError: { message: 'db down' },
    });

    const res = await GET(authed());
    expect(res.status).toBe(500);
  });
});
