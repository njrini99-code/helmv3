import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Discover's core rule is "only players assigned to a discoverable team".
 * `getDiscoverableTeamPlayerIds` resolves that list in three steps, and the
 * three steps disagreed about what to do when a read failed.
 *
 * Steps 1 and 2 (orgs, teams) fail closed — they return `[]`, and the caller's
 * early return then yields no results. Step 3 (team members) returned `null`,
 * and `null` was consumed as "no constraint": the early return was skipped
 * (`!== null && length === 0`) and the `.in('id', ...)` filter was skipped
 * (`ids && ids.length > 0`).
 *
 * So a failure in the members read alone did not narrow Discover — it removed
 * the core rule entirely and returned every recruiting-activated non-college
 * player in the database, cross-tenant, including players belonging to
 * programs that had turned their public profile off.
 *
 * `null` now means refuse, which is what it already means in the Compare
 * surface's copy of this filter. The honest empty state is unchanged and
 * covered below: a coach whose discoverable set is genuinely empty still gets
 * an empty listing, and a healthy read still filters to the discoverable set.
 */

const logServerError = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Outcome = { data: unknown; error: unknown; count?: number };

const outcomes = new Map<string, Outcome>();
const ok = (data: unknown, count?: number): Outcome => ({ data, error: null, count });
const fails = (message: string, code = '08006'): Outcome => ({
  data: null,
  error: { message, code },
});

/** Every `.in('id', ...)` applied to the baseball_players query. */
let playersIdInFilters: string[][] = [];

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([], 0);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    neq: self,
    not: self,
    or: self,
    order: self,
    range: self,
    limit: self,
    gte: self,
    lte: self,
    in: (col: string, vals: unknown) => {
      if (table === 'baseball_players' && col === 'id' && Array.isArray(vals)) {
        playersIdInFilters.push(vals as string[]);
      }
      return node;
    },
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

/** A player who is NOT on any discoverable team — must never be listed. */
const OUTSIDER = {
  id: 'player-outsider',
  first_name: 'Out',
  last_name: 'Sider',
  recruiting_activated: true,
  player_type: 'high_school',
};

async function discover() {
  const mod = await import('@/app/baseball/actions/discover');
  return mod.getDiscoverPlayers({});
}

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  playersIdInFilters = [];
  outcomes.set('baseball_coaches', ok({ id: 'coach-1', coach_type: 'college' }));
  outcomes.set('organizations', ok([{ id: 'org-1' }]));
  outcomes.set('baseball_teams_public_profile', ok([{ id: 'team-1' }]));
  outcomes.set('baseball_team_members', ok([{ player_id: 'player-inside' }]));
  outcomes.set('baseball_player_settings', ok([]));
  outcomes.set('baseball_team_coach_staff', ok([]));
  // The listing itself always "succeeds" and would happily return the
  // outsider — the discoverable-team filter is the only thing keeping them out.
  outcomes.set('baseball_players', ok([OUTSIDER], 1));
});

describe('Discover — a failed discoverable-team read must not drop the core rule', () => {
  it('does not return an unfiltered listing when the team-members read fails', async () => {
    outcomes.set('baseball_team_members', fails('statement timeout', '57014'));

    const result = await discover();

    // Pre-fix this returned the outsider: no early return, and no `.in()`.
    expect(result.players).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('records the cause rather than silently widening the audience', async () => {
    outcomes.set('baseball_team_members', fails('permission denied', '42501'));

    await discover();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /discoverable/i.test(m))).toBe(true);
  });
});

describe('Discover — the honest behaviours are unchanged', () => {
  it('still constrains the listing to the discoverable set on a healthy read', async () => {
    await discover();

    expect(playersIdInFilters.some((vals) => vals.includes('player-inside'))).toBe(true);
  });

  it('still returns an empty listing when nobody is genuinely on a discoverable team', async () => {
    outcomes.set('baseball_team_members', ok([]));

    const result = await discover();

    expect(result.players).toEqual([]);
    expect(result.count).toBe(0);
  });
});
