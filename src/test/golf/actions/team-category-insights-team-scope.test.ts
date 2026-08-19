import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Wave A3 — getTeamOverview / getTeamCategoryInsights accepted a
 * caller-supplied `teamId` and used it directly, with ZERO ownership check.
 * Unlike the cookie-resolved fallback path (which goes through
 * `resolveCoachTeamIdWithCookie` -> `validateCoachTeamAccess`), and unlike
 * the near-identical sibling `getTeamStatsIntelligence` in
 * stats-intelligence.ts (already fixed with this exact pattern), an
 * authenticated coach invoking either export directly with an arbitrary
 * teamId got that team's real roster/stats data back — no staffing check,
 * only `session?.coach` (role, not team) and a non-null orgId.
 *
 * Both now call `validateCoachTeamAccess` on a caller-supplied teamId before
 * touching anything scoped to it, matching stats-intelligence.ts.
 *
 * Discriminating design: `golf_team_members` for "team-B" holds a REAL,
 * non-empty roster and `golf_player_stats_cache` holds a REAL, distinctive
 * stat (driving distance far above the D2/D3 benchmark). Against the old
 * code this computes and returns team B's actual composite rating —
 * `getTeamOverview` proves the leak was of real data, not an empty-team
 * false negative. `getTeamCategoryInsights` shares the identical
 * `if (teamIdArg) { team = { id: teamIdArg }; }` shape one-for-one, so its
 * test proves the same gate is applied by asserting `golf_team_members` is
 * never even queried once the check denies access.
 */

const validateCoachTeamAccess = vi.fn(
  async (_supabase: unknown, _coachId: string, _teamId: string, _orgId: unknown) => true,
);

vi.mock('@/lib/golf/resolve-team', () => ({
  validateCoachTeamAccess: (
    supabase: unknown,
    coachId: string,
    teamId: string,
    orgId: unknown,
  ) => validateCoachTeamAccess(supabase, coachId, teamId, orgId),
}));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  // Only exercised on the no-teamIdArg fallback branch, which these tests
  // don't take (every call below supplies an explicit teamId).
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-cookie-fallback'),
}));
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({
    role: 'coach',
    coach: { id: 'coach-A', organization_id: 'org-1' },
    player: null,
  }),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _o: unknown, impl: unknown) => impl,
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (d: unknown): Outcome => ({ data: d, error: null });

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, not: self, or: self, is: self, neq: self,
    gt: self, lt: self, gte: self, lte: self, order: self, limit: self, range: self, filter: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (r: (v: Outcome) => unknown, j?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(r, j),
  });
  return node;
}

/** Wraps tableChain so tests can assert which tables were actually touched. */
const fromCalls: string[] = [];
const mockFrom = vi.fn((table: string) => {
  fromCalls.push(table);
  return tableChain(table);
});

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: mockFrom,
  rpc: async () => ({ data: null, error: null }),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));

async function overview(teamId?: string) {
  const mod = await import('@/app/golf/actions/team-category-insights');
  return mod.getTeamOverview(teamId);
}
async function categoryInsights(teamId?: string) {
  const mod = await import('@/app/golf/actions/team-category-insights');
  return mod.getTeamCategoryInsights(teamId);
}

beforeEach(() => {
  validateCoachTeamAccess.mockClear();
  validateCoachTeamAccess.mockResolvedValue(true);
  outcomes.clear();
  fromCalls.length = 0;

  // "team-B" — a team coach-A does NOT staff — with a REAL, non-empty
  // roster and a REAL, distinctive stat line. If the auth check is bypassed
  // this is exactly what a leak returns.
  outcomes.set('golf_team_members', ok([{ player_id: 'p1' }]));
  outcomes.set(
    'golf_player_stats_cache',
    ok([{ player_id: 'p1', driving_distance_average: 340 }]), // far above the 290 "good" benchmark
  );
  outcomes.set('golf_players', ok([{ id: 'p1', first_name: 'Jordan', last_name: 'Rival', avatar_url: null }]));
  // Empty so getTeamOverview's shot-analysis branch and
  // getTeamCategoryInsights's round-sampling branch both short-circuit —
  // neither is what this test is about.
  outcomes.set('golf_rounds', ok([]));
  outcomes.set('golf_shots', ok([]));
});

describe('getTeamOverview — a caller-supplied teamId is not more trusted than a cookie', () => {
  it('checks staffing before honouring an explicit teamId', async () => {
    await overview('team-B');

    expect(validateCoachTeamAccess).toHaveBeenCalledTimes(1);
    const [, coachId, teamId, orgId] = validateCoachTeamAccess.mock.calls[0] as unknown as [
      unknown, string, string, string,
    ];
    expect(coachId).toBe('coach-A');
    expect(teamId).toBe('team-B');
    expect(orgId).toBe('org-1');
  });

  it('refuses — and never reads team-B data — when the coach does not staff that team', async () => {
    validateCoachTeamAccess.mockResolvedValue(false);

    const result = await overview('team-B');

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    // The pre-fix function proceeded straight into `golf_team_members` for
    // team-B; the fix must deny before ever touching it.
    expect(fromCalls).not.toContain('golf_team_members');
    expect(fromCalls).not.toContain('golf_player_stats_cache');
  });

  it('returns team-B\'s real, non-default composite when the coach IS staffed there', async () => {
    // Sanity check that the fixture's stat line is not neutral, so the
    // denial-path assertion above is meaningful and not just "empty roster".
    const result = await overview('team-B');

    expect(result.success).toBe(true);
    if (result.success) {
      // 340 yd average is well above the 290 "good" benchmark — the
      // computed composite must be pulled up off the neutral default of 50.
      expect(result.data!.teamComposite).toBeGreaterThan(50);
      expect(result.data!.playerCount).toBe(1);
    }
  });

  it('does not re-check when no teamId is supplied (cookie-resolved fallback)', async () => {
    await overview(undefined);
    expect(validateCoachTeamAccess).not.toHaveBeenCalled();
  });
});

describe('getTeamCategoryInsights — same caller-supplied-teamId gate', () => {
  it('checks staffing before honouring an explicit teamId', async () => {
    await categoryInsights('team-B');

    expect(validateCoachTeamAccess).toHaveBeenCalledTimes(1);
    const [, coachId, teamId, orgId] = validateCoachTeamAccess.mock.calls[0] as unknown as [
      unknown, string, string, string,
    ];
    expect(coachId).toBe('coach-A');
    expect(teamId).toBe('team-B');
    expect(orgId).toBe('org-1');
  });

  it('refuses — and never reads team-B data — when the coach does not staff that team', async () => {
    validateCoachTeamAccess.mockResolvedValue(false);

    const result = await categoryInsights('team-B');

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(fromCalls).not.toContain('golf_team_members');
    expect(fromCalls).not.toContain('golf_player_stats_cache');
  });

  it('still succeeds when the coach IS staffed on the requested team', async () => {
    const result = await categoryInsights('team-B');
    expect(result.success).toBe(true);
  });

  it('does not re-check when no teamId is supplied (cookie-resolved fallback)', async () => {
    await categoryInsights(undefined);
    expect(validateCoachTeamAccess).not.toHaveBeenCalled();
  });
});
