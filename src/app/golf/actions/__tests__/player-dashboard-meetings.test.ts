import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Fairway player Home (getPlayerDashboardData): Today and Up next show a
 * meeting only when the player is invited to it (their own attendance row).
 * golf_events_select_team returns every team meeting to a player until
 * migration 20261018120000 lands. A coach looking at the player's Home is
 * unchanged; a failed invite read hides every meeting.
 */

const { logServerError, verifyPlayerAccess } = vi.hoisted(() => ({
  logServerError: vi.fn(async (..._args: unknown[]) => {}),
  verifyPlayerAccess: vi.fn(async (): Promise<{ allowed: boolean; reason: 'self' | 'coach' }> => ({ allowed: true, reason: 'self' })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: () => verifyPlayerAccess(),
  verifyTeamAccess: async () => ({ allowed: true, reason: 'coach' }),
}));

type Result = { data: unknown; error: unknown };
const results = new Map<string, Result>();
const tablesRead: string[] = [];

function chain(table: string) {
  tablesRead.push(table);
  const result = results.get(table) ?? { data: [], error: null };
  const node: Record<string, unknown> = { ...result, count: 0 };
  for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'or', 'not', 'is', 'order', 'limit']) node[m] = () => node;
  node.range = (from: number, to: number) => ({
    data: Array.isArray(result.data) ? result.data.slice(from, to + 1) : result.data,
    error: result.error,
  });
  node.single = async () => results.get(`${table}:single`) ?? { data: null, error: null };
  node.maybeSingle = async () => results.get(`${table}:single`) ?? { data: null, error: null };
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (t: string) => chain(t),
    rpc: async () => ({ data: [], error: null }),
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  })),
}));

import { getPlayerDashboardData } from '../dashboard-data';

const event = (id: string, event_type: string) => ({
  id,
  title: id,
  event_type,
  start_time: '2026-04-20T16:00:00+00:00',
  end_time: '2026-04-20T17:00:00+00:00',
  location: null,
  all_day: false,
});

beforeEach(() => {
  vi.setSystemTime(new Date('2026-04-20T13:00:00Z'));
  logServerError.mockClear();
  verifyPlayerAccess.mockResolvedValue({ allowed: true, reason: 'self' });
  results.clear();
  tablesRead.length = 0;
  results.set('golf_events', { data: [event('practice', 'practice'), event('one-on-one', 'meeting'), event('captains', 'meeting')], error: null });
  results.set('golf_event_attendance', { data: [{ event_id: 'captains', player_id: 'player-1', status: 'pending' }], error: null });
  results.set('golf_teams:single', { data: { id: 'team-1', name: 'Eagles', season: '2026', join_code: 'E1', created_at: '2026-01-01' }, error: null });
});

afterEach(() => vi.useRealTimers());

describe('player Home: meetings are for their invitees', () => {
  it('drops a meeting the player is not invited to from Today and Up next', async () => {
    const result = await getPlayerDashboardData('player-1', 'user-1', 'team-1');
    expect(result.todayEvents.map((e) => e.id)).toEqual(['practice', 'captains']);
    expect(result.upcomingEvents.map((e) => e.id)).toEqual(['practice', 'captains']);
  });

  it('hides every meeting when the invite read fails, and logs it', async () => {
    results.set('golf_event_attendance', { data: null, error: { message: 'timeout', code: '57014' } });
    const result = await getPlayerDashboardData('player-1', 'user-1', 'team-1');
    expect(result.todayEvents.map((e) => e.id)).toEqual(['practice']);
    expect(result.upcomingEvents.map((e) => e.id)).toEqual(['practice']);
    expect(logServerError.mock.calls.some((c) => /meeting is hidden/.test(String(c[0])))).toBe(true);
  });

  it("leaves a coach's view of the player's Home unchanged", async () => {
    verifyPlayerAccess.mockResolvedValue({ allowed: true, reason: 'coach' });
    const result = await getPlayerDashboardData('player-1', 'user-1', 'team-1');
    expect(result.upcomingEvents.map((e) => e.id)).toEqual(['practice', 'one-on-one', 'captains']);
  });
});
