import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The player hub's docstring already stated the right contract: empty arrays
 * for a genuinely empty team, and a real DB/network failure "allowed to throw"
 * so the route's error boundary can offer a retry.
 *
 * The code never met it. supabase-js RESOLVES database errors as
 * `{ data: null, error }` instead of throwing, so the three unguarded legs of
 * the Promise.all turned a failed read into an empty one and the boundary never
 * fired. A player whose events read failed was shown "no upcoming events" —
 * including MANDATORY ones — and a failed travel read hid the itinerary with
 * the departure time on it.
 *
 * The announcements leg in the same function already tracked its failure, which
 * is what makes the other three an oversight rather than a decision.
 */

const logServerError = vi.fn(async () => {});
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
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getTopInsightForPlayer: async () => null,
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
let rpcOutcome: Outcome = { data: [], error: null };

function chain(table: string) {
  const settle = () => outcomes.get(table) ?? { data: [], error: null };
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    gte: self,
    order: self,
    limit: self,
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => chain(table),
    rpc: async () => rpcOutcome,
  }),
}));

async function hub() {
  const { getPlayerHubSummaryData } = await import('@/app/golf/actions/player-hub-data');
  return getPlayerHubSummaryData('t1', 'p1');
}

describe('getPlayerHubSummaryData — an unreadable hub must not look like an empty one', () => {
  beforeEach(() => {
    logServerError.mockClear();
    outcomes.clear();
    rpcOutcome = { data: [], error: null };
  });

  it('returns empty arrays for a genuinely quiet team, without complaining', async () => {
    const data = await hub();

    expect(data.events).toEqual([]);
    expect(data.trips).toEqual([]);
    expect(data.tasks).toEqual([]);
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('throws rather than hiding a mandatory event when the events read fails', async () => {
    rpcOutcome = { data: null, error: { message: 'statement timeout', code: '57014' } };

    await expect(hub()).rejects.toThrow(/load your hub/i);
    expect(
      logServerError.mock.calls.some((call) => /events read failed/.test(String((call as unknown[])[0]))),
    ).toBe(true);
  });

  it('throws rather than hiding the bus time when the travel read fails', async () => {
    outcomes.set('golf_travel_itineraries', { data: null, error: { message: 'permission denied', code: '42501' } });

    await expect(hub()).rejects.toThrow(/load your hub/i);
    expect(
      logServerError.mock.calls.some((call) => /travel read failed/.test(String((call as unknown[])[0]))),
    ).toBe(true);
  });

  it('throws rather than hiding assigned tasks when the tasks read fails', async () => {
    outcomes.set('golf_task_assignments', { data: null, error: { message: 'connection terminated' } });

    await expect(hub()).rejects.toThrow(/load your hub/i);
    expect(
      logServerError.mock.calls.some((call) => /tasks read failed/.test(String((call as unknown[])[0]))),
    ).toBe(true);
  });
});
