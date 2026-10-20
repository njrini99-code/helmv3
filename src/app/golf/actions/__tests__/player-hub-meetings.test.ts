import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Fairway player hub (Home / Team Hub, getPlayerHubSummaryData): the
 * get_player_hub_events RPC is SECURITY DEFINER and lists every team event,
 * meetings included, until migration 20261018120000 re-creates it. A player
 * sees a meeting only when they are invited to it (their own attendance row);
 * a failed invite read hides every meeting; a coach's call is unchanged.
 */

const { logServerError } = vi.hoisted(() => ({ logServerError: vi.fn(async (..._args: unknown[]) => {}) }));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@/app/golf/actions/player-notifications', () => ({
  getPlayerHubAnnouncements: async () => ({ success: true, data: [] }),
}));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getTopInsightForPlayer: async () => null }));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const tablesRead: string[] = [];

function chain(table: string) {
  tablesRead.push(table);
  const settle = () => outcomes.get(table) ?? { data: [], error: null };
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, gte: self, order: self, limit: self,
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

const session = { value: { userId: 'u1', role: 'player', coach: null, player: { id: 'p1' } } as unknown };
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => session.value }));
vi.mock('@/lib/golf/resolve-team', () => ({ validateCoachTeamAccess: async () => true }));

const hubEvent = (id: string, event_type: string, rsvp_status: string | null) => ({
  id, event_id: id, title: id, event_type, start_time: '2026-11-01T16:00:00Z', end_time: null, location: null,
  is_mandatory: false, rsvp_status, going_count: 0, maybe_count: 0,
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => chain(table),
    rpc: async () => ({
      data: [hubEvent('practice', 'practice', null), hubEvent('one-on-one', 'meeting', null), hubEvent('captains', 'meeting', 'pending')],
      error: null,
    }),
  }),
}));

async function hubEventIds() {
  const { getPlayerHubSummaryData } = await import('@/app/golf/actions/player-hub-data');
  return (await getPlayerHubSummaryData('t1', 'p1')).events.map((e) => e.id);
}

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  tablesRead.length = 0;
  session.value = { userId: 'u1', role: 'player', coach: null, player: { id: 'p1' } };
  outcomes.set('golf_event_attendance', { data: [{ event_id: 'captains', player_id: 'p1' }], error: null });
});

describe('player hub: meetings are for their invitees', () => {
  it('drops a meeting the player is not invited to', async () => {
    expect(await hubEventIds()).toEqual(['practice', 'captains']);
  });

  it('hides every meeting when the invite read fails, and logs it', async () => {
    outcomes.set('golf_event_attendance', { data: null, error: { message: 'timeout', code: '57014' } });
    expect(await hubEventIds()).toEqual(['practice']);
    expect(logServerError.mock.calls.some((c) => /meeting is hidden/.test(String(c[0])))).toBe(true);
  });

  it("leaves a coach's call unchanged and reads no invites for it", async () => {
    session.value = { userId: 'u2', role: 'coach', coach: { id: 'c1', organization_id: 'o1' }, player: null };
    expect(await hubEventIds()).toEqual(['practice', 'one-on-one', 'captains']);
    expect(tablesRead).not.toContain('golf_event_attendance');
  });
});
