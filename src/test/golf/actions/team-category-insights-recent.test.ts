import { describe, it, expect, vi } from 'vitest';

/**
 * getTeamCategoryInsights: team means and the 1-SD flag use CURRENT players
 * only, fairway % and GIR % come from countable rounds, and each category
 * carries a TEAM strokes-available figure (2026-09 accuracy audit rows 1, 2
 * and 7).
 */

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
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));
vi.mock('@/lib/golf/resolve-team', () => ({ validateCoachTeamAccess: vi.fn(async () => true) }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoachWithMeta: vi.fn(async () => ({ ok: true, data: [], total: 0, capped: false })),
}));

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const round = (id: string, player_id: string, age: number, fw: [number, number], gir: [number, number]) => ({
  id,
  player_id,
  round_date: daysAgo(age),
  total_score: 74,
  score_to_par: 2,
  total_putts: 30,
  holes_played: 18,
  front_nine: 37,
  back_nine: 37,
  total_fairways_hit: fw[0],
  total_fairways: fw[1],
  total_gir: gir[0],
  total_gir_possible: gir[1],
});

const TABLES: Record<string, unknown[]> = {
  golf_team_members: [{ player_id: 'p1' }, { player_id: 'p2' }, { player_id: 'p3' }],
  golf_players: [
    { id: 'p1', first_name: 'Ann', last_name: 'A', avatar_url: null },
    { id: 'p2', first_name: 'Bea', last_name: 'B', avatar_url: null },
    { id: 'p3', first_name: 'Cal', last_name: 'C', avatar_url: null },
  ],
  // Stale cache values: must not drive fairway % / GIR % any more.
  golf_player_stats_cache: ['p1', 'p2', 'p3'].map((player_id) => ({
    player_id,
    driving_accuracy_percentage: 99,
    gir_percentage: 99,
    scrambling_percentage: 40,
  })),
  golf_rounds: [
    round('r1', 'p1', 5, [7, 14], [9, 18]),
    round('r2', 'p1', 400, [14, 14], [18, 18]),
    round('r3', 'p2', 10, [10, 14], [12, 18]),
    // p3 has not played in 200 days: out of the team mean.
    round('r4', 'p3', 200, [0, 14], [0, 18]),
  ],
  golf_coach_insights: [
    { id: 'i1', player_id: 'p1', category: 'putting', evidence: { counterfactual: { strokes_saved_per_round: 1.2 } } },
    { id: 'i2', player_id: 'p1', category: 'putting', evidence: { counterfactual: { strokes_saved_per_round: 0.4 } } },
    { id: 'i3', player_id: 'p3', category: 'putting', evidence: { counterfactual: { strokes_saved_per_round: 3.0 } } },
  ],
};

function tableChain(table: string) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, not: self, or: self, is: self, neq: self, gt: self, lt: self,
    gte: self, lte: self, order: self, limit: self, range: self, filter: self,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (r: (v: { data: unknown; error: unknown }) => unknown, j?: (e: unknown) => unknown) =>
      Promise.resolve({ data: TABLES[table] ?? [], error: null }).then(r, j),
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

describe('getTeamCategoryInsights — current players and team figures', () => {
  it('builds team means from players with a recent countable round, from the rounds themselves', async () => {
    const { getTeamCategoryInsights } = await import('@/app/golf/actions/team-category-insights');
    const res = await getTeamCategoryInsights('team-1');
    expect(res.success).toBe(true);
    const cats = new Map(res.data!.categories.map((c) => [c.id, c]));

    const driving = cats.get('driving')!;
    expect(driving.players.map((p) => p.playerId).sort()).toEqual(['p1', 'p2']);
    expect(driving.playersCounted).toBe(2);
    expect(driving.playersWithoutRecentRound).toBe(1);
    // p1 lifetime countable: (7+14)/(14+14) = 75%; p2 10/14 = 71.4%. Not the cache's 99.
    const p1 = driving.players.find((p) => p.playerId === 'p1')!;
    expect(p1.value).toBeCloseTo(75, 5);
    expect(driving.teamAvg).toBeCloseTo((75 + (10 / 14) * 100) / 2, 1);

    const approach = cats.get('approach')!;
    expect(approach.players.find((p) => p.playerId === 'p2')!.value).toBeCloseTo((12 / 18) * 100, 5);
  });

  it('gives each category a roster-mean strokes-available figure over current players', async () => {
    const { getTeamCategoryInsights } = await import('@/app/golf/actions/team-category-insights');
    const res = await getTeamCategoryInsights('team-1');
    const putting = res.data!.categories.find((c) => c.id === 'putting')!;
    // p1's largest live figure 1.2 over 2 current players; p3 (inactive, 3.0) is out.
    expect(putting.strokesAvailable).toEqual({ perRound: 0.6, playersWithLeak: 1, playersCounted: 2 });
    expect(res.data!.categories.find((c) => c.id === 'approach')!.strokesAvailable).toBeNull();
  });
});
