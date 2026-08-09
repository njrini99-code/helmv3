import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * Three reads on the Team Info page discarded their error.
 *
 * PLAYER branch:
 *  - the roster read: a failure renders a team with no teammates on it
 *  - the announcements read: a failure renders a team that has said nothing
 * Both are lists a player reads as the state of their team.
 *
 * COACH branch:
 *  - the staffed-teams read. The comment on it explains what it is for: a
 *    program head staffing two squads sees BOTH join codes side by side,
 *    because otherwise "a coach writing two invite emails back to back could
 *    hand the women's team the men's code. The code would be perfectly valid,
 *    the players would land on the wrong roster, and nothing would flag it."
 *    A failed read collapses staffedIds to [], the disambiguation never
 *    renders, and that safety affordance disappears silently — leaving exactly
 *    the situation it was built to prevent.
 *
 * Only failure paths change. A team genuinely with one squad, no teammates or
 * no announcements still renders those honest empty states.
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
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1'),
}));

let session: unknown;
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => session,
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });
const fails = (m: string, code = '08006'): Outcome => ({ data: null, error: { message: m, code } });

// A table can be read BOTH as a list and via .maybeSingle() on the same page —
// golf_team_members is. One outcome per table cannot serve both shapes, and the
// resulting TypeError made unrelated assertions pass. `<table>:single` is the
// single-row form.
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
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

async function renderPage() {
  const mod = await import('@/app/golf/(dashboard)/dashboard/team/page');
  return (mod.default as () => Promise<unknown>)();
}

const asPlayer = () => ({ role: 'player', coach: null, player: { id: 'player-1' } });
const asCoach = () => ({ role: 'coach', coach: { id: 'coach-1', organization_id: 'org-1' }, player: null });

beforeAll(async () => {
  await import('@/app/golf/(dashboard)/dashboard/team/page');
}, 60_000);

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  session = asPlayer();
  outcomes.set('golf_team_members:single', ok({ team_id: 'team-1', player_id: 'player-1' }));
  outcomes.set('golf_team_members', ok([{ team_id: 'team-1', player_id: 'player-1' }]));
  outcomes.set('golf_teams:single', ok({ id: 'team-1', name: 'Shenandoah' }));
  outcomes.set('golf_teams', ok([{ id: 'team-1', name: 'Shenandoah' }]));
  outcomes.set('golf_players', ok([{ id: 'player-1', first_name: 'A', last_name: 'B' }]));
  outcomes.set('golf_announcements', ok([]));
  outcomes.set('golf_coaches:single', ok({ id: 'coach-1', organization_id: 'org-1' }));
  outcomes.set('golf_team_coach_staff', ok([{ team_id: 'team-1' }]));
});

describe('team page — a failed read is not an empty team', () => {
  it('does not render a team with no teammates when the roster read failed', async () => {
    outcomes.set('golf_players', fails('statement timeout', '57014'));
    await expect(renderPage()).rejects.toThrow();
  });

  it('does not render a silent team when the announcements read failed', async () => {
    outcomes.set('golf_announcements', fails('connection reset'));
    await expect(renderPage()).rejects.toThrow();
  });

  it('does not drop the join-code disambiguation when the staffing read failed', async () => {
    session = asCoach();
    outcomes.set('golf_team_coach_staff', fails('permission denied', '42501'));
    await expect(renderPage()).rejects.toThrow();
  });

  it('records the cause', async () => {
    outcomes.set('golf_announcements', fails('permission denied', '42501'));
    await renderPage().catch(() => {});
    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /announcement|roster|staff/i.test(m))).toBe(true);
  });
});

describe('team page — honest empty states stay honest', () => {
  it('still renders a team that genuinely has no announcements', async () => {
    await expect(renderPage()).resolves.toBeTruthy();
  });

  it('still renders a coach staffing a single squad', async () => {
    session = asCoach();
    await expect(renderPage()).resolves.toBeTruthy();
  });
});
