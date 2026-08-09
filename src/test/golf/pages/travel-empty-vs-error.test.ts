import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * Two reads on the golf travel page discarded their error, and each one turns a
 * failure into a confident statement.
 *
 * The player's team-membership read failing left `playerTeamId` null, so
 * `teamId` was null and a rostered player was shown the "no team yet" empty
 * state on the page that tells them how they are getting to the tournament.
 *
 * The itinerary read failing is the same defect the baseball travel page had
 * (#1404): `fetchAllRowsResult` returns `{ data, error }` and only `data` was
 * taken, so a failed read produced the same `[]` an empty history produces and
 * the page said the team has no trips.
 *
 * Only the failure path changes. A player genuinely on no team still gets the
 * no-team state, and a team that genuinely has no trips still gets the empty
 * itinerary list.
 */

const logServerError = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => null),
}));

// A PLAYER, so the membership read below is the one that resolves the team.
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({
    role: 'player',
    coach: null,
    player: { id: 'player-1' },
  }),
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({
  data: null,
  error: { message, code },
});

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    not: self,
    or: self,
    is: self,
    neq: self,
    gt: self,
    lt: self,
    gte: self,
    lte: self,
    order: self,
    limit: self,
    range: self,
    filter: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (table: string) => tableChain(table),
  rpc: async () => ({ data: null, error: null }),
};

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));

async function renderPage() {
  const mod = await import('@/app/golf/(dashboard)/dashboard/travel/page');
  return (mod.default as (args: unknown) => Promise<unknown>)({
    searchParams: Promise.resolve({}),
  });
}

beforeAll(async () => {
  await import('@/app/golf/(dashboard)/dashboard/travel/page');
}, 60_000);

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_team_members', ok({ team_id: 'team-1' }));
  outcomes.set('golf_travel_itineraries', ok([]));
  outcomes.set('golf_events', ok([]));
});

describe('golf travel — a failed read is not "no team" or "no trips"', () => {
  it('does not show the no-team state when the membership read failed', async () => {
    outcomes.set('golf_team_members', fails('connection reset'));

    await expect(renderPage()).rejects.toThrow();
  });

  it('does not show an empty trip list when the itinerary read failed', async () => {
    outcomes.set('golf_travel_itineraries', fails('statement timeout', '57014'));

    await expect(renderPage()).rejects.toThrow();
  });

  it('records the cause so a run of empty travel pages is diagnosable', async () => {
    outcomes.set('golf_travel_itineraries', fails('permission denied', '42501'));

    await renderPage().catch(() => {});

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /travel|itiner/i.test(m))).toBe(true);
  });
});

describe('golf travel — honest empty states stay honest', () => {
  it('still shows the no-team state for a player genuinely on no team', async () => {
    // `.maybeSingle()` with no row: a real answer, not a failure.
    outcomes.set('golf_team_members', ok(null));

    await expect(renderPage()).resolves.toBeTruthy();
  });

  it('still renders for a team that genuinely has no trips', async () => {
    await expect(renderPage()).resolves.toBeTruthy();
  });
});
