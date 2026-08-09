import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * Team Stats resolved its roster in two reads and discarded both errors.
 *
 * A failed golf_team_members read left playerIds empty, which short-circuits
 * the player read to `{ data: [] }`. A failed golf_players read left `players`
 * null. Both arrive at the same `!players || players.length === 0` branch, and
 * that branch renders a confident empty state telling a coach their roster is
 * empty — with a CTA to go add players they already have.
 *
 * This is the page a coach opens to see where the team is leaking strokes. It
 * said the team does not exist yet, and recorded nothing.
 *
 * Only the failure path changes. A team that genuinely has no active members
 * still gets the same empty state, which is the honest answer for a coach who
 * really has not built a roster.
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
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({
    role: 'coach',
    coach: { id: 'coach-1', organization_id: 'org-1' },
    player: null,
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
    order: self,
    limit: self,
    gte: self,
    lte: self,
    lt: self,
    gt: self,
    not: self,
    or: self,
    is: self,
    neq: self,
    range: self,
    filter: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => tableChain(table),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => tableChain(table),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

async function renderPage() {
  const mod = await import('@/app/golf/(dashboard)/dashboard/stats/team/page');
  return (mod.default as () => Promise<unknown>)();
}

// Same one-time cost as the qualifiers page test: compiling this page module
// and its Fairway component tree took ~2.6s locally and would have blown CI's
// 5s default on whichever test ran first. Pay it once, outside a timed test.
beforeAll(async () => {
  await import('@/app/golf/(dashboard)/dashboard/stats/team/page');
}, 60_000);

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_teams', ok({ name: 'Shenandoah' }));
  outcomes.set('golf_team_members', ok([{ player_id: 'p1' }]));
  outcomes.set(
    'golf_players',
    ok([{ id: 'p1', first_name: 'A', last_name: 'B', graduation_year: 2027, handicap: 2 }]),
  );
});

describe('team stats — a failed roster read is not an empty roster', () => {
  it('does not claim the roster is empty when the membership read failed', async () => {
    outcomes.set('golf_team_members', fails('statement timeout', '57014'));

    await expect(renderPage()).rejects.toThrow();
  });

  it('does not claim the roster is empty when the player read failed', async () => {
    outcomes.set('golf_players', fails('permission denied', '42501'));

    await expect(renderPage()).rejects.toThrow();
  });

  it('records the cause so a run of empty stats pages is diagnosable', async () => {
    outcomes.set('golf_team_members', fails('connection reset'));

    await renderPage().catch(() => {});

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /roster|member/i.test(m))).toBe(true);
  });
});

describe('team stats — honest empty states stay honest', () => {
  it('still shows the empty roster state for a team that genuinely has none', async () => {
    outcomes.set('golf_team_members', ok([]));

    await expect(renderPage()).resolves.toBeTruthy();
  });

  it('still renders the normal case', async () => {
    await expect(renderPage()).resolves.toBeTruthy();
  });
});
