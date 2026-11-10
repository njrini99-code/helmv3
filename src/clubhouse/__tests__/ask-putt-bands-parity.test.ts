import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));

import { getPuttingDistanceProfile } from '@/lib/coachhelm/v3/chat/read-tools';
import { buildPlayerTools } from '@/lib/coachhelm/v3/chat/player-tools';
import { PUTT_DISTANCE_BUCKETS } from '@/lib/coachhelm/v3/chat/metrics-catalog';
import { loadPlayerPuttBands, playerPuttBandsOver, puttScopeRounds } from '../data/player-figures';
import { countsForScoring, type ChRound } from '../data/season';
import { bandPutts, PUTT_BANDS, roundsInFilter, type ChPuttRow } from '../data/stats-common';
import { holeRounds } from '../data/round-scope';
import { filterFor } from '../data/stats-filter';
import { puttBandViews } from '../screens/stats/putt-bands';

// Ask's putting-by-distance read must be the figures the Stats page draws (QA-1 again): the player's rounds in the window, practice out,
// only rounds with holes, each putt counted into the same six bands. It read the stats cache before (a May-to-September window, nine-hole
// rounds counted as full ones).

const START = '2026-08-01';
let seq = 0;
const round = (date: string, over: Partial<ChRound> = {}): ChRound =>
  ({
    id: `r${String(++seq).padStart(3, '0')}`, player_id: 'cole', course_name: 'Pines', tees_played: null, round_date: date, round_type: 'tournament',
    total_score: 74, score_to_par: 2, front_nine: 37, back_nine: 37, holes_played: 18, total_putts: 31, total_gir: 9, total_gir_possible: 18,
    total_fairways_hit: 8, total_fairways: 14, strokes_gained_tee: 0, strokes_gained_approach: 0, strokes_gained_around_green: 0, strokes_gained_putting: 0,
    strokes_gained_total: 0, status: 'completed', is_test: false, ...over,
  }) as ChRound;

// Newest first. Twelve counted rounds, a practice round, a nine-hole round and a total-only round, and three from July.
const rounds: ChRound[] = [
  round('2026-10-21'), round('2026-10-20'), round('2026-10-19'), round('2026-10-18', { round_type: 'practice' }), round('2026-10-17'), round('2026-10-16'),
  round('2026-10-15', { holes_played: 9, front_nine: 38, back_nine: null }), round('2026-10-14', { total_only: true, front_nine: null, back_nine: null } as Partial<ChRound>),
  round('2026-10-13'), round('2026-10-12'), round('2026-10-11'), round('2026-10-10'), round('2026-10-09'), round('2026-10-08'), round('2026-10-07'),
  round('2026-07-20'), round('2026-07-10'), round('2026-07-01'),
];

const feetPattern: Array<[feet: number, made: boolean]> = [[1.5, true], [2.5, true], [4, true], [4.5, false], [7, true], [8, false], [9, false], [12, false], [20, false], [30, false], [40, true]];
const puttsFor = (ids: string[]): ChPuttRow[] => ids.flatMap((roundId) => feetPattern.map(([feet, made]) => ({ roundId, feet, made })));

describe('Ask’s putting bands are the Stats page’s', () => {
  const f = filterFor('last10');
  const scope = puttScopeRounds(rounds, f, START);

  it('counts the rounds Stats counts: the newest ten, of those only the ones with holes scored (the total-only round is one of the ten and has no putts), practice and July out', () => {
    expect(scope).toHaveLength(9);
    expect(scope.every((r) => r.round_type !== 'practice' && r.holes_played === 18 && !(r as { total_only?: boolean }).total_only)).toBe(true);
    // The same cut written out the way stats-player.ts writes it.
    const stats = holeRounds(roundsInFilter(rounds.filter(countsForScoring), f, START));
    expect(scope.map((r) => r.id)).toEqual(stats.slice(0, 100).map((r) => r.id));
    expect(scope.map((r) => r.round_date)).not.toContain('2026-07-20');
  });

  it('the season window is its own: July is out of it, and so are the older rounds the newest-ten read loads', () => {
    const season = puttScopeRounds(rounds, filterFor('season'), START);
    expect(season.map((r) => r.round_date).every((d) => d >= START)).toBe(true);
    expect(season.length).toBeGreaterThan(scope.length - 1);
  });

  const putts = puttsFor(scope.map((r) => r.id));
  const read = playerPuttBandsOver(scope, putts);

  it('puts every putt in the band Stats puts it in, with the same labels and counts', () => {
    const stats = bandPutts(putts, new Map());
    expect(read.bands).toEqual(stats.map((b) => ({ label: b.label, attempts: b.attempts, made: b.made })));
    expect(read.bands.map((b) => b.label)).toEqual(PUTT_BANDS.map((b) => b.label));
    expect(read.bands.reduce((n, b) => n + b.attempts, 0)).toBe(putts.length);
    expect(read.rounds).toBe(9);
    expect(read.window_end).toBe('2026-10-21');
  });

  it('the tool’s bucket names are the page’s bands, in the same order', () => {
    expect(PUTT_DISTANCE_BUCKETS.map((b) => b.bucket)).toEqual(PUTT_BANDS.map((b) => b.label.replace(/–/g, '-')));
  });

  it('the rate the tool states is the rate the Stats chart draws, to the decimal the page prints', async () => {
    const views = puttBandViews(read.bands.map((b) => ({ ...b, bench: null })));
    const e = await getPuttingDistanceProfile({ from: vi.fn() } as never, { coach_id: 'c', user_id: 'u', team_id: 't', team_name: 'T', timezone: 'America/New_York', roster: [{ id: 'cole', name: 'Cole', first_name: 'Cole', last_name: null, graduation_year: null }] }, { player_id: 'cole', window: 'last10' }, async () => read);
    expect(e.measurements).toHaveLength(6);
    e.measurements.forEach((m, i) => {
      expect(m.sample_size).toBe(views[i]!.attempts);
      expect(m.value).toBe(Math.round(views[i]!.rate! * 10) / 10);
      expect(m.value).toBeCloseTo(((views[i]!.made as number) / views[i]!.attempts) * 100, 0);
    });
  });
});

describe('loadPlayerPuttBands', () => {
  // A table-by-table fake of the two reads: rounds (any filter, already matching) and the shots of the rounds asked for.
  function fake(roundRows: ChRound[], shotRows: Array<{ round_id: string; putt_distance_feet: number; putt_made: boolean }>, fail?: 'rounds' | 'shots') {
    const asked: Array<{ table: string; ids?: string[] }> = [];
    const from = (table: string) => {
      let ids: string[] | undefined;
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'gte', 'order']) q[m] = () => q;
      q.in = (_c: string, v: string[]) => ((ids = v), q);
      q.range = () => {
        asked.push({ table, ids });
        if (fail === 'rounds' && table === 'golf_rounds') return Promise.resolve({ data: null, error: { message: 'down' } });
        if (fail === 'shots' && table === 'golf_shots') return Promise.resolve({ data: null, error: { message: 'down' } });
        return Promise.resolve({ data: table === 'golf_rounds' ? roundRows : shotRows.filter((s) => ids?.includes(s.round_id)), error: null });
      };
      return q;
    };
    return { sb: { from } as never, asked };
  }
  const shots = (ids: string[]) => ids.flatMap((round_id) => feetPattern.map(([putt_distance_feet, putt_made]) => ({ round_id, putt_distance_feet, putt_made })));

  it('reads the putts of exactly the rounds in the window', async () => {
    const { sb, asked } = fake(rounds, shots(rounds.map((r) => r.id)));
    const out = await loadPlayerPuttBands(sb, { timezone: 'America/New_York' }, 'cole', 'last10');
    const scope = puttScopeRounds(rounds, filterFor('last10'), START);
    expect(out!.rounds).toBe(9);
    expect(asked.find((a) => a.table === 'golf_shots')!.ids).toEqual(scope.map((r) => r.id));
    expect(out!.bands.reduce((n, b) => n + b.attempts, 0)).toBe(9 * feetPattern.length);
  });

  it('is null, not an empty profile, when either read fails', async () => {
    expect(await loadPlayerPuttBands(fake(rounds, [], 'rounds').sb, { timezone: 'America/New_York' }, 'cole', 'last10')).toBeNull();
    expect(await loadPlayerPuttBands(fake(rounds, [], 'shots').sb, { timezone: 'America/New_York' }, 'cole', 'last10')).toBeNull();
  });

  it('reads no shots at all for a player with no rounds in the window', async () => {
    const { sb, asked } = fake([], []);
    const out = await loadPlayerPuttBands(sb, { timezone: 'America/New_York' }, 'cole', 'last5');
    expect(out!.rounds).toBe(0);
    expect(asked.some((a) => a.table === 'golf_shots')).toBe(false);
  });
});

describe('the player’s own putting-by-distance tool', () => {
  const f = filterFor('last10');
  const scope = puttScopeRounds(rounds, f, START);
  const putts = puttsFor(scope.map((r) => r.id));
  const ctx = { coach_id: '', user_id: 'u', team_id: 't', team_name: 'T', timezone: 'America/New_York', roster: [{ id: 'cole', name: 'Cole', first_name: 'Cole', last_name: null, graduation_year: null }] };

  function toolsWith(puttBands: (id: string, window: string) => Promise<unknown>) {
    const collected: Array<{ measurements: Array<{ value: number | null; sample_size: number | null }> }> = [];
    const tools = buildPlayerTools({
      sb: { from: vi.fn() } as never, ctx: ctx as never, playerId: 'cole', writer: { write: vi.fn() } as never,
      collect: (e: never) => collected.push(e), puttBands: puttBands as never,
    } as never);
    return { tools, collected };
  }

  it('is offered, takes the same window input and no player_id to forge', () => {
    const { tools } = toolsWith(async () => null);
    expect(Object.keys(tools)).toContain('get_putting_distance_profile');
    const schema = (tools.get_putting_distance_profile as unknown as { inputSchema: { safeParse: (v: unknown) => { success: boolean; data?: Record<string, unknown> } } }).inputSchema;
    expect(schema.safeParse({}).data).toEqual({ window: 'last10' });
    const forged = schema.safeParse({ window: 'season', player_id: 'someone-else' });
    expect(forged.data).toEqual({ window: 'season' });
    expect(schema.safeParse({ window: 'nonsense' }).success).toBe(false);
  });

  it('reads the session player only, in the window asked, and states the rates the Stats chart draws', async () => {
    const asked: Array<[string, string]> = [];
    const { tools, collected } = toolsWith(async (id, window) => (asked.push([id, window]), playerPuttBandsOver(puttScopeRounds(rounds, filterFor(window as 'last10'), START), puttsFor(puttScopeRounds(rounds, filterFor(window as 'last10'), START).map((r) => r.id)))));
    const out = (await tools.get_putting_distance_profile!.execute!({ window: 'last10', player_id: 'someone-else' } as never, {} as never)) as { measurements: Array<{ value: number; sample_size: number }> };
    expect(asked).toEqual([['cole', 'last10']]);
    const views = puttBandViews(playerPuttBandsOver(scope, putts).bands.map((b) => ({ ...b, bench: null })));
    expect(out.measurements).toHaveLength(6);
    out.measurements.forEach((m, i) => {
      expect(m.sample_size).toBe(views[i]!.attempts);
      expect(m.value).toBe(Math.round(views[i]!.rate! * 10) / 10);
    });
    expect(collected).toHaveLength(1);
  });

  it('a different window reads a different cut of the same player', async () => {
    const asked: string[] = [];
    const { tools } = toolsWith(async (id, window) => (asked.push(`${id}:${window}`), null));
    await tools.get_putting_distance_profile!.execute!({ window: 'last5' } as never, {} as never);
    await tools.get_putting_distance_profile!.execute!({ window: 'season' } as never, {} as never);
    expect(asked).toEqual(['cole:last5', 'cole:season']);
  });
});
