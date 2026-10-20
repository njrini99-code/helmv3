import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWaves } from './read-waves';

/**
 * Team stats' reads (perf, 2026-10-01): how deep the loader goes, which rounds each shot read is asked for, and that the season's longest
 * putt is one row from the database. Figures and states are in stats-team.test.tsx.
 */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));

import { loadTeamStats } from '../data/stats-team';
import { filterFor } from '../data/stats-filter';

type Filters = Array<[string, unknown[]]>;
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const round = (i: number, player: string) => ({
  id: `${player}-r${i}`, player_id: player, round_date: day(i + 1), total_score: 74 + (i % 5), score_to_par: 2 + (i % 5), front_nine: 37, back_nine: 37 + (i % 5), holes_played: 18, status: 'completed',
  round_type: 'practice', course_name: 'Pines', tees_played: 'White', total_putts: 31, total_gir: 10, total_gir_possible: 18, strokes_gained_total: 0.5,
});
// Sixteen rounds each: ten in the window, six before it (so there is a previous window), all this season.
const rounds = ['p1', 'p2'].flatMap((p) => Array.from({ length: 16 }, (_, i) => round(i, p)));
const inIds = (f: Filters) => f.find(([k, a]) => k === 'in' && a[0] === 'round_id')?.[1][1] as string[] | undefined;
const isLongest = (f: Filters) => f.some(([k, a]) => k === 'limit' && a[0] === 1);

function base(over: import('./supabase-fake').ChFakeTables = {}): import('./supabase-fake').ChFakeTables {
  return {
    golf_teams: { data: { name: 'Varsity', gender: 'men' } },
    golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Ada', last_name: 'Lin' } }, { player: { id: 'p2', first_name: 'Bo', last_name: 'Fox' } }] },
    golf_rounds: { data: rounds },
    golf_round_stats_cache: { data: rounds.map((r) => ({ round_id: r.id, greens_hit: 10, greens_total: 18, total_putts: 31, scramble_attempts: 6, scrambles_converted: 3, birdies: 2, eagles: 0 })) },
    golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 67 }] },
    golf_shots: { data: [] },
    ...over,
  };
}

afterEach(() => {
  tables.current = {};
  tables.gate = undefined;
});

describe('Team stats reads', () => {
  it('three round trips: the team and its players; the rounds and the Tour’s averages; then the round figures and both putt reads together', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = base();
    const { result, waves: depth } = await waves.run(loadTeamStats({ teamId: 't1', window: 'last10', filter: filterFor('last10') }));
    expect(depth).toEqual([['golf_team_members', 'golf_teams'], ['golf_pga_standards', 'golf_rounds'], ['golf_round_stats_cache', 'golf_shots', 'golf_shots']]);
    expect(result.roundCount).toBe(20);
  });

  it('the bands read asks for the window’s rounds only, and the season’s longest putt for the season’s rounds', async () => {
    const asked: Array<{ ids: string[]; longest: boolean }> = [];
    tables.current = base({
      golf_shots: (f) => {
        asked.push({ ids: inIds(f) ?? [], longest: isLongest(f) });
        return { data: [] };
      },
    });
    const stats = await loadTeamStats({ teamId: 't1', window: 'last10', filter: filterFor('last10') });
    expect(stats.roundCount).toBe(20);
    const bands = asked.find((a) => !a.longest)!;
    const longest = asked.find((a) => a.longest)!;
    // The window is each player's newest ten; the previous six and the rest of the season are not asked for putts.
    expect(bands.ids).toHaveLength(20);
    expect(bands.ids.every((id) => Number(id.split('-r')[1]) < 10)).toBe(true);
    // The longest putt is the season's: every round with its holes this season.
    expect(longest.ids).toHaveLength(32);
  });

  it('the season’s longest putt made comes from the one row the database answers with (the longest, made, 0 to 120 feet)', async () => {
    const calls: Filters[] = [];
    tables.current = base({
      golf_shots: (f) => {
        calls.push(f);
        return isLongest(f) ? { data: [{ round_id: 'p2-r3', putt_distance_feet: 61.4, putt_made: true }] } : { data: [{ round_id: 'p1-r0', putt_distance_feet: 8, putt_made: true }] };
      },
    });
    const stats = await loadTeamStats({ teamId: 't1', window: 'last10', filter: filterFor('last10') });
    expect(stats.bests.find((b) => b.label === 'Longest putt made')).toMatchObject({ playerId: 'p2', name: 'Bo Fox', value: '61 ft' });
    const query = calls.find(isLongest)!;
    expect(query).toEqual(
      expect.arrayContaining([
        ['eq', ['putt_made', true]],
        ['gte', ['putt_distance_feet', 0]],
        ['lte', ['putt_distance_feet', 120]],
        ['order', ['putt_distance_feet', { ascending: false }]],
        ['limit', [1]],
      ]),
    );
    // The bands are the window's putts only: the 8-footer is on a window round, and the 61-footer is not counted in them.
    expect(stats.putting?.putts).toBe(1);
  });

  it('a season of more than 200 rounds is asked for in chunks of 200 (the URL stays short), and the longest is the longest across the chunks', async () => {
    const asked: number[] = [];
    // One chunk answers 40 ft, another 75 ft, another 61 ft: the 75 is the season's.
    const feetByChunk = [40, 75, 61];
    const chain = (ids: string[]) => {
      const n = asked.push(ids.length);
      const feet = feetByChunk[n - 1] ?? 0;
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'in', 'eq', 'gte', 'lte', 'order', 'limit']) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ round_id: `r-${n}`, putt_distance_feet: feet, putt_made: true }], error: null }).then(ok);
      return q;
    };
    const supabase = { from: () => ({ select: () => ({ in: (_c: string, ids: string[]) => chain(ids) }) }) };
    const { loadLongestPutt } = await import('../data/stats-common');
    const res = await loadLongestPutt(supabase as never, Array.from({ length: 450 }, (_, i) => `round-${i}`));
    expect(asked.sort((a, b) => b - a)).toEqual([200, 200, 50]);
    expect(res).toEqual({ longest: { roundId: 'r-2', feet: 75, made: true }, error: false });
  });

  it('a tie in the longest putt goes to the lowest round id, whichever chunk answers first (the rule is stated on loadLongestPutt)', async () => {
    const { loadLongestPutt } = await import('../data/stats-common');
    const rounds = Array.from({ length: 450 }, (_, i) => `round-${i}`);
    // Three chunks (450 rounds) each answer 75 ft, from rounds r-3, r-1 and r-2.
    const run = async (answers: Array<{ id: string; feet: number }>) => {
      let n = 0;
      const chain = () => {
        const a = answers[n++]!;
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'in', 'eq', 'gte', 'lte', 'order', 'limit']) q[m] = () => q;
        q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ round_id: a.id, putt_distance_feet: a.feet, putt_made: true }], error: null }).then(ok);
        return q;
      };
      const supabase = { from: () => ({ select: () => ({ in: chain }) }) };
      return (await loadLongestPutt(supabase as never, rounds)).longest;
    };
    const tied = [
      { id: 'r-3', feet: 75 },
      { id: 'r-1', feet: 75 },
      { id: 'r-2', feet: 75 },
    ];
    expect(await run(tied)).toEqual({ roundId: 'r-1', feet: 75, made: true });
    expect(await run([...tied].reverse())).toEqual({ roundId: 'r-1', feet: 75, made: true });
    // A longer putt beats the lower id.
    expect(await run([...tied.slice(0, 2), { id: 'r-9', feet: 80 }])).toEqual({ roundId: 'r-9', feet: 80, made: true });
  });

  it('a longest-putt read that fails leaves the best out and is logged; the putting card and the rest of the page are unaffected', async () => {
    tables.current = base({ golf_shots: (f) => (isLongest(f) ? { error: { message: 'boom' } } : { data: [{ round_id: 'p1-r0', putt_distance_feet: 8, putt_made: true }] }) });
    const stats = await loadTeamStats({ teamId: 't1', window: 'last10', filter: filterFor('last10') });
    expect(stats.bests.some((b) => b.label === 'Longest putt made')).toBe(false);
    expect(stats.bests.some((b) => b.label === 'Low round')).toBe(true);
    expect(stats.puttsError).toBe(false);
    expect(stats.putting?.putts).toBe(1);
  });

  it('a putt read that fails flags the putting card, as before', async () => {
    tables.current = base({ golf_shots: (f) => (isLongest(f) ? { data: [] } : { error: { message: 'boom' } }) });
    const stats = await loadTeamStats({ teamId: 't1', window: 'last10', filter: filterFor('last10') });
    expect(stats.puttsError).toBe(true);
    expect(stats.putting).toBeNull();
  });
});
