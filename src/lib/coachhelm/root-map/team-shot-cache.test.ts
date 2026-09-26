/**
 * Team shot cache: the access gate runs before the cache, the cache only sees
 * RLS-picked round ids, and entries are keyed so one team's rows never answer
 * another team's call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(() => Promise.resolve()) }));

// A tiny in-memory data cache that behaves like unstable_cache: the key is the
// fixed key parts plus the JSON of the call arguments.
const store = new Map<string, unknown>();
const cacheCalls: Array<{ keyParts: string[]; args: unknown[]; revalidate: unknown; tags: unknown }> = [];
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => Promise<unknown>, keyParts: string[], opts: { revalidate?: number; tags?: string[] }) =>
    async (...args: unknown[]) => {
      cacheCalls.push({ keyParts, args, revalidate: opts.revalidate, tags: opts.tags });
      const key = `${keyParts.join(',')}-${JSON.stringify(args)}`;
      if (!store.has(key)) store.set(key, await fn(...args));
      return store.get(key);
    },
}));

vi.mock('@/lib/supabase/fetch-all-rows', () => ({
  fetchAllRowsResult: (make: (from: number, to: number) => PromiseLike<unknown>) => make(0, 999),
}));

type Row = Record<string, unknown>;

/** Chainable fake: filters rows by eq / in / not-null and records reads. */
function fakeClient(tables: Record<string, Row[]>, rpc: Record<string, (args: Row) => unknown>, reads: string[]) {
  return {
    rpc: vi.fn(async (name: string, args: Row) => ({ data: rpc[name]?.(args) ?? null, error: null })),
    from(table: string) {
      reads.push(table);
      let rows = [...(tables[table] ?? [])];
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => ((rows = rows.filter((r) => r[col] === v)), q),
        in: (col: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[col]))), q),
        not: (col: string) => ((rows = rows.filter((r) => r[col] !== null && r[col] !== undefined)), q),
        order: () => q,
        range: () => q,
        then: (res: (v: unknown) => unknown) => res({ data: rows, error: null }),
      };
      return q;
    },
  };
}

function round(id: string, playerId: string, date: string, updatedAt: string): Row {
  return {
    id,
    player_id: playerId,
    status: 'completed',
    round_date: date,
    updated_at: updatedAt,
    created_at: updatedAt,
    holes_played: 18,
    total_score: 74,
    front_nine: 36,
    back_nine: 38,
    total_putts: 31,
    strokes_gained_total: -1,
    strokes_gained_tee: 0.2,
    strokes_gained_approach: -0.8,
    strokes_gained_around_green: -0.1,
    strokes_gained_putting: -0.3,
  };
}

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const DATA = {
  golf_team_members: [
    { team_id: TEAM_A, player_id: 'pa', status: 'active' },
    { team_id: TEAM_B, player_id: 'pb', status: 'active' },
  ],
  golf_rounds: [round('ra1', 'pa', '2026-09-01', '2026-09-01T12:00:00Z'), round('rb1', 'pb', '2026-09-02', '2026-09-02T12:00:00Z')],
  golf_holes: [
    { id: 'ha1', round_id: 'ra1', hole_number: 1, par: 4, yardage: 400, score: 4, penalty_strokes: 0, putts: 2, gir: true },
    { id: 'hb1', round_id: 'rb1', hole_number: 1, par: 4, yardage: 380, score: 5, penalty_strokes: 0, putts: 2, gir: false },
  ],
  golf_shots: [
    { id: 'sa1', round_id: 'ra1', hole_id: 'ha1', hole_number: 1, shot_number: 1, shot_type: 'tee' },
    { id: 'sb1', round_id: 'rb1', hole_id: 'hb1', hole_number: 1, shot_number: 1, shot_type: 'tee' },
  ],
} satisfies Record<string, Row[]>;

const adminReads: string[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => fakeClient(DATA, { sg_scale_for_player: () => 1.02 }, adminReads),
}));

import { loadTeamShotContextCached, TEAM_SHOT_CACHE_TTL_S, teamShotCacheTag } from './team-shot-cache';

/** A coach of `coaches`; RLS on golf_rounds limited to those teams' players. */
function requestClient(coaches: string[], reads: string[] = []) {
  const visiblePlayers = new Set<unknown>(DATA.golf_team_members.filter((m) => coaches.includes(m.team_id as string)).map((m) => m.player_id));
  const tables = { ...DATA, golf_rounds: DATA.golf_rounds.filter((r) => visiblePlayers.has(r.player_id)) };
  return fakeClient(tables, { is_golf_team_coach: (a) => coaches.includes(a.team_uuid as string) }, reads) as never;
}

beforeEach(() => {
  store.clear();
  cacheCalls.length = 0;
  adminReads.length = 0;
});

describe('loadTeamShotContextCached', () => {
  it('returns the same shape as the uncached read, and a second load is served from the cache', async () => {
    const first = await loadTeamShotContextCached(requestClient([TEAM_A]), TEAM_A, ['pa']);
    expect(first?.get('pa')?.rounds.map((r) => r.id)).toEqual(['ra1']);
    expect(first?.get('pa')?.shots.map((s) => s.id)).toEqual(['sa1']);
    expect(first?.get('pa')?.holes.map((h) => h.id)).toEqual(['ha1']);
    expect(first?.get('pa')?.scale).toBe(1.02);
    const adminAfterFirst = adminReads.length;
    expect(adminAfterFirst).toBeGreaterThan(0);

    const second = await loadTeamShotContextCached(requestClient([TEAM_A]), TEAM_A, ['pa']);
    expect(second?.get('pa')?.shots.map((s) => s.id)).toEqual(['sa1']);
    expect(adminReads.length).toBe(adminAfterFirst);
    expect(cacheCalls[0]?.revalidate).toBe(TEAM_SHOT_CACHE_TTL_S);
    expect(cacheCalls[0]?.tags).toEqual([teamShotCacheTag(TEAM_A)]);
  });

  it('refuses a caller who does not coach the team before touching the cache', async () => {
    // Warm team B's entry first, then a team-A-only coach asks for team B.
    await loadTeamShotContextCached(requestClient([TEAM_B]), TEAM_B, ['pb']);
    cacheCalls.length = 0;
    const res = await loadTeamShotContextCached(requestClient([TEAM_A]), TEAM_B, ['pb']);
    expect(res).toBeNull();
    expect(cacheCalls).toHaveLength(0);
  });

  it('drops requested players who are not on the team roster', async () => {
    // Coach of both teams asks team A for a team B player: pb never reaches the cache.
    const res = await loadTeamShotContextCached(requestClient([TEAM_A, TEAM_B]), TEAM_A, ['pa', 'pb']);
    expect([...(res?.keys() ?? [])]).toEqual(['pa']);
    expect(cacheCalls.map((c) => c.args[1])).toEqual(['pa']);
  });

  it('keys each entry by team, player, round ids and the newest round update', async () => {
    await loadTeamShotContextCached(requestClient([TEAM_A]), TEAM_A, ['pa']);
    expect(cacheCalls[0]?.args).toEqual([TEAM_A, 'pa', ['ra1'], '2026-09-01T12:00:00Z']);

    // An edited round moves the stamp: a new entry, fresh reads.
    const before = adminReads.length;
    const edited = DATA.golf_rounds[0]!;
    const saved = edited.updated_at;
    edited.updated_at = '2026-09-03T08:00:00Z';
    try {
      await loadTeamShotContextCached(requestClient([TEAM_A]), TEAM_A, ['pa']);
    } finally {
      edited.updated_at = saved;
    }
    expect(cacheCalls[1]?.args[3]).toBe('2026-09-03T08:00:00Z');
    expect(adminReads.length).toBeGreaterThan(before);
  });

  it('never gives the service client a round the request client could not see', async () => {
    const reads: string[] = [];
    await loadTeamShotContextCached(requestClient([TEAM_A], reads), TEAM_A, ['pa']);
    expect(reads).toContain('golf_rounds');
    expect(adminReads).not.toContain('golf_rounds');
    expect(cacheCalls.flatMap((c) => c.args[2] as string[])).toEqual(['ra1']);
  });
});
