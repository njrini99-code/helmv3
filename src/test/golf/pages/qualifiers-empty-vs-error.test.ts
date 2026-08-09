import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * The qualifiers page resolved two reads and discarded both errors.
 *
 * A player's team-membership read failing left `teamId` null, which skips the
 * qualifier fetch entirely. A qualifiers read failing left the list `[]`. Both
 * land on the same screen: "no qualifiers", shown to a player whose team has a
 * qualifier running — the one place they go to find out whether they are in it.
 *
 * Neither told anyone. The page renders a confident empty state, the player
 * concludes there is nothing to enter, and nothing is recorded.
 *
 * A genuinely empty list is unchanged and still renders the empty state; only
 * the failure path is different, and it now throws so the route's error
 * boundary offers a retry instead of asserting a fact that was never read.
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
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1'),
}));

let session: unknown = {
  role: 'player',
  coach: null,
  player: { id: 'player-1' },
};
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => session,
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
    order: self,
    limit: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => tableChain(table),
  }),
}));

async function renderPage() {
  const mod = await import('@/app/golf/(dashboard)/dashboard/qualifiers/page');
  return (mod.default as () => Promise<unknown>)();
}

// Compiling the page module (and the Fairway component tree it pulls in) is a
// one-time cost of a couple of seconds, and it was being charged to whichever
// test ran first — which blew the 5s default on CI's slower runners while
// passing locally. Pay it once, outside a timed test.
beforeAll(async () => {
  await import('@/app/golf/(dashboard)/dashboard/qualifiers/page');
}, 60_000);

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  session = { role: 'player', coach: null, player: { id: 'player-1' } };
  outcomes.set('golf_team_members', ok({ team_id: 'team-1' }));
  outcomes.set('golf_qualifiers', ok([{ id: 'q-1', team_id: 'team-1' }]));
});

describe('qualifiers page — a failed read is not "no qualifiers"', () => {
  it('does not render an empty page when the qualifiers read failed', async () => {
    outcomes.set('golf_qualifiers', fails('statement timeout', '57014'));

    await expect(renderPage()).rejects.toThrow();
  });

  it('does not render an empty page when the team-membership read failed', async () => {
    outcomes.set('golf_team_members', fails('connection reset'));

    await expect(renderPage()).rejects.toThrow();
  });

  it('records the cause so a run of empty pages is diagnosable', async () => {
    outcomes.set('golf_qualifiers', fails('permission denied', '42501'));

    await renderPage().catch(() => {});

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /qualifier/i.test(m))).toBe(true);
  });
});

describe('qualifiers page — honest empty states stay honest', () => {
  it('still renders for a team that genuinely has no qualifiers', async () => {
    outcomes.set('golf_qualifiers', ok([]));

    await expect(renderPage()).resolves.toBeTruthy();
  });

  it('still renders for a player genuinely on no team', async () => {
    // `.maybeSingle()` with no row: a real answer, not a failure.
    outcomes.set('golf_team_members', ok(null));

    await expect(renderPage()).resolves.toBeTruthy();
  });

  it('still renders the normal case', async () => {
    await expect(renderPage()).resolves.toBeTruthy();
  });
});
