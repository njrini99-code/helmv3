import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * The player dashboard states its own policy two lines below this read:
 *
 *   "a real DB/network outage must SURFACE to the route error.tsx
 *    (RouteErrorBoundary) instead of being swallowed into a fake-empty player
 *    dashboard indistinguishable from a healthy new player."
 *
 * The team-membership read directly above that comment was swallowed twice
 * over: wrapped in `try { } catch { }` which discards the exception, and
 * destructured for `.data` only — so the supabase-js failure, which RESOLVES as
 * { data: null, error } rather than throwing, never reached the catch anyway.
 *
 * Either way teamId became null, and with teamId null the page skips
 * getPlayerHubSummaryData entirely and renders as though the player is on no
 * team: no team name, no hub triage. Exactly the fake-empty dashboard the
 * comment forbids.
 *
 * A genuine new player is unaffected and still renders: `.maybeSingle()`
 * reports "no membership row" as { data: null, error: null } — a real answer.
 */

const logServerError = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('REDIRECT'); }),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }),
}));

// userId MUST match the authenticated user: dashboard-data.ts:284 throws
// 'Unauthorized' on a mismatch, which is what blocked an earlier attempt at
// this test and made an unrelated assertion look like it had passed.
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({
    role: 'player',
    userId: 'u1',
    coach: null,
    player: { id: 'player-1', first_name: 'A', last_name: 'B', avatar_url: null },
  }),
}));

vi.mock('@/app/golf/actions/dashboard-data', () => ({
  getCachedPlayerDashboardData: vi.fn(async () => ({
    stats: { handicap: null }, teamName: 'Shenandoah',
    upcomingEvents: [], recentRounds: [], announcements: [], tasks: [],
  })),
}));
vi.mock('@/app/golf/actions/player-hub-data', () => ({
  getPlayerHubSummaryData: vi.fn(async () => ({
    tasks: [], rsvps: [], announcements: [], upcomingEvents: [],
  })),
}));
vi.mock('@/app/golf/actions/teams', () => ({
  getTeamJoinRequests: vi.fn(async () => ({ success: true, data: [] })),
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (d: unknown): Outcome => ({ data: d, error: null });
const fails = (m: string, code = '08006'): Outcome => ({ data: null, error: { message: m, code } });

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const settleSingle = () => outcomes.get(`${table}:single`) ?? outcomes.get(table) ?? ok(null);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, not: self, or: self, is: self, neq: self,
    gt: self, lt: self, gte: self, lte: self, order: self, limit: self, range: self, filter: self,
    single: async () => settleSingle(),
    maybeSingle: async () => settleSingle(),
    then: (r: (v: Outcome) => unknown, j?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(r, j),
  });
  return node;
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (t: string) => tableChain(t),
  rpc: async () => ({ data: null, error: null }),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));

async function renderPage() {
  const mod = await import('@/app/golf/(dashboard)/dashboard/page');
  return (mod.default as (a: unknown) => Promise<unknown>)({
    searchParams: Promise.resolve({}),
  });
}

beforeAll(async () => {
  await import('@/app/golf/(dashboard)/dashboard/page');
}, 60_000);

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_team_members:single', ok({ team_id: 'team-1' }));
  outcomes.set('golf_team_members', ok([]));
});

describe('player dashboard — a failed membership read must not render a fake-empty team', () => {
  it('surfaces the failure instead of rendering as though the player has no team', async () => {
    outcomes.set('golf_team_members:single', fails('connection reset'));
    await expect(renderPage()).rejects.toThrow();
  });

  it('records the cause', async () => {
    outcomes.set('golf_team_members:single', fails('permission denied', '42501'));
    await renderPage().catch(() => {});
    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /team|membership/i.test(m))).toBe(true);
  });
});

describe('player dashboard — a genuine new player still renders', () => {
  it('renders for a player with no membership row at all', async () => {
    outcomes.set('golf_team_members:single', ok(null));
    await expect(renderPage()).resolves.toBeTruthy();
  });

  it('renders on the healthy path', async () => {
    await expect(renderPage()).resolves.toBeTruthy();
  });
});
