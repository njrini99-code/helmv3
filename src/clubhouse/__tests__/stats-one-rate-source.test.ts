import { describe, expect, it, vi } from 'vitest';
import { calculateStatsFromShots, type GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

/*
 * Launch readiness 2026-11-15, DF-C-02 (P0): one player's Stats page showed two greens figures. The desktop comparisons read each
 * round's stats row; the phone tiles, Game detail and the "saves N in 100" line read the shot calculator's own count of the same
 * holes. The loader now restates the calculator's rates from the stats rows, so every layout prints one number per rate. Here the
 * calculator is made to disagree on purpose (80% greens, 9 of 10 scrambles), and no layout may print its figure.
 */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/lib/auth/session', () => ({ getGolfAuthUser: async () => ({ user: { id: 'u1' }, degraded: false }) }));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyPlayerAccess: async () => ({ allowed: true, reason: 'coach' }) }));
const calculator = vi.hoisted(() => ({ stats: null as GolfStats | null }));
vi.mock('@/app/golf/actions/stats-data', () => ({
  getDetailedStats: vi.fn(async () => calculator.stats),
  getSprayChartData: vi.fn(async () => ({ driving: { plottedShots: 0, summaryBands: [] }, approach: { plottedShots: 0, summaryBands: [] } })),
}));

import { loadPlayerProfile } from '../data/stats-player';
import { filterFor } from '../data/stats-filter';
import { glanceTiles, keyFigure } from '../screens/stats/shs-figures';
import { shotsAnswer } from '../data/__tests__/sg-shots-fake';

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const rounds = Array.from({ length: 4 }, (_, i) => ({
  id: `r${i}`, player_id: 'p1', round_date: day(i + 1), total_score: 75, score_to_par: 3, front_nine: 37, back_nine: 38, holes_played: 18, status: 'completed',
  round_type: 'tournament', course_name: 'Pines', tees_played: 'White', total_putts: 31, total_gir: 14, total_gir_possible: 18, strokes_gained_total: null,
}));
// Each round's stats row: 9 of 18 greens, 7 of 14 fairways, 3 of 6 scrambles, 2 of 4 sand saves, 32 putts.
const STATS_ROW = { greens_hit: 9, greens_total: 18, fairways_hit: 7, fairways_total: 14, scrambles_converted: 3, scramble_attempts: 6, sand_saves: 2, sand_attempts: 4, total_putts: 32, three_putts: 1, birdies: 2, eagles: 0 };

/** The calculator's own reading of the same holes, made to disagree with every stats row. */
function disagreeing(): GolfStats {
  return {
    ...calculateStatsFromShots([], [], []),
    roundsPlayed: 4, holesPlayed: 72, totalPars: 50, totalBirdies: 8, totalBogeys: 12, totalDoublePlus: 2,
    girTotal: 58, girOpportunities: 72, girPercentage: 80,
    fairwaysHit: 50, fairwayOpportunities: 56, fairwayPercentage: 89,
    scramblesMade: 9, scrambleAttempts: 10, scramblingPercentage: 90,
    sandSavesMade: 4, sandSaveAttempts: 4, sandSavePercentage: 100,
    puttsPerRound: 27, threePuttsPerRound: 0,
  };
}

async function profile() {
  calculator.stats = disagreeing();
  tables.current = {
    golf_teams: { data: { name: 'Varsity', gender: 'men' } },
    golf_team_members: (f) => (f.some(([k, a]) => k === 'select' && String(a[0]).includes('player_id')) ? { data: [{ player_id: 'p1' }] } : { data: { status: 'active' } }),
    golf_players: { data: { id: 'p1', first_name: 'Ada', last_name: 'Lin', graduation_year: 2027, handicap_index: 3.1 } },
    golf_rounds: { data: rounds },
    golf_round_stats_cache: { data: rounds.map((r) => ({ round_id: r.id, ...STATS_ROW })) },
    golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 67 }] },
    golf_shots: shotsAnswer(rounds.map((r) => r.id)),
    golf_holes: { data: [] },
    golf_player_focus_areas: { data: [] },
    golf_goals: { data: [] },
    golf_goal_suggestions: { data: [] },
  };
  const data = await loadPlayerProfile({ viewer: 'coach', teamId: 't1', playerId: 'p1', window: 'last10', filter: filterFor('last10') });
  if (!data) throw new Error('no profile');
  return data;
}

describe('Stats player: one source per rate on every layout (DF-C-02)', () => {
  it('the comparisons, Game detail’s figures, the phone tiles and the saves line all print the stats rows’ rates', async () => {
    const data = await profile();
    const s = data.stats!;
    const you = (label: string) => data.comparisons.find((c) => c.label === label)?.you;
    // Desktop comparisons (the stats rows): 36 of 72 greens, 28 of 56 fairways, 12 of 24 scrambles, 8 of 16 sand saves, 32 putts.
    expect([you('Greens in regulation'), you('Fairways hit'), you('Scrambling'), you('Sand saves'), you('Putts per round')]).toEqual([50, 50, 50, 50, 32]);
    // Game detail and the overview's saves line read data.stats: the same rates, and the counts beside them.
    expect([s.girPercentage, s.fairwayPercentage, s.scramblingPercentage, s.sandSavePercentage, s.puttsPerRound]).toEqual([50, 50, 50, 50, 32]);
    expect([s.girTotal, s.girOpportunities, s.fairwaysHit, s.fairwayOpportunities]).toEqual([36, 72, 28, 56]);
    expect([s.scramblesMade, s.scrambleAttempts, s.sandSavesMade, s.sandSaveAttempts]).toEqual([12, 24, 8, 16]);
    expect(s.threePuttsPerRound).toBe(1);
    // The phone's key figures and glance tiles.
    expect([keyFigure(data, 'approach').value, keyFigure(data, 'tee').value, keyFigure(data, 'short').value, keyFigure(data, 'putting').value]).toEqual(['50', '50', '50', '32.0']);
    expect(glanceTiles(data).slice(0, 4).map((t) => t.value)).toEqual(['50', '50', '50', '32.0']);
    // The calculator's own counts that no stats row holds stay its own.
    expect(s.totalBirdies).toBe(8);
  });
});
