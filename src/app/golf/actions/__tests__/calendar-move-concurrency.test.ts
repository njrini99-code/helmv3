/**
 * P-4 drag and drop, server side: updateGolfEvent's optimistic concurrency (expectedUpdatedAt, an opaque token sent
 * back untouched), its result codes (stale, gone, forbidden), the new token on success, and the end's own offset.
 * Harness as in golf-events.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

// ---------------------------------------------------------------------------
// Mocks — the fake client is swapped per test via `fake` / `adminFake`
// ---------------------------------------------------------------------------

let fake: FakeSupabase;
let adminFake: FakeSupabase;
let afterCallbacks: Array<() => Promise<void> | void>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => adminFake),
}));

vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => {
    afterCallbacks.push(cb);
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn(async () => {}),
}));

vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin-logger', () => ({
  logRoundSubmitted: vi.fn(async () => {}),
}));

vi.mock('@/lib/notifications', () => ({
  notifyQualifierCreated: vi.fn(async () => {}),
}));

const sendEmailNotification = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotification: (...args: unknown[]) => sendEmailNotification(...(args as [])),
}));

const sendBulkPushNotification = vi.fn(async () => {});
vi.mock('@/lib/notifications/push', () => ({
  sendBulkPushNotification: (...args: unknown[]) => sendBulkPushNotification(...(args as [])),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { updateGolfEvent } from '../calendar-events';

// ---------------------------------------------------------------------------
// Seed data
//
// team-1 (org-1): coach-1 (user u-coach); active players player-1 (u-p1) and
// player-2 (u-p2). team-2: player-3 (u-p3, active).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** Known-key seed shape so indexed access is non-optional under strict TS. */
interface SeedTables extends Record<string, Row[]> {
  organizations: Row[];
  golf_teams: Row[];
  golf_coaches: Row[];
  golf_players: Row[];
  golf_team_members: Row[];
  users: Row[];
  golf_events: Row[];
  golf_event_attendance: Row[];
  golf_calendar_notifications: Row[];
}

const FUTURE_START = '2099-07-01T14:00:00+00:00';

function baseTables(): SeedTables {
  return {
    organizations: [{ id: 'org-1' }],
    golf_teams: [{ id: 'team-1', organization_id: 'org-1', created_at: '2025-01-01' }],
    golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
    golf_players: [
      { id: 'player-1', user_id: 'u-p1', first_name: 'Nick', last_name: 'Rini' },
      { id: 'player-2', user_id: 'u-p2', first_name: 'Ava', last_name: 'Smith' },
      { id: 'player-3', user_id: 'u-p3', first_name: 'Sam', last_name: 'Other' },
    ],
    golf_team_members: [
      { id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' },
      { id: 'm-2', team_id: 'team-1', player_id: 'player-2', status: 'active' },
      { id: 'm-3', team_id: 'team-2', player_id: 'player-3', status: 'active' },
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

function seedAs(userId: string | null, tables: SeedTables) {
  fake = createFakeSupabase({ user: userId ? { id: userId } : null, tables });
  // The admin client shares the same table store so post-response fan-outs
  // are observable through the same seed.
  adminFake = createFakeSupabase({ user: null, tables });
  return tables;
}

/** A seeded future event on team-1 with two attendance rows. */
function withEvent(tables: SeedTables, eventOverrides: Row = {}): SeedTables {
  tables.golf_events.push({
    id: 'event-1',
    team_id: 'team-1',
    title: 'Practice',
    event_type: 'practice',
    start_time: FUTURE_START,
    end_time: null,
    all_day: false,
    status: 'scheduled',
    location: 'Range',
    requires_rsvp: true,
    rsvp_deadline: null,
    created_by: 'coach-1',
    ...eventOverrides,
  });
  tables.golf_event_attendance.push(
    // `player` is pre-embedded so the fake (which has no join support)
    // satisfies the `player:golf_players(user_id)` select in fan-outs.
    { id: 'att-1', event_id: 'event-1', player_id: 'player-1', status: 'accepted', player: { user_id: 'u-p1' } },
    { id: 'att-2', event_id: 'event-1', player_id: 'player-2', status: 'pending', player: { user_id: 'u-p2' } },
  );
  return tables;
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks = [];
});

const V1 = '2026-10-14 18:00:00.123456+00';

describe('updateGolfEvent concurrency (P-4)', () => {
  const move = { startDate: '2099-07-01', startTime: '15:00', endDate: '2099-07-01', endTime: '16:00', allDay: false, timezoneOffset: 240 };

  it('with the version it read: the move lands and returns the new token', async () => {
    const tables = seedAs('u-coach', withEvent(baseTables(), { updated_at: V1 }));
    const res = await updateGolfEvent('event-1', { ...move, expectedUpdatedAt: V1 });
    expect(res.success).toBe(true);
    const row = tables.golf_events[0]!;
    expect(row.start_time).toBe('2099-07-01T15:00-04:00');
    expect(res.success && res.data?.updatedAt).toBe(row.updated_at);
    expect(row.updated_at).not.toBe(V1);
  });

  it('with an older version: nothing changes and the answer is stale, with the row as it is now', async () => {
    const tables = seedAs('u-coach', withEvent(baseTables(), { updated_at: 'v-newer' }));
    const res = await updateGolfEvent('event-1', { ...move, expectedUpdatedAt: V1 });
    expect(res).toMatchObject({ success: false, code: 'stale', current: { startTime: FUTURE_START, allDay: false, updatedAt: 'v-newer' } });
    expect(tables.golf_events[0]!.start_time).toBe(FUTURE_START);
  });

  it('a row cancelled meanwhile is gone; no row at all is gone too', async () => {
    seedAs('u-coach', withEvent(baseTables(), { updated_at: 'v-newer', status: 'cancelled' }));
    expect(await updateGolfEvent('event-1', { ...move, expectedUpdatedAt: V1 })).toMatchObject({ success: false, code: 'gone' });
    seedAs('u-coach', baseTables());
    expect(await updateGolfEvent('event-1', { ...move, expectedUpdatedAt: V1 })).toMatchObject({ success: false, code: 'gone' });
  });

  it('a player is refused with code forbidden', async () => {
    seedAs('u-p1', withEvent(baseTables(), { updated_at: V1 }));
    expect(await updateGolfEvent('event-1', { ...move, expectedUpdatedAt: V1 })).toMatchObject({ success: false, code: 'forbidden', error: 'Only coaches can update team events' });
  });

  it('the end takes its own offset (a run over a clock change)', async () => {
    const tables = seedAs('u-coach', withEvent(baseTables()));
    await updateGolfEvent('event-1', { startDate: '2099-10-31', startTime: '07:00', endDate: '2099-11-02', endTime: '16:30', allDay: false, timezoneOffset: 240, endTimezoneOffset: 300 });
    expect(tables.golf_events[0]).toMatchObject({ start_time: '2099-10-31T07:00-04:00', end_time: '2099-11-02T16:30-05:00' });
  });

  it('without a version it behaves as before (no check, no code)', async () => {
    seedAs('u-coach', withEvent(baseTables(), { updated_at: 'anything' }));
    const res = await updateGolfEvent('event-1', move);
    expect(res.success).toBe(true);
  });
});

describe('series moves (P-4 6.4, 8.7)', () => {
  it('editRecurringEvent refuses a target row that changed since it was read', async () => {
    const { editRecurringEvent } = await import('../recurring-events');
    seedAs('u-coach', withEvent(baseTables(), { updated_at: 'v-newer', recurrence_rule: 'FREQ=WEEKLY;BYDAY=TU' }));
    const res = await editRecurringEvent({ eventId: 'event-1', originalStartDate: FUTURE_START, scope: 'thisAndFuture', expectedUpdatedAt: V1, updates: { startTime: '16:00' } });
    expect(res).toMatchObject({ success: false, code: 'stale' });
  });

  it('notifyEventSeriesUpdate writes one Bell row per player for twelve occurrences', async () => {
    const { notifyEventSeriesUpdate } = await import('@/lib/calendar/rsvp');
    const tables = baseTables();
    for (let i = 0; i < 12; i++) {
      tables.golf_events.push({ id: `occ-${i}`, team_id: 'team-1', title: 'Lift', event_type: 'practice', start_time: `2099-07-${String(i + 1).padStart(2, '0')}T14:00:00+00:00`, end_time: null, all_day: false, location: null, requires_rsvp: true });
      tables.golf_event_attendance.push(
        { id: `a1-${i}`, event_id: `occ-${i}`, player_id: 'player-1', status: 'accepted', player: { user_id: 'u-p1' } },
        { id: `a2-${i}`, event_id: `occ-${i}`, player_id: 'player-2', status: 'pending', player: { user_id: 'u-p2' } },
      );
    }
    seedAs('u-coach', tables);
    await notifyEventSeriesUpdate('occ-0', tables.golf_events.map((e) => e.id as string), adminFake as never);
    expect(tables.golf_calendar_notifications).toHaveLength(2);
    expect(tables.golf_calendar_notifications[0]).toMatchObject({ event_id: 'occ-0', title: 'Event updated: Lift' });
    expect(String(tables.golf_calendar_notifications[0]!.message)).toMatch(/and 11 later$/);
  });
});
