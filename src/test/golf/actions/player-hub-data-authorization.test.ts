import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Wave A4 — getPlayerHubSummaryData(teamId, playerId) is a `'use server'`
 * export whose signature IS the trust boundary for anyone able to invoke it
 * directly, independent of which component references it. Before this fix
 * the function performed ZERO session resolution or authorization: its first
 * executable statement was `createClient()`, immediately followed by a
 * Promise.all keyed straight off the caller-supplied teamId/playerId — no
 * `getGolfSessionProfile()` call anywhere in the file. The one production
 * caller (dashboard/page.tsx) resolves both ids server-side from the
 * authenticated session and cannot forge them, but a direct invocation
 * could ask for ANY player's hub data on ANY team.
 *
 * The fix adds three checks before any hub data is touched:
 *   1. a session must exist and be a player            -> 'Not authenticated'
 *   2. the caller must BE the requested playerId        -> 'Forbidden'
 *   3. that player must be an ACTIVE member of teamId    -> 'Forbidden'
 *
 * Discriminating design: the RPC mock for `get_player_hub_events` returns a
 * REAL, non-empty, distinctively-named event for "rival-team" — the exact
 * shape a leak would surface. Old code reaches the RPC and returns that
 * event in `.events`; new code must refuse before the RPC (or any other
 * read) is ever called at all.
 *
 * 'Not authenticated' vs 'Forbidden' matters operationally, not just
 * semantically: dashboard/page.tsx's `redirectToLoginOnExpiredSession`
 * catches `.message === 'Not authenticated'` and sends a genuinely-expired
 * session to the login screen. An id-mismatch/not-a-member case must NOT
 * collide with that string, or a caller who is authenticated but requesting
 * someone else's data would be silently bounced to login instead of hitting
 * the route's real error boundary.
 */

let sessionPlayer: { id: string } | null = { id: 'p1' };

vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () =>
    sessionPlayer
      ? {
          role: 'player' as const,
          coach: null,
          player: {
            id: sessionPlayer.id,
            user_id: 'u1',
            first_name: 'Real',
            last_name: 'Player',
            avatar_url: null,
            handicap: null,
            onboarding_completed: true,
          },
        }
      : null,
}));
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

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();

/** RPC calls actually made — the leak-detection tripwire. */
const rpcCalls: string[] = [];
const mockRpc = vi.fn(async (fn: string) => {
  rpcCalls.push(fn);
  if (fn === 'get_player_hub_events') {
    return {
      data: [
        {
          id: 'evt-rival',
          event_id: 'evt-rival',
          title: "RIVAL TEAM'S confidential road-trip departure",
          event_type: 'travel',
          start_time: new Date().toISOString(),
          end_time: null,
          location: 'Rival Facility',
          is_mandatory: true,
          rsvp_status: null,
          going_count: 0,
          maybe_count: 0,
        },
      ],
      error: null,
    };
  }
  return { data: [], error: null };
});

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
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => chain(table),
    rpc: mockRpc,
  }),
}));

async function hub(teamId: string, playerId: string) {
  const { getPlayerHubSummaryData } = await import('@/app/golf/actions/player-hub-data');
  return getPlayerHubSummaryData(teamId, playerId);
}

beforeEach(() => {
  outcomes.clear();
  rpcCalls.length = 0;
  mockRpc.mockClear();
  sessionPlayer = { id: 'p1' };
  // 'rival-team' — a team the signed-in player (p1) does NOT belong to. Each
  // test below sets `golf_team_members` explicitly for its own scenario;
  // the generic `chain()` default of `{ data: [], error: null }` is an
  // ARRAY, which is truthy and would silently pass the `!membership` check
  // — never rely on it for this table.
});

describe('getPlayerHubSummaryData — the exported action is the trust boundary', () => {
  it('throws "Not authenticated" (not a generic error) when there is no session', async () => {
    sessionPlayer = null;

    await expect(hub('rival-team', 'p1')).rejects.toThrow('Not authenticated');
    expect(rpcCalls).toEqual([]);
  });

  it('refuses — and never calls the events RPC — when playerId does not match the caller', async () => {
    // Signed in as p1, but asking for a DIFFERENT player's hub data.
    await expect(hub('rival-team', 'someone-elses-player-id')).rejects.toThrow('Forbidden');
    // The pre-fix function went straight to the RPC regardless of whose
    // playerId was passed; the fix must deny before ever calling it.
    expect(rpcCalls).not.toContain('get_player_hub_events');
  });

  it('refuses — and never calls the events RPC — when the player is not on the requested team', async () => {
    // Signed in as p1, requesting p1's OWN id, but for a team p1 does not
    // staff/play on — `.maybeSingle()` reporting "no row" as `{ data: null }`.
    outcomes.set('golf_team_members', { data: null, error: null });

    await expect(hub('rival-team', 'p1')).rejects.toThrow('Forbidden');
    expect(rpcCalls).not.toContain('get_player_hub_events');
  });

  it('does not collide "Forbidden" with the login-redirect string', async () => {
    outcomes.set('golf_team_members', { data: null, error: null });

    await expect(hub('rival-team', 'p1')).rejects.toThrow(
      expect.not.objectContaining({ message: 'Not authenticated' }),
    );
  });

  it('proceeds to the real data — including the RPC — once membership checks out', async () => {
    outcomes.set('golf_team_members', { data: { id: 'membership-1' }, error: null });

    const data = await hub('rival-team', 'p1');

    expect(rpcCalls).toContain('get_player_hub_events');
    expect(data.events).toHaveLength(1);
    expect(data.events[0]!.title).toMatch(/road-trip/);
  });
});
