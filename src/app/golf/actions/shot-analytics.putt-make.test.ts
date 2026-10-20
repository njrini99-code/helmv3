import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Player shot analytics' putting-by-distance readout uses the ONE putt make %
 * definition (owner decision Q-93, src/lib/golf/putt-make.ts): start distance
 * from distance_to_hole_before (feet, clamped; putt_distance_feet is not read),
 * made = result 'hole' OR putt_made true, bands (lo, hi].
 */

let roundsQueue: unknown[][] = [];
let holesByRound: Record<string, unknown[]> = {};
let shotRows: unknown[] = [];

function chain(table: string) {
  let inIds: string[] | null = null;
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'limit', 'not']) c[m] = vi.fn(() => c);
  c.in = vi.fn((_col: string, ids: string[]) => { inIds = ids; return c; });
  const rows = () => {
    if (table === 'golf_rounds') return roundsQueue.shift() ?? [];
    if (table === 'golf_holes') return (inIds ?? []).flatMap((id) => holesByRound[id] ?? []);
    if (table === 'golf_shots') return shotRows;
    return [];
  };
  c.single = vi.fn(async () => ({ data: { id: 'player-1', first_name: 'T', last_name: 'P' }, error: null }));
  c.range = vi.fn(async () => ({ data: rows(), error: null }));
  c.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: rows(), error: null }).then(resolve);
  return c;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (t: string) => chain(t),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' })),
}));
vi.mock('@/lib/supabase/fetch-all-rows', () => ({
  fetchAllRowsResult: vi.fn(async (q: (f: number, t: number) => Promise<unknown>) => q(0, 999_999)),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: <A extends unknown[], R>(_n: string, _o: unknown, fn: (...a: A) => Promise<R>) =>
    (...a: A) => fn(...a),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined) }));

function round(id: string, date: string) {
  return {
    id, round_date: date, total_putts: 30, total_fairways_hit: 7, total_fairways: 14,
    total_gir: 9, total_gir_possible: 18, total_score: 75, holes_played: 18,
  };
}

function holes(roundId: string) {
  return Array.from({ length: 18 }, (_, i) => ({
    id: `${roundId}-h${i}`, round_id: roundId, hole_number: i + 1, par: 4, score: 5, putts: 2,
    fairway_hit: true, gir: i < 9, up_and_down: null, sand_save: null,
  }));
}

let n = 0;
function putt(feet: number | null, how: 'hole_null' | 'made_true' | 'miss_false' | 'miss_null') {
  n += 1;
  return {
    id: `p${n}`, round_id: 'r1', hole_number: 1, shot_number: n, shot_type: 'putting', club_type: 'putter',
    lie_before: 'green', distance_to_hole_before: feet, distance_unit_before: 'feet',
    distance_to_hole_after: how === 'hole_null' || how === 'made_true' ? 0 : 2, distance_unit_after: 'feet',
    shot_distance: null, miss_direction: null,
    result: how === 'hole_null' ? 'hole' : 'green',
    // Decoy: the readout must not start from this field.
    putt_distance_feet: 99,
    putt_made: how === 'hole_null' || how === 'miss_null' ? null : how === 'made_true',
  };
}

beforeEach(() => {
  roundsQueue = [];
  holesByRound = {};
  shotRows = [];
  n = 0;
});

describe('player shot analytics — putting by distance on the shared make % definition', () => {
  it('bands on distance_to_hole_before with upper-inclusive edges, and counts a holed putt with a null putt_made', async () => {
    const { getPlayerShotAnalytics } = await import('./shot-analytics');
    roundsQueue = [[round('r1', '2026-09-20')], []];
    holesByRound = { r1: holes('r1') };
    shotRows = [
      putt(5, 'hole_null'), // 5 ft: inside 5 (the edge is inclusive); holed, putt_made null
      putt(4, 'miss_false'),
      putt(5.5, 'made_true'), // 5-10
      putt(10, 'hole_null'), // 10 ft: still 5-10 (inclusive)
      putt(10, 'miss_null'),
      putt(10.5, 'miss_false'), // outside 10
      putt(30, 'hole_null'), // outside 10
      putt(null, 'hole_null'), // no start distance: not banded
    ];

    const res = await getPlayerShotAnalytics('11111111-1111-4111-8111-111111111111', 30);
    if (!res.success) throw new Error('expected data');
    const p = res.data.puttingStats;

    expect(p.inside5ft).toMatchObject({ attempts: 2, made: 1 });
    expect(p.fiveTo10ft).toMatchObject({ attempts: 3, made: 2 });
    expect(p.outside10ft).toMatchObject({ attempts: 2, made: 1 });
  });
});
