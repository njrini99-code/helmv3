import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerEvent: vi.fn().mockResolvedValue(undefined),
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

import { logServerEvent } from '@/lib/server-error-logger';
import {
  __resetTeamPoolMemo,
  assembleTeamPlayers,
  loadTeamPoolPlayers,
  resolvePlayerTeam,
} from '../loader';
import { computeTeamPool } from '../pool';

// Synthetic rows only.
type Row = Record<string, unknown>;

/** A tiny PostgREST stand-in: eq / in / gte filters, order ignored, range pages. */
function fakeSupabase(tables: Record<string, Row[]>, opts: { failOn?: string; calls?: string[] } = {}): SupabaseClient {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let page: [number, number] | null = null;
      const run = () => {
        opts.calls?.push(table);
        if (opts.failOn === table) return { data: null, error: { message: 'boom', code: 'XX000' } };
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return { data: page ? rows.slice(page[0], page[1] + 1) : rows, error: null };
      };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b),
        gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b),
        order: () => b,
        range: (from: number, to: number) => ((page = [from, to]), b),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
      };
      return b;
    },
  } as unknown as SupabaseClient;
}

const NOW = Date.parse('2026-10-20T12:00:00Z');

function fixture(teammates = 5, roundsEach = 4) {
  const ids = ['me', ...Array.from({ length: teammates }, (_, i) => `t${i}`)];
  const members = ids.map((player_id) => ({ player_id, team_id: 'team-1', status: 'active' }));
  members.push({ player_id: 'other', team_id: 'team-2', status: 'active' });
  const rounds: Row[] = [];
  const holes: Row[] = [];
  const shots: Row[] = [];
  let n = 0;
  for (const pid of ids) {
    for (let i = 0; i < roundsEach; i += 1) {
      n += 1;
      const id = `${pid}-r${i}`;
      rounds.push({
        id, player_id: pid, round_date: `2026-09-${String(10 + i).padStart(2, '0')}`, status: 'completed', is_test: false,
        holes_played: 18, total_score: 72, front_nine: 36, back_nine: 36, total_putts: 36,
      });
      for (let h = 0; h < 18; h += 1) {
        holes.push({ id: `h${n}-${h}`, round_id: id, par: 4, score: 4, putts: h === 0 ? 3 : 2, penalty_strokes: 0, gir: true, sand_save: null, up_and_down: null });
      }
      for (let p = 0; p < 30; p += 1) {
        shots.push({ id: `s${n}-${p}`, round_id: id, shot_type: 'putting', distance_to_hole_before: 4, distance_unit_before: 'feet', distance_to_hole_after: 0, result: p < 24 ? 'hole' : 'green', lie_after: 'green', putt_made: p < 24 });
      }
      shots.push({ id: `a${n}`, round_id: id, shot_type: 'approach', distance_to_hole_before: 150, distance_unit_before: 'yards', distance_to_hole_after: 20, result: 'green', lie_after: 'green', putt_made: null });
    }
  }
  // A test round that must never reach the pool, and a test player.
  rounds.push({ id: 't0-test', player_id: 't0', round_date: '2026-09-20', status: 'completed', is_test: true, holes_played: 18, total_score: 60, front_nine: 30, back_nine: 30, total_putts: 20 });
  members.push({ player_id: 'demo', team_id: 'team-1', status: 'active' });
  rounds.push({ id: 'demo-r', player_id: 'demo', round_date: '2026-09-21', status: 'completed', is_test: false, holes_played: 18, total_score: 72, front_nine: 36, back_nine: 36, total_putts: 36 });
  const players = [...ids, 'demo', 'other'].map((id) => ({ id, is_test: id === 'demo' }));
  return { golf_team_members: members, golf_players: players, golf_rounds: rounds, golf_holes: holes, golf_shots: shots };
}

beforeEach(() => {
  __resetTeamPoolMemo();
  vi.mocked(logServerEvent).mockClear();
});

describe('resolvePlayerTeam', () => {
  it("returns the player's one active team", async () => {
    expect(await resolvePlayerTeam(fakeSupabase(fixture()), 'me')).toBe('team-1');
  });

  it('returns null with no team, or more than one', async () => {
    const t = fixture();
    t.golf_team_members.push({ player_id: 'me', team_id: 'team-2', status: 'active' });
    expect(await resolvePlayerTeam(fakeSupabase(t), 'me')).toBeNull();
    expect(await resolvePlayerTeam(fakeSupabase(fixture()), 'nobody')).toBeNull();
  });

  it('logs and returns null on a read error', async () => {
    expect(await resolvePlayerTeam(fakeSupabase(fixture(), { failOn: 'golf_team_members' }), 'me')).toBeNull();
    expect(logServerEvent).toHaveBeenCalled();
  });
});

describe('loadTeamPoolPlayers', () => {
  it('reads the roster rows, drops test players and test rounds, and feeds the pure pool', async () => {
    const players = await loadTeamPoolPlayers(fakeSupabase(fixture()), 'team-1', NOW);
    expect(players).not.toBeNull();
    expect(players!.map((p) => p.player_id).sort()).toEqual(['me', 't0', 't1', 't2', 't3', 't4']);
    expect(players!.find((p) => p.player_id === 't0')!.rounds.map((r) => r.id)).not.toContain('t0-test');

    const out = computeTeamPool({ players: players!, playerId: 'me', family: 'putt_make:3_5ft', window: { start: '2026-09-01', end: '2026-10-15' } });
    // 5 teammates × 4 rounds × 30 putts = 600, 480 made.
    expect(out).toMatchObject({ kind: 'pool', pool: { value: 80, n: 600, players: 5 } });
    const three = computeTeamPool({ players: players!, playerId: 'me', family: 'three_putt', window: { start: '2026-09-01', end: '2026-10-15' } });
    expect(three).toMatchObject({ kind: 'pool', pool: { n: 360, value: 5.6 } });
  });

  it("loads completed rounds that are not countable too (the approach and sand pools use them, as the player's value does)", async () => {
    const t = fixture();
    t.golf_rounds.push({
      id: 't1-partial', player_id: 't1', round_date: '2026-09-25', status: 'completed', is_test: false,
      holes_played: 18, total_score: 40, front_nine: 40, back_nine: null, total_putts: 18,
    });
    t.golf_shots.push({ id: 'a-partial', round_id: 't1-partial', shot_type: 'approach', distance_to_hole_before: 150, distance_unit_before: 'yards', distance_to_hole_after: 20, result: 'green', lie_after: 'green', putt_made: null });
    const players = await loadTeamPoolPlayers(fakeSupabase(t), 'team-1', NOW);
    const partial = players!.find((p) => p.player_id === 't1')!.rounds.find((r) => r.id === 't1-partial');
    expect(partial?.approaches).toHaveLength(1);
    // The putt pool still counts countable rounds only: unchanged at 600.
    const out = computeTeamPool({ players: players!, playerId: 'me', family: 'putt_make:3_5ft', window: { start: '2026-09-01', end: '2026-10-15' } });
    expect(out).toMatchObject({ kind: 'pool', pool: { n: 600 } });
  });

  it('pages past the 1,000-row cap', async () => {
    // 6 players × 4 rounds × 31 shots = 744 putting + approach rows; 8 rounds each → 1,488.
    const players = await loadTeamPoolPlayers(fakeSupabase(fixture(5, 8)), 'team-1', NOW);
    const putts = players!.reduce((a, p) => a + p.rounds.reduce((b, r) => b + r.putts.length, 0), 0);
    expect(putts).toBe(6 * 8 * 30);
  });

  it('memoises one load per team within the run', async () => {
    const calls: string[] = [];
    const sb = fakeSupabase(fixture(), { calls });
    const [a, b] = await Promise.all([loadTeamPoolPlayers(sb, 'team-1', NOW), loadTeamPoolPlayers(sb, 'team-1', NOW)]);
    expect(a).toBe(b);
    const before = calls.length;
    await loadTeamPoolPlayers(sb, 'team-1', NOW + 1000);
    expect(calls.length).toBe(before);
  });

  it.each(['golf_team_members', 'golf_players', 'golf_rounds', 'golf_holes', 'golf_shots'])(
    'an error reading %s is "no pool": null, logged, not memoised',
    async (table) => {
      const sb = fakeSupabase(fixture(), { failOn: table });
      expect(await loadTeamPoolPlayers(sb, 'team-1', NOW)).toBeNull();
      expect(logServerEvent).toHaveBeenCalledWith(
        expect.stringContaining('coachhelm.teamPool'),
        expect.objectContaining({ action: 'coachhelm.v3.teamPool.load' }),
        'warning',
      );
      // A later call retries rather than serving the failure.
      expect(await loadTeamPoolPlayers(fakeSupabase(fixture()), 'team-1', NOW)).not.toBeNull();
    },
  );
});

describe('assembleTeamPlayers', () => {
  it('bands approaches with the generator helper and judges the green the same way', () => {
    const players = assembleTeamPlayers(
      ['p'],
      [{ id: 'r', player_id: 'p', round_date: '2026-09-10', is_test: false, holes_played: 18, total_score: 72, front_nine: 36, back_nine: 36, total_putts: 36 }],
      [],
      [
        { round_id: 'r', shot_type: 'approach', distance_to_hole_before: 100, distance_unit_before: 'yards', distance_to_hole_after: 30, result: 'rough', lie_after: 'rough', putt_made: null },
        { round_id: 'r', shot_type: 'approach', distance_to_hole_before: 390, distance_unit_before: 'feet', distance_to_hole_after: 10, result: null, lie_after: 'green', putt_made: null },
        { round_id: 'r', shot_type: 'approach', distance_to_hole_before: 30, distance_unit_before: 'yards', distance_to_hole_after: 3, result: 'green', lie_after: 'green', putt_made: null },
        { round_id: 'r', shot_type: 'approach', distance_to_hole_before: 160, distance_unit_before: 'yards', distance_to_hole_after: null, result: 'green', lie_after: 'green', putt_made: null },
      ],
    );
    expect(players[0]!.rounds[0]!.approaches).toEqual([
      { band: '50_125ft', green_hit: false },
      { band: '125_175ft', green_hit: true },
    ]);
  });
});
