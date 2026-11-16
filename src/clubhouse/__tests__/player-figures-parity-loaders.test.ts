import { describe, expect, it, vi } from 'vitest';
import { calculateStatsFromShots, type GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

/*
 * Launch readiness 2026-11-15, section 3 ("one figures helper"): one player's 14 rounds, read through every loader that prints their
 * Last 10 figures. Stats player on desktop (the comparisons and the hero) and on the phone (key figures and glance tiles, Game detail's
 * `stats`), My stats (the player's own Stats), the player's Home, Ask and the Roster's season average (the Stats hero on This season).
 *
 * The fixture holds one of each round the audit names: practice, test, a nine, a total-only round, a 14-hole partial, one with 0 putts
 * recorded, and one written before the 17 Oct GIR rule whose round header still says 9 greens where its stats row says 12. The excluded
 * rounds are the NEWEST, with figures far from the rest, so a reader that let one in would move its window and its numbers.
 *
 * Every surface must print: scoring 74.5 over 10 rounds; greens 84 of 162 (51.9%) and fairways 63 of 126 (50%) pooled over the 9 rounds
 * with holes, from the stats rows; 32 putts a round over the 8 that recorded putts; strokes gained −1.0.
 */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/lib/auth/session', () => ({ getGolfAuthUser: async () => ({ user: { id: 'u1' }, degraded: false }) }));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyPlayerAccess: async () => ({ allowed: true, reason: 'coach' }) }));
const calculator = vi.hoisted(() => ({ stats: null as GolfStats | null }));
vi.mock('@/app/golf/actions/stats-data', () => ({
  getDetailedStats: vi.fn(async () => calculator.stats),
  getSprayChartData: vi.fn(async () => ({ driving: { plottedShots: 0, summaryBands: [] }, approach: { plottedShots: 0, summaryBands: [] } })),
}));
vi.mock('@/app/golf/actions/teams', () => ({ getTeamJoinRequests: vi.fn(async () => ({ success: true, data: [] })) }));

import { createClient } from '@/lib/supabase/server';
import { loadPlayerProfile } from '../data/stats-player';
import { loadPlayerHome } from '../data/player-home';
import { loadPlayersFigures } from '../data/player-figures';
import { loadRoster } from '../data/roster';
import { filterFor } from '../data/stats-filter';
import { glanceTiles, keyFigure } from '../screens/stats/shs-figures';
import { shotsAnswer } from '../data/__tests__/sg-shots-fake';

type Row = Record<string, unknown>;
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const SG = { strokes_gained_total: -1, strokes_gained_tee: -0.25, strokes_gained_approach: -0.25, strokes_gained_around_green: -0.25, strokes_gained_putting: -0.25 };
const BIG_SG = { strokes_gained_total: 5, strokes_gained_tee: 1.25, strokes_gained_approach: 1.25, strokes_gained_around_green: 1.25, strokes_gained_putting: 1.25 };
const round = (id: string, d: number, score: number, over: Row = {}): Row => ({
  id, player_id: 'p1', round_date: day(d), status: 'completed', is_test: false, round_type: 'tournament', course_name: 'Pines', tees_played: 'White',
  holes_played: 18, total_score: score, score_to_par: score - 72, front_nine: score - 38, back_nine: 38, total_putts: 32,
  total_gir: 9, total_gir_possible: 18, total_fairways_hit: 7, total_fairways: 14, ...SG, ...over,
});
const ROUNDS: Row[] = [
  // Left out everywhere, and newest: practice, test, a nine, a 14-hole partial (the back nine never finished).
  round('practice', 1, 68, { round_type: 'practice', ...BIG_SG }),
  round('test', 2, 60, { is_test: true, ...BIG_SG }),
  round('nine', 3, 36, { holes_played: 9, score_to_par: 0, front_nine: 36, back_nine: null, total_putts: 14, total_gir: 9, total_gir_possible: 9, ...BIG_SG }),
  round('partial', 4, 58, { front_nine: 37, back_nine: null, total_putts: 24, ...BIG_SG }),
  // In the score figures only: an 18 posted as a total.
  round('total', 5, 71, { front_nine: null, back_nine: null, total_putts: null, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null, strokes_gained_total: null, strokes_gained_tee: null, strokes_gained_approach: null, strokes_gained_around_green: null, strokes_gained_putting: null }),
  // In every figure: a round written before 17 Oct (its header says 9 greens, its stats row 12), one with no putts recorded, seven more.
  round('stale', 6, 74),
  round('zero-putts', 7, 75, { total_putts: 0 }),
  ...[74, 75, 76, 77, 73, 72, 78].map((s, i) => round(`n${i + 1}`, 8 + i, s)),
];
const statsRow = (round_id: string, over: Row = {}): Row => ({
  round_id, greens_hit: 9, greens_total: 18, fairways_hit: 7, fairways_total: 14, total_putts: 32, scramble_attempts: 6, scrambles_converted: 3,
  sand_attempts: 4, sand_saves: 2, three_putts: 1, one_putts: 4, penalty_strokes: 0, birdies: 2, eagles: 0, pars: 10, bogeys: 5, double_bogeys: 1, triple_plus: 0, ...over,
});
const CACHE: Row[] = [
  // The left-out rounds' rows are perfect: any of them read would move every rate.
  statsRow('practice', { greens_hit: 18, fairways_hit: 14, total_putts: 24 }),
  statsRow('test', { greens_hit: 18, fairways_hit: 14, total_putts: 20 }),
  statsRow('nine', { greens_hit: 9, greens_total: 9, fairways_hit: 7, fairways_total: 7, total_putts: 12 }),
  statsRow('partial', { greens_hit: 14, greens_total: 14, fairways_hit: 11, fairways_total: 11, total_putts: 20 }),
  statsRow('total', { greens_hit: 0, fairways_hit: 0, total_putts: 0 }),
  statsRow('stale', { greens_hit: 12 }),
  statsRow('zero-putts', { total_putts: 0 }),
  ...[1, 2, 3, 4, 5, 6, 7].map((i) => statsRow(`n${i}`)),
];

const SCORING = (71 + 74 + 75 + 74 + 75 + 76 + 77 + 73 + 72 + 78) / 10;
const GIR = (84 / 162) * 100;
const FAIRWAYS = 50;
const PUTTS = 32;

/** The database's own filters, applied as Postgres would: test rounds out where asked, the player and the date bound. */
function roundsAnswer(f: Array<[string, unknown[]]>) {
  const noTest = f.some(([k, a]) => k === 'eq' && a[0] === 'is_test' && a[1] === false);
  const completed = f.some(([k, a]) => k === 'eq' && a[0] === 'status' && a[1] === 'completed');
  const gte = f.find(([k, a]) => k === 'gte' && a[0] === 'round_date')?.[1][1] as string | undefined;
  const ids = f.find(([k, a]) => k === 'in' && a[0] === 'player_id')?.[1][1] as string[] | undefined;
  const one = f.find(([k, a]) => k === 'eq' && a[0] === 'player_id')?.[1][1] as string | undefined;
  return {
    data: ROUNDS.filter(
      (r) => (!noTest || r.is_test === false) && (!completed || r.status === 'completed') && (!gte || (r.round_date as string) >= gte) && (!ids || ids.includes(r.player_id as string)) && (!one || r.player_id === one),
    ),
  };
}

function setTables() {
  // The shot calculator's own reading of the holes, made to disagree: no layout may print it (DF-C-02).
  calculator.stats = { ...calculateStatsFromShots([], [], []), roundsPlayed: 9, holesPlayed: 162, totalPars: 90, totalBirdies: 18, totalBogeys: 45, totalDoublePlus: 9, girPercentage: 90, fairwayPercentage: 90, puttsPerRound: 25 };
  tables.current = {
    golf_teams: { data: { name: 'Varsity', gender: 'men', join_code: 'X', created_by: 'c1', organization_id: 'o1' } },
    golf_team_settings: { data: { timezone: 'America/New_York' } },
    golf_team_members: (f) =>
      f.some(([k, a]) => k === 'select' && String(a[0]).includes('player:'))
        ? { data: [{ status: 'active', jersey_number: null, joined_at: null, availability: null, availability_updated_at: null, player: { id: 'p1', first_name: 'Ada', last_name: 'Lin', graduation_year: 2027, hometown: null, state: null, high_school_name: null, handicap: 2, handicap_index: 3.1 } }] }
        : f.some(([k, a]) => k === 'select' && String(a[0]).includes('player_id'))
          ? { data: [{ player_id: 'p1' }] }
          : { data: { status: 'active' } },
    golf_players: { data: { id: 'p1', first_name: 'Ada', last_name: 'Lin', graduation_year: 2027, handicap_index: 3.1, handicap: null } },
    golf_rounds: roundsAnswer,
    golf_round_stats_cache: (f) => {
      const ids = f.find(([k, a]) => k === 'in' && a[0] === 'round_id')?.[1][1] as string[] | undefined;
      return { data: CACHE.filter((r) => !ids || ids.includes(r.round_id as string)) };
    },
    golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 67 }] },
    golf_shots: shotsAnswer(ROUNDS.map((r) => r.id as string)),
    golf_holes: { data: [] },
    golf_events: { data: [] },
    golf_event_attendance: { data: [] },
    golf_conversations: { data: [] },
    golf_coaches: { data: [{ id: 'c1', user_id: 'u1' }] },
    golf_player_focus_areas: { data: [] },
    golf_goals: { data: [] },
    golf_goal_suggestions: { data: [] },
    golf_coach_player_intent: { data: [] },
  };
}

describe('one player’s Last 10, the 14-round fixture, on every surface (launch readiness section 3)', () => {
  it('Stats player, desktop and phone: the hero, the comparisons, Game detail’s figures, the key figures and glance tiles', async () => {
    setTables();
    const data = (await loadPlayerProfile({ viewer: 'coach', teamId: 't1', playerId: 'p1', window: 'last10', filter: filterFor('last10') }))!;
    expect(data.win.rounds).toBe(10);
    expect(data.win.avg).toBeCloseTo(SCORING, 9);
    expect(data.win.sgPerRound).toBeCloseTo(-1, 9);
    const you = (label: string) => data.comparisons.find((c) => c.label === label)?.you;
    expect(you('Greens in regulation')).toBeCloseTo(GIR, 0);
    expect(you('Fairways hit')).toBeCloseTo(FAIRWAYS, 0);
    expect(you('Putts per round')).toBeCloseTo(PUTTS, 9);
    const s = data.stats!;
    expect([s.girTotal, s.girOpportunities, s.fairwaysHit, s.fairwayOpportunities]).toEqual([84, 162, 63, 126]);
    expect(s.puttsPerRound).toBeCloseTo(PUTTS, 9);
    expect([keyFigure(data, 'approach').value, keyFigure(data, 'tee').value, keyFigure(data, 'putting').value]).toEqual([String(Math.round(GIR)), '50', '32.0']);
    expect(glanceTiles(data)[0]!.value).toBe(String(Math.round(GIR)));
  });

  it('My stats (the player’s own Stats) prints the same figures', async () => {
    setTables();
    const data = (await loadPlayerProfile({ viewer: 'player', teamId: 't1', playerId: 'p1', window: 'last10', filter: filterFor('last10') }))!;
    expect(data.win.rounds).toBe(10);
    expect(data.win.avg).toBeCloseTo(SCORING, 9);
    expect(data.win.sgPerRound).toBeCloseTo(-1, 9);
    expect(data.stats!.girPercentage).toBeCloseTo(GIR, 0);
    expect(data.stats!.fairwayPercentage).toBeCloseTo(FAIRWAYS, 0);
    expect(data.stats!.puttsPerRound).toBeCloseTo(PUTTS, 9);
  });

  it('the player’s Home: the scoring line, strokes gained and the legs', async () => {
    setTables();
    const home = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Ada' });
    expect(home.scoringLast10?.n).toBe(10);
    expect(home.scoringLast10?.avg).toBeCloseTo(SCORING, 9);
    expect(home.sgPerRound).toBeCloseTo(-1, 9);
    const leg = (key: string) => home.legs?.rows.find((r) => r.key === key)?.value;
    expect(leg('tee')).toBeCloseTo(FAIRWAYS, 0);
    expect(leg('approach')).toBeCloseTo(GIR, 0);
    expect(leg('putting')).toBeCloseTo(PUTTS, 9);
  });

  it('Ask: the player’s Last 10 figures', async () => {
    setTables();
    const f = (await loadPlayersFigures(await createClient(), { timezone: 'America/New_York' }, ['p1'], 'last10'))!.get('p1')!;
    expect(f.rounds).toBe(10);
    expect(f.hole_rounds).toBe(9);
    expect(f.scoring_average).toBeCloseTo(SCORING, 9);
    expect(f.sg_total).toBeCloseTo(-1, 9);
    expect([f.gir_pct, f.gir_holes]).toEqual([expect.closeTo(GIR, 9), 162]);
    expect([f.fairway_pct, f.fairway_holes]).toEqual([expect.closeTo(FAIRWAYS, 9), 126]);
    expect([f.putts_per_round, f.putt_rounds]).toEqual([PUTTS, 8]);
    // The same rounds as Stats' window, so a list of "the last 10" and the figure beside it are one set, and the window's ends.
    const stats = (await loadPlayerProfile({ viewer: 'player', teamId: 't1', playerId: 'p1', window: 'last10', filter: filterFor('last10') }))!;
    expect(f.round_ids).toEqual(stats.rounds.map((r) => r.id));
    expect([f.window_start, f.window_end]).toEqual([day(14), day(5)]);
  });

  it('the Roster’s average is the season’s, the figure Stats prints on This season (DF-C-19)', async () => {
    setTables();
    const roster = await loadRoster({ teamId: 't1', coachId: 'c1' });
    const ada = roster.players.find((p) => p.id === 'p1')!;
    const data = (await loadPlayerProfile({ viewer: 'coach', teamId: 't1', playerId: 'p1', window: 'season', filter: filterFor('season') }))!;
    // Every counted round here is this season's, so This season holds the same ten as Last 10.
    expect(ada.avg).toBeCloseTo(data.win.avg!, 9);
    expect(ada.avg).toBeCloseTo(SCORING, 9);
    // Nine 18-hole rounds with holes and the total-only one behind the average; the count shown adds the nine (DF-C-05).
    expect(ada.rounds).toBe(10);
    expect(ada.roundsAll).toBe(11);
  });
});
