import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The leak maps answer "where is this team losing strokes". Four reads on that
 * path discarded their error, and every one of them fails the same way: to an
 * empty result that renders as a clean scorecard.
 *
 * - the roster read: no players -> no rounds -> every leak map empty
 * - completedRoundIds: no round ids -> both bucket builders get nothing
 * - the putting and approach shot reads: no shots -> no leaks in that category
 *
 * A coach reading an empty leak map concludes the team has no leak worth
 * chasing. That is the opposite of "we could not measure", and it is the whole
 * purpose of the screen.
 *
 * These are paginated reads through fetchAllRowsResult, which preserves
 * supabase-js's { data, error } contract — so `const { data } = await ...`
 * drops the failure exactly as a raw query would, while reading like a helper
 * that has already handled it.
 *
 * The callers already wrap this in try/catch, log with context, and return
 * { success: false }. So the fix is to raise the error; the plumbing to report
 * it honestly was already there and was simply never given anything to report.
 *
 * Honest empty states are unchanged: a team with no completed rounds still gets
 * success with empty buckets.
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
// Real signature is (name, opts, impl) — returning the impl keeps the wrapper
// transparent without swallowing what it returns or throws.
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_name: string, _opts: unknown, impl: unknown) => impl,
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

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => tableChain(table),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

async function teamLeakMaps() {
  const mod = await import('@/app/golf/actions/stats-leak-maps');
  return mod.getTeamLeakMaps('team-1');
}

beforeEach(() => {
  outcomes.clear();
  outcomes.set('golf_teams', ok({ gender: 'mens' }));
  outcomes.set('golf_team_members', ok([{ player_id: 'p1' }]));
  outcomes.set('golf_rounds', ok([{ id: 'r1' }]));
  outcomes.set('golf_shots', ok([]));
});

describe('leak maps — a failed read is not a clean scorecard', () => {
  it('does not report success when the roster read failed', async () => {
    outcomes.set('golf_team_members', fails('connection reset'));

    expect((await teamLeakMaps()).success).toBe(false);
  });

  it('does not report success when the completed-rounds read failed', async () => {
    outcomes.set('golf_rounds', fails('statement timeout', '57014'));

    expect((await teamLeakMaps()).success).toBe(false);
  });

  it('does not report success when the shot read failed', async () => {
    outcomes.set('golf_shots', fails('permission denied', '42501'));

    expect((await teamLeakMaps()).success).toBe(false);
  });
});

describe('leak maps — honest empty states stay honest', () => {
  it('still succeeds for a team that genuinely has no completed rounds', async () => {
    outcomes.set('golf_rounds', ok([]));

    const result = await teamLeakMaps();

    expect(result.success).toBe(true);
    expect((result as { data: { roundsIncluded: number } }).data.roundsIncluded).toBe(0);
  });

  it('still succeeds for a team with rounds but no recorded shots', async () => {
    const result = await teamLeakMaps();

    expect(result.success).toBe(true);
  });
});
