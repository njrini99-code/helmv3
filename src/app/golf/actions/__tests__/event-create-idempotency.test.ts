/**
 * C-17. createGolfEvent and createRecurringEvent had no request id: a Retry (or a second tap) after a reply that was
 * lost AFTER the server stored the event created a second one, and a second round of invitations and notifications.
 * They now take an optional `requestId` that becomes the row's primary key (the createRecruit pattern): a repeat hits
 * the key and the existing row, read back as this coach's own on this team, is the answer.
 *
 * Also pinned: a failed invitation write is no longer swallowed. The event or series stays created, `success` stays
 * true, and the failure comes back beside the id so the editor can say the invitations did not go out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: unknown;
let adminFake: unknown;
let afterCallbacks: Array<() => Promise<void> | void> = [];
/** When set, writes to golf_event_attendance answer with this error (the invitation write). */
let attendanceWriteError: unknown = null;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminFake) }));
vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => {
    afterCallbacks.push(cb);
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));
vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({ postRoundTrigger: vi.fn(async () => {}) }));
vi.mock('@/lib/cache/golf-stats-calculator', () => ({ invalidateOnRoundComplete: vi.fn(async () => {}) }));
vi.mock('@/lib/admin-logger', () => ({ logRoundSubmitted: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications', () => ({ notifyQualifierCreated: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications/email', () => ({ sendEmailNotification: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/notifications/push', () => ({ sendBulkPushNotification: vi.fn(async () => {}) }));

import { createGolfEvent, updateGolfEvent } from '../golf';
import { createRecurringEvent } from '../recurring-events';

type Row = Record<string, unknown>;
/** createGolfEvent's result, loosened: its declared type is a union that hides `data` on the failure arm. */
type Created = { success: boolean; error?: string; data?: { eventId: string; invitationsError?: string } };

const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';
const REQUEST = '44444444-4444-4444-8444-444444444444';
const OTHER_REQUEST = '55555555-5555-4555-8555-555555555555';

function tables(): Record<string, Row[]> {
  return {
    organizations: [{ id: 'org-1' }],
    golf_teams: [{ id: 'team-1', organization_id: 'org-1', created_at: '2025-01-01' }],
    golf_coaches: [
      { id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' },
      { id: 'coach-2', user_id: 'u-coach-2', organization_id: 'org-1' },
    ],
    golf_players: [
      { id: P1, user_id: 'u-p1', first_name: 'Nick', last_name: 'Rini' },
      { id: P2, user_id: 'u-p2', first_name: 'Ava', last_name: 'Smith' },
    ],
    golf_team_members: [
      { id: 'm-1', team_id: 'team-1', player_id: P1, status: 'active' },
      { id: 'm-2', team_id: 'team-1', player_id: P2, status: 'active' },
    ],
    users: [
      { id: 'u-p1', email: 'p1@example.com' },
      { id: 'u-p2', email: 'p2@example.com' },
    ],
    golf_events: [],
    golf_event_attendance: [],
    golf_calendar_notifications: [],
  };
}

/** The fake store has no primary key, so model one: an insert whose `id` is taken answers 23505, as Postgres does. */
function install(userId: string, t: Record<string, Row[]>) {
  const real = createFakeSupabase({ user: { id: userId }, tables: t });
  fake = {
    ...real,
    from: (table: string) => {
      const b = real.from(table);
      if (table === 'golf_events') {
        return {
          ...b,
          insert: (payload: unknown) => {
            const rows = Array.isArray(payload) ? (payload as Row[]) : [payload as Row];
            const clash = rows.some((r) => r.id !== undefined && t.golf_events!.some((e) => e.id === r.id));
            if (!clash) return (b as { insert: (p: unknown) => unknown }).insert(payload);
            const n: Record<string, unknown> = {};
            Object.assign(n, {
              select: () => n,
              single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "golf_events_pkey"' } }),
            });
            return n;
          },
        };
      }
      if (table === 'golf_event_attendance' && attendanceWriteError) {
        return {
          ...b,
          upsert: () => {
            const n: Record<string, unknown> = {};
            Object.assign(n, {
              select: () => n,
              then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: attendanceWriteError }).then(resolve),
            });
            return n;
          },
        };
      }
      return b;
    },
  };
  adminFake = createFakeSupabase({ user: null, tables: t });
  return t;
}

const event = (over: Record<string, unknown> = {}) => ({
  title: 'Short game',
  eventType: 'practice' as const,
  startDate: '2099-07-01',
  startTime: '14:00',
  endTime: '16:00',
  allDay: false,
  timezoneOffset: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks = [];
  attendanceWriteError = null;
});

describe('createGolfEvent with a request id (C-17)', () => {
  it('stores the event under that id', async () => {
    const t = install('u-coach', tables());
    const r = await createGolfEvent(event({ requestId: REQUEST }));
    expect(r).toEqual({ success: true, data: { eventId: REQUEST } });
    expect(t.golf_events!.map((e) => e.id)).toEqual([REQUEST]);
  });

  it('a repeat after a lost reply adds no second event, no second round of invitations, and no second fan-out', async () => {
    const t = install('u-coach', tables());
    const first = await createGolfEvent(event({ requestId: REQUEST, attendeeIds: [P1, P2] }));
    expect(first.success).toBe(true);
    expect(t.golf_event_attendance).toHaveLength(2);
    expect(afterCallbacks).toHaveLength(1);

    const again = await createGolfEvent(event({ requestId: REQUEST, attendeeIds: [P1, P2] }));

    expect(again).toEqual({ success: true, data: { eventId: REQUEST } });
    expect(t.golf_events).toHaveLength(1);
    expect(afterCallbacks).toHaveLength(1);
  });

  it('refuses an id that belongs to a different event of this coach, and to another coach\'s', async () => {
    const t = install('u-coach', tables());
    t.golf_events!.push({ id: REQUEST, team_id: 'team-1', created_by: 'coach-1', title: 'A different event', start_time: '2099-07-01T14:00:00+00:00' });
    expect((await createGolfEvent(event({ requestId: REQUEST }))).success).toBe(false);

    t.golf_events!.length = 0;
    t.golf_events!.push({ id: REQUEST, team_id: 'team-1', created_by: 'coach-2', title: 'Short game', start_time: '2099-07-01T14:00:00+00:00' });
    expect((await createGolfEvent(event({ requestId: REQUEST }))).success).toBe(false);

    t.golf_events!.length = 0;
    t.golf_events!.push({ id: REQUEST, team_id: 'team-2', created_by: 'coach-1', title: 'Short game', start_time: '2099-07-01T14:00:00+00:00' });
    expect((await createGolfEvent(event({ requestId: REQUEST }))).success).toBe(false);
    expect(t.golf_events).toHaveLength(1);
  });

  it('a different request id is a different event', async () => {
    const t = install('u-coach', tables());
    await createGolfEvent(event({ requestId: REQUEST }));
    await createGolfEvent(event({ requestId: OTHER_REQUEST }));
    expect(t.golf_events).toHaveLength(2);
  });

  it('without a request id it behaves as before: no id is sent, and two creates are two events', async () => {
    const t = install('u-coach', tables());
    await createGolfEvent(event());
    await createGolfEvent(event());
    expect(t.golf_events).toHaveLength(2);
    expect(t.golf_events!.every((e) => typeof e.id === 'string' && !e.id.startsWith(REQUEST.slice(0, 4)))).toBe(true);
  });

  it('refuses a request id that is not a UUID before writing anything', async () => {
    const t = install('u-coach', tables());
    const r = await createGolfEvent(event({ requestId: 'not-a-uuid' }));
    expect(r.success).toBe(false);
    expect(t.golf_events).toHaveLength(0);
  });
});

describe('invitation failures are not swallowed (C-17)', () => {
  it('createGolfEvent: the event stays created and the failure comes back beside the id', async () => {
    attendanceWriteError = { code: '42501', message: 'new row violates row-level security policy' };
    const t = install('u-coach', tables());

    const r = (await createGolfEvent(event({ attendeeIds: [P1, P2] }))) as Created;

    expect(r.success).toBe(true);
    expect(r.data?.eventId).toBeTruthy();
    expect(r.data?.invitationsError).toMatch(/invitations didn't all go out/);
    expect(t.golf_events).toHaveLength(1);
  });

  it('createGolfEvent: a clean create carries no invitationsError', async () => {
    install('u-coach', tables());
    const r = (await createGolfEvent(event({ attendeeIds: [P1] }))) as Created;
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('invitationsError');
  });

  it('updateGolfEvent: the edit stays saved and the failure comes back beside success', async () => {
    attendanceWriteError = { code: '42501', message: 'new row violates row-level security policy' };
    const t = install('u-coach', tables());
    t.golf_events!.push({ id: 'event-1', team_id: 'team-1', created_by: 'coach-1', title: 'Practice', start_time: '2099-07-01T14:00:00+00:00', status: 'confirmed' });

    const r = await updateGolfEvent('event-1', { title: 'Renamed', addAttendeeIds: [P1] });

    expect(r.success).toBe(true);
    expect(r.data?.invitationsError).toMatch(/new invitations didn't go out/);
    expect(t.golf_events![0]!.title).toBe('Renamed');
  });

  it('updateGolfEvent: a clean edit carries no invitationsError', async () => {
    const t = install('u-coach', tables());
    t.golf_events!.push({ id: 'event-1', team_id: 'team-1', created_by: 'coach-1', title: 'Practice', start_time: '2099-07-01T14:00:00+00:00', status: 'confirmed' });
    const r = await updateGolfEvent('event-1', { title: 'Renamed', addAttendeeIds: [P1] });
    expect(r).toEqual({ success: true });
  });
});

describe('createRecurringEvent with a request id (C-17)', () => {
  const series = (over: Record<string, unknown> = {}) => ({
    title: 'Lifting',
    eventType: 'training',
    startDate: '2026-06-01',
    startTime: '09:00',
    endTime: '10:00',
    recurrenceRule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3',
    timezoneOffset: 0,
    ...over,
  });

  it('stores the series root under that id', async () => {
    const t = install('u-coach', tables());
    const r = await createRecurringEvent(series({ requestId: REQUEST }));
    expect(r).toEqual({ success: true, data: { eventId: REQUEST } });
    expect(t.golf_events).toHaveLength(3);
    expect(t.golf_events!.find((e) => e.id === REQUEST)!.parent_event_id).toBeNull();
  });

  it('a repeat after a lost reply adds no second series and no second fan-out', async () => {
    const t = install('u-coach', tables());
    await createRecurringEvent(series({ requestId: REQUEST, attendeeIds: [P1, P2] }));
    expect(t.golf_events).toHaveLength(3);
    expect(t.golf_event_attendance).toHaveLength(6);
    expect(afterCallbacks).toHaveLength(1);

    const again = await createRecurringEvent(series({ requestId: REQUEST, attendeeIds: [P1, P2] }));

    expect(again).toEqual({ success: true, data: { eventId: REQUEST } });
    expect(t.golf_events).toHaveLength(3);
    expect(t.golf_event_attendance).toHaveLength(6);
    expect(afterCallbacks).toHaveLength(1);
  });

  it('refuses an id that belongs to a different series, or to another coach\'s', async () => {
    const t = install('u-coach', tables());
    t.golf_events!.push({ id: REQUEST, team_id: 'team-1', created_by: 'coach-1', title: 'Something else', recurrence_rule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3', parent_event_id: null });
    expect((await createRecurringEvent(series({ requestId: REQUEST }))).success).toBe(false);

    t.golf_events!.length = 0;
    t.golf_events!.push({ id: REQUEST, team_id: 'team-1', created_by: 'coach-2', title: 'Lifting', recurrence_rule: 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3', parent_event_id: null });
    expect((await createRecurringEvent(series({ requestId: REQUEST }))).success).toBe(false);
    expect(t.golf_events).toHaveLength(1);
  });

  it('without a request id two creates are two series', async () => {
    const t = install('u-coach', tables());
    await createRecurringEvent(series());
    await createRecurringEvent(series());
    expect(t.golf_events).toHaveLength(6);
  });

  it('refuses a request id that is not a UUID before writing anything', async () => {
    const t = install('u-coach', tables());
    const r = await createRecurringEvent(series({ requestId: 'nope' }));
    expect(r).toEqual({ success: false, error: 'Request id must be a UUID' });
    expect(t.golf_events).toHaveLength(0);
  });

  it('keeps the series and reports the failure when the invitations cannot be written', async () => {
    attendanceWriteError = { code: '42501', message: 'new row violates row-level security policy' };
    const t = install('u-coach', tables());

    const r = await createRecurringEvent(series({ attendeeIds: [P1] }));

    expect(r.success).toBe(true);
    expect(r.data?.invitationsError).toMatch(/invitations didn't all go out/);
    expect(t.golf_events).toHaveLength(3);
  });

  it('a clean series carries no invitationsError', async () => {
    install('u-coach', tables());
    const r = await createRecurringEvent(series({ attendeeIds: [P1] }));
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('invitationsError');
  });
});
