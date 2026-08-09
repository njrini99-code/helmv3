import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * The calendar's PRIMARY read (events) already throws on error, and the
 * class-owner path already fails closed — `classOwnersResolved` stays false
 * when the roster fetch comes back empty, with a comment anticipating exactly
 * that. Neither is changed here.
 *
 * The two secondary reads in that same Promise.all discarded their error:
 *
 *  - the roster read. Its failure is absorbed by the classOwnersResolved guard,
 *    so nothing is leaked — but nothing is recorded either, and the guard then
 *    silently degrades class ownership for a reason no one can see.
 *  - the team-settings read. A failure leaves teamTimezone null, which is ALSO
 *    the legitimate value for a team that has not set one. The day-grouping
 *    (`zonedDayKey`) then falls back, and on a surface with this codebase's DST
 *    history an event can land on the wrong day with nothing to explain it.
 *
 * Because null/empty are genuine states here, the fix is to make the FAILURE
 * visible rather than to throw: the rendered output is deliberately unchanged.
 * That is the difference between failing closed and failing closed silently.
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
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({
    role: 'player', userId: 'u1', coach: null,
    player: { id: 'player-1', first_name: 'A', last_name: 'B' },
  }),
}));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => null),
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
  const mod = await import('@/app/golf/(dashboard)/dashboard/calendar/page');
  return (mod.default as (a: unknown) => Promise<unknown>)({
    searchParams: Promise.resolve({}),
  });
}

beforeAll(async () => {
  await import('@/app/golf/(dashboard)/dashboard/calendar/page');
}, 60_000);

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_team_members:single', ok({ team_id: 'team-1' }));
  outcomes.set('golf_team_members', ok([]));
  outcomes.set('golf_events', ok([]));
  outcomes.set('golf_team_settings:single', ok({ timezone: 'America/New_York' }));
  outcomes.set('golf_player_classes', ok([]));
  outcomes.set('golf_coaches', ok([]));
});

describe('calendar secondary reads — a failure must not be silent', () => {
  it('records a failed roster read', async () => {
    // The roster read is the LIST form of golf_team_members; the player's own
    // membership lookup earlier is the :single form and must keep succeeding,
    // or the page never reaches the roster read at all.
    outcomes.set('golf_team_members', fails('statement timeout', '57014'));
    await renderPage().catch(() => {});
    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /roster|member/i.test(m))).toBe(true);
  });

  it('records a failed team-settings read', async () => {
    outcomes.set('golf_team_settings:single', fails('permission denied', '42501'));
    await renderPage().catch(() => {});
    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /timezone|settings/i.test(m))).toBe(true);
  });
});

describe('calendar — rendering is deliberately unchanged', () => {
  it('still renders when the team has genuinely not set a timezone', async () => {
    outcomes.set('golf_team_settings:single', ok({ timezone: null }));
    await expect(renderPage()).resolves.toBeTruthy();
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('still renders on the healthy path', async () => {
    await expect(renderPage()).resolves.toBeTruthy();
  });
});
