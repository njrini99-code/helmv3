import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * Two reads on the documents page discarded their error.
 *
 * The player's team-membership read failing left `teamId` null, so a rostered
 * player was shown "No Team Found — You must be on a team to access documents."
 *
 * The document list read failing left the list null, so the page rendered an
 * empty shelf to a team whose waivers, itineraries and eligibility forms are
 * all sitting there. That read is a ternary, which is why the unchecked-read
 * ratchet never counted it — the same wrapper-shaped blind spot the paginated
 * ratchet was added for.
 *
 * Only the failure path changes: a player genuinely on no team still gets the
 * gate, and a team with genuinely no documents still gets the empty shelf.
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
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => null),
}));
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({
    role: 'player', coach: null, player: { id: 'player-1' },
  }),
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (message: string, code = '08006'): Outcome => ({ data: null, error: { message, code } });

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, not: self, or: self, is: self, neq: self,
    gt: self, lt: self, gte: self, lte: self, order: self, limit: self, range: self, filter: self,
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
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

async function renderPage() {
  const mod = await import('@/app/golf/(dashboard)/dashboard/documents/page');
  return (mod.default as () => Promise<unknown>)();
}

beforeAll(async () => {
  await import('@/app/golf/(dashboard)/dashboard/documents/page');
}, 60_000);

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_team_members', ok({ team_id: 'team-1' }));
  outcomes.set('golf_documents', ok([]));
});

describe('documents — a failed read is not "no team" or "no documents"', () => {
  it('does not show the no-team gate when the membership read failed', async () => {
    outcomes.set('golf_team_members', fails('connection reset'));
    await expect(renderPage()).rejects.toThrow();
  });

  it('does not show an empty shelf when the document read failed', async () => {
    outcomes.set('golf_documents', fails('statement timeout', '57014'));
    await expect(renderPage()).rejects.toThrow();
  });

  it('records the cause', async () => {
    outcomes.set('golf_documents', fails('permission denied', '42501'));
    await renderPage().catch(() => {});
    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /document/i.test(m))).toBe(true);
  });
});

describe('documents — honest empty states stay honest', () => {
  it('still gates a player genuinely on no team', async () => {
    outcomes.set('golf_team_members', ok(null));
    await expect(renderPage()).resolves.toBeTruthy();
  });

  it('still renders an empty shelf for a team with genuinely no documents', async () => {
    await expect(renderPage()).resolves.toBeTruthy();
  });
});
