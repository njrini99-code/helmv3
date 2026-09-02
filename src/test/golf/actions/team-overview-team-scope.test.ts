import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getTeamOverview and getTeamCategoryInsights accept an OPTIONAL teamId.
 *
 * Both are `'use server'` exports, so the browser can POST any uuid. The auth
 * check they carried proved only that the caller is A coach — never a coach of
 * THAT team — and then did `team = { id: teamIdArg }` verbatim.
 *
 * This was not a live leak: every read runs on the RLS-scoped client, and
 * golf_team_members_select_v5 requires a golf_team_coach_staff row for the
 * team, so an outside coach resolved an empty roster. It is defense in depth.
 *
 * It is worth a test anyway, because the reason it was safe is the reason to
 * distrust it: on 2026-08-19 the goals_coach_create policy that was believed to
 * bind player to team turned out to have been authored twice and never applied
 * in production. "RLS covers it" is an assumption this codebase has already
 * been wrong about. A test pins the app-layer guarantee so it does not depend
 * on a policy staying applied.
 */

const validateCoachTeamAccess = vi.fn();

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
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
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'my-team'),
}));
vi.mock('@/lib/golf/resolve-team', () => ({
  validateCoachTeamAccess: (...a: unknown[]) => validateCoachTeamAccess(...a),
}));

type Outcome = { data: unknown; error: unknown };
const memberReads: string[] = [];

function tableChain(table: string) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  const settle = (): Outcome => ({ data: [], error: null });
  Object.assign(node, {
    select: self,
    eq: (col: string, val: unknown) => {
      if (table === 'golf_team_members' && col === 'team_id') memberReads.push(String(val));
      return node;
    },
    in: self, not: self, or: self, is: self, neq: self, gt: self, lt: self,
    gte: self, lte: self, order: self, limit: self, range: self, filter: self,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
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

async function mod() {
  return import('@/app/golf/actions/team-category-insights');
}

describe('team overview / category insights — a passed teamId is authorized', () => {
  beforeEach(() => {
    validateCoachTeamAccess.mockReset();
    memberReads.length = 0;
  });

  it('getTeamOverview REFUSES a team the coach does not staff', async () => {
    validateCoachTeamAccess.mockResolvedValue(false);

    const res = await (await mod()).getTeamOverview('someone-elses-team');

    expect(res.success).toBe(false);
    expect(validateCoachTeamAccess).toHaveBeenCalledWith(
      expect.anything(), 'coach-1', 'someone-elses-team', 'org-1',
    );
    // The stronger assertion: the roster read never even ran for that team, so
    // the refusal cannot be mistaken for "that team happens to be empty".
    expect(memberReads).not.toContain('someone-elses-team');
  });

  it('getTeamCategoryInsights REFUSES a team the coach does not staff', async () => {
    validateCoachTeamAccess.mockResolvedValue(false);

    const res = await (await mod()).getTeamCategoryInsights('someone-elses-team');

    expect(res.success).toBe(false);
    expect(memberReads).not.toContain('someone-elses-team');
  });

  it('STILL serves a team the coach does staff', async () => {
    validateCoachTeamAccess.mockResolvedValue(true);

    await (await mod()).getTeamOverview('my-team');

    // Without this the fix could be a blanket refusal of every passed teamId,
    // which would break the intelligence page and still look green above.
    expect(memberReads).toContain('my-team');
  });

  it('does not demand authorization when no teamId is passed', async () => {
    validateCoachTeamAccess.mockResolvedValue(false);

    await (await mod()).getTeamOverview();

    // The no-arg path resolves the team from the coach's own session, so it was
    // never the risky one and must not start failing.
    expect(validateCoachTeamAccess).not.toHaveBeenCalled();
    expect(memberReads).toContain('my-team');
  });
});
