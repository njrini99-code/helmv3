import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sentry JAVASCRIPT-NEXTJS-QK (N+1 Query, `from(golf_team_members)` on
 * GET /golf/dashboard/roster, 164 events since 2026-09-02, still firing on
 * release 6ee77e98): the roster page calls loadPlayersStandingMap(playerIds),
 * which resolved every distinct player's cohort with its own
 * loadPlayerCohort(id) → one golf_team_members read PER PLAYER, fanned out in
 * a Promise.all. The trace shows five ~700ms parallel reads on one render.
 *
 * The batched loader must resolve all cohorts with ONE golf_team_members read
 * (per `.in()` chunk) and keep the per-player gender result unchanged.
 */

type Row = Record<string, unknown>;

const standingRows: Row[] = [];
const memberRows: Row[] = [];
const teamMemberReads: Array<{ inIds?: string[]; eqs: Array<[string, unknown]> }> = [];

function standingBuilder() {
  const b = {
    select: () => b,
    in: () => b,
    order: () => b,
    range: () => Promise.resolve({ data: standingRows, error: null }),
  };
  return b;
}

function teamMembersBuilder() {
  const read: { inIds?: string[]; eqs: Array<[string, unknown]> } = { eqs: [] };
  teamMemberReads.push(read);
  const filtered = () =>
    memberRows.filter((r) => {
      if (read.inIds && !read.inIds.includes(r.player_id as string)) return false;
      return read.eqs.every(([col, val]) => r[col] === val);
    });
  const b = {
    select: () => b,
    in: (_col: string, ids: string[]) => {
      read.inIds = ids;
      return b;
    },
    eq: (col: string, val: unknown) => {
      read.eqs.push([col, val]);
      return b;
    },
    then: <T,>(onF: (v: { data: Row[]; error: null }) => T): Promise<T> =>
      Promise.resolve({ data: filtered(), error: null }).then(onF),
  };
  return b;
}

const standardsBuilder = () => {
  const b = {
    select: () => b,
    eq: () => b,
    order: () => Promise.resolve({ data: [], error: null }),
  };
  return b;
};

const from = vi.fn((table: string) => {
  if (table === 'golf_team_members') return teamMembersBuilder();
  if (table === 'golf_pga_standards') return standardsBuilder();
  return standingBuilder();
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from }),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: (client: { from: (t: string) => unknown }, table: string) => client.from(table),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
}));

import { loadPlayersStandingMap } from '@/lib/coachhelm/v3/standing/loader';

function standingRow(player_id: string) {
  return {
    player_id,
    metric_id: 'scrambling_pct_sand',
    player_value: 40,
    team_avg: null,
    team_n: 0,
    team_pct: null,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 50,
    pga_delta: -10,
    basis: null,
    on_green_proximity_feet: null,
    layup_excluded_n: null,
    computed_at: '2026-09-28T00:00:00.000Z',
  };
}

describe('loadPlayersStandingMap — roster cohort resolution (Sentry QK)', () => {
  beforeEach(() => {
    from.mockClear();
    teamMemberReads.length = 0;
    standingRows.length = 0;
    memberRows.length = 0;
  });

  it('reads golf_team_members once for the whole roster, not once per player', async () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    standingRows.push(...ids.map(standingRow));
    memberRows.push(
      ...ids.map((player_id) => ({ player_id, status: 'active', golf_teams: { gender: 'mens' } })),
    );

    const result = await loadPlayersStandingMap(ids);

    expect(teamMemberReads).toHaveLength(1);
    const [read] = teamMemberReads;
    expect(read?.inIds?.slice().sort()).toEqual([...ids].sort());
    expect(read?.eqs).toContainEqual(['status', 'active']);
    for (const id of ids) expect(result.get(id)?.get('scrambling_pct_sand')).toBeDefined();
  });

  it("keeps each player's own cohort: a women's-team player is anchored as women's, a men's is not", async () => {
    standingRows.push(standingRow('grace'), standingRow('tyler'), standingRow('loner'));
    memberRows.push(
      { player_id: 'grace', status: 'active', golf_teams: { gender: 'womens' } },
      { player_id: 'tyler', status: 'active', golf_teams: { gender: 'mens' } },
      // Inactive membership must not count (mirrors loadPlayerCohort's filter).
      { player_id: 'loner', status: 'removed', golf_teams: { gender: 'womens' } },
    );

    const result = await loadPlayersStandingMap(['grace', 'tyler', 'loner']);

    expect(teamMemberReads).toHaveLength(1);
    expect(result.get('grace')!.get('scrambling_pct_sand')!.is_womens).toBe(true);
    expect(result.get('tyler')!.get('scrambling_pct_sand')!.is_womens).toBeFalsy();
    // No active membership → men's default, unchanged behavior.
    expect(result.get('loner')!.get('scrambling_pct_sand')!.is_womens).toBeFalsy();
    expect(result.get('tyler')!.get('scrambling_pct_sand')!.pga_value).toBe(50);
  });
});
