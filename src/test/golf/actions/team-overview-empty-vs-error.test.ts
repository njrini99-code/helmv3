import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getTeamOverview builds the coach intelligence dashboard's shot analysis:
 * the yardage curve, the dead zones, and the ranked weakness contexts.
 *
 * Two reads discarded their error, and they fail differently:
 *
 *  - the round-id read. A failure leaves roundsData null, so the whole
 *    `if (roundsData && roundsData.length > 0)` block is skipped and the
 *    dashboard renders NO dead zones and NO weaknesses. On a screen whose job
 *    is to say where a team is losing strokes, that reads as "nothing to work
 *    on".
 *
 *  - the per-batch shot read. Round ids are fetched in batches of 100; a
 *    failure on one batch silently drops that batch's shots and the analysis is
 *    computed on PARTIAL data and presented as complete. That is worse than an
 *    empty dashboard: the "toughest band" a coach then trains against is
 *    derived from a subset nobody chose.
 *
 * Both now raise. The function's own catch already logs and returns
 * { success: false }, so the honest report was wired up and simply never given
 * anything to report.
 *
 * Honest empty is unchanged: a team with genuinely no completed rounds in the
 * window still succeeds with empty curves.
 */

const logServerError = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _o: unknown, impl: unknown) => impl,
}));
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({
    role: 'coach', coach: { id: 'coach-1', organization_id: 'org-1' }, player: null,
  }),
}));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1'),
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

async function overview() {
  const mod = await import('@/app/golf/actions/team-category-insights');
  return mod.getTeamOverview('team-1');
}

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  outcomes.set('golf_teams:single', ok({ id: 'team-1' }));
  outcomes.set('golf_team_members', ok([{ player_id: 'p1' }]));
  outcomes.set('golf_players', ok([{ id: 'p1' }]));
  outcomes.set('golf_rounds', ok([{ id: 'r1' }]));
  outcomes.set('golf_shots', ok([]));
  outcomes.set('golf_player_stats_cache', ok([]));
});

describe('team overview — a failed read is not "nothing to work on"', () => {
  it('does not report success when the round-id read failed', async () => {
    outcomes.set('golf_rounds', fails('statement timeout', '57014'));
    expect((await overview()).success).toBe(false);
  });

  it('does not report success when a shot batch failed', async () => {
    outcomes.set('golf_shots', fails('permission denied', '42501'));
    expect((await overview()).success).toBe(false);
  });
});

describe('team overview — honest empty stays honest', () => {
  it('still succeeds for a team with genuinely no completed rounds', async () => {
    outcomes.set('golf_rounds', ok([]));
    expect((await overview()).success).toBe(true);
  });

  it('still succeeds on the healthy path', async () => {
    expect((await overview()).success).toBe(true);
  });
});
