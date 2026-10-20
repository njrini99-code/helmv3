import { describe, it, expect, vi } from 'vitest';

/**
 * The player hub's trips carry their calendar event.
 *
 * The trips read selected every itinerary column except `event_id`, so a
 * caller that needed the trip's event (whether the player travels is decided
 * by the event's invite list) got undefined and had to read it again.
 */

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
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
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getTopInsightForPlayer: async () => null,
}));
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({ userId: 'u1', role: 'player', coach: null, player: { id: 'p1' } }),
}));
vi.mock('@/lib/golf/resolve-team', () => ({
  validateCoachTeamAccess: async () => false,
}));

const selects = new Map<string, string>();
const TRIP = {
  id: 'trip-1',
  event_id: 'event-1',
  event_name: 'Firestone Invitational',
  destination: 'Akron, OH',
  transportation_type: 'van',
  departure_date: '2026-10-20',
};

function chain(table: string) {
  const rows = table === 'golf_travel_itineraries' ? [TRIP] : [];
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: (columns: string) => {
      selects.set(table, columns);
      return node;
    },
    eq: self,
    gte: self,
    in: self,
    order: self,
    limit: self,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => chain(table),
    rpc: async () => ({ data: [], error: null }),
  }),
}));

describe('getPlayerHubSummaryData — trips', () => {
  it("selects each trip's event_id and returns it", async () => {
    const { getPlayerHubSummaryData } = await import('@/app/golf/actions/player-hub-data');
    const summary = await getPlayerHubSummaryData('t1', 'p1');

    expect(selects.get('golf_travel_itineraries')?.split(',').map((c) => c.trim())).toContain('event_id');
    expect(summary.trips).toHaveLength(1);
    expect(summary.trips[0]!.event_id).toBe('event-1');
  });
});
