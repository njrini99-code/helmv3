import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * The rounds list already carries an explicit guarantee (P425): the team rounds
 * fetch throws on error so the route's error boundary offers a retry, because
 * "an empty rounds list must mean 'no rounds', never 'the query failed'".
 *
 * The read that feeds it defeated that guarantee. Resolving the coach's roster
 * was wrapped in try/catch and only `result.data` was taken — but supabase-js
 * RESOLVES a failure as `{ data: null, error }`, it does not throw, so the catch
 * never ran. `teamMembers` came back null, `teamPlayerIds` was `[]`, and the
 * `if (teamPlayerIds.length > 0)` guard skipped the protected fetch entirely.
 *
 * The coach was shown an empty rounds list for their whole team — the exact
 * outcome the comment ten lines below says must never happen — and the
 * throw-on-error below never got the chance to fire.
 *
 * Honest empty states are unchanged: a team that genuinely has no active
 * members still renders an empty list.
 */

const logServerException = vi.fn(() => {});
const logServerError = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException,
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
  const mod = await import('@/app/golf/(dashboard)/dashboard/rounds/page');
  return (mod.default as (args: unknown) => Promise<unknown>)({
    searchParams: Promise.resolve({}),
  });
}

// The page module and its Fairway component tree take seconds to compile; pay
// that once here rather than charging it to whichever test runs first.
beforeAll(async () => {
  await import('@/app/golf/(dashboard)/dashboard/rounds/page');
}, 60_000);

beforeEach(() => {
  logServerException.mockClear();
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_team_members', ok([{ player_id: 'p1' }]));
  outcomes.set('golf_rounds', ok([]));
});

describe('rounds list — a failed roster read is not "no rounds"', () => {
  it('does not render an empty list when the team-membership read failed', async () => {
    outcomes.set('golf_team_members', fails('statement timeout', '57014'));

    await expect(renderPage()).rejects.toThrow();
  });

  it('records the cause rather than silently emptying the list', async () => {
    outcomes.set('golf_team_members', fails('permission denied', '42501'));

    await renderPage().catch(() => {});

    const said = [
      ...logServerError.mock.calls.map((c) => String((c as unknown[])[0])),
      ...logServerException.mock.calls.map((c) => String((c as unknown[])[0])),
    ];
    expect(said.some((m) => /member|roster/i.test(m))).toBe(true);
  });
});

describe('rounds list — honest empty states stay honest', () => {
  it('still renders for a team that genuinely has no active members', async () => {
    outcomes.set('golf_team_members', ok([]));

    await expect(renderPage()).resolves.toBeTruthy();
  });

  it('still renders when the team has members but no completed rounds', async () => {
    await expect(renderPage()).resolves.toBeTruthy();
  });
});
