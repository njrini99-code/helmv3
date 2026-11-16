import { describe, expect, it, vi } from 'vitest';

/*
 * Stats and charts audit 2026-11-15, SC-01 (Part 4): CoachHelm's Standing baseline and the Deep dive's strokes gained by category read
 * the lifetime stats cache, which production still builds with the old update_player_stats_complete (test and total-only rounds in the
 * putts denominator, a test round's 37 as the best round). They now read this season's figures, as Stats counts them. The golden rounds
 * G1 to G4 (stats-golden.fixtures.ts) are the check: putts 31.33 a round, G4 never counted, and the same numbers Ask and Stats print.
 */

vi.mock('server-only', () => ({}));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined), logServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    throw new Error('season-figures: no Supabase client in this test');
  },
}));

import { evalClient, type Row } from '../../__tests__/supabase-eval-fake';
import { G1_EXPECTED, G1_ID, G2_EXPECTED, G2_ID, G4_ID, GOLDEN_PLAYER_ID, GOLDEN_SEASON_START, WINDOW_EXPECTED, goldenRoundRows } from '../../__tests__/stats-golden.fixtures';
import { loadPlayerSeasonFigures, loadPlayerSeasonSg, loadPlayerTeamZone } from '../season-figures';
import { seasonSgByCategory, sgByCategoryOf } from '../season-figures-shape';
import { playerFiguresOver } from '../player-figures';
import { loadRoundCache } from '../stats-common';
import { filterFor, withHoles } from '../stats-filter';
import { loadSeasonRounds } from '../season';

const NOW = new Date('2026-11-15T12:00:00Z');
const ZONE = 'America/New_York';

/** Each hole round's stats row, as update_round_stats_cache writes it, from the audit's own counts (never retyped here). */
function goldenStatsRows(): Row[] {
  const row = (id: string, e: { putts: number; gir: { made: number; of: number }; fairways: { made: number; of: number }; scrambling: { made: number; of: number } }) => ({
    round_id: id,
    total_putts: e.putts,
    greens_hit: e.gir.made,
    greens_total: e.gir.of,
    fairways_hit: e.fairways.made,
    fairways_total: e.fairways.of,
    scrambles_converted: e.scrambling.made,
    scramble_attempts: e.scrambling.of,
  });
  // G4, the test round, has a stats row of its own: a reader that counted it would show it.
  return [row(G1_ID, G1_EXPECTED), row(G2_ID, G2_EXPECTED), { round_id: G4_ID, total_putts: 10, greens_hit: 18, greens_total: 18, fairways_hit: 14, fairways_total: 14 }];
}

const db = () => ({ current: { tables: { golf_rounds: goldenRoundRows() as Row[], golf_round_stats_cache: goldenStatsRows() } } });
const read = (holder = db()) => loadPlayerSeasonFigures(evalClient(holder) as never, GOLDEN_PLAYER_ID, { zone: ZONE, surface: 'test.season', now: NOW });

describe('a CoachHelm reader takes this season’s figures, never the lifetime cache (SC-01)', () => {
  it('putts 31.33 a round and greens 14 of 27 over G1 to G3, G4 never counted', async () => {
    const got = await read();
    if (got.status !== 'ok') throw new Error('season figures failed');
    expect(got.set.putts.value).toBeCloseTo(WINDOW_EXPECTED.puttsPer18, 2);
    for (const wrong of WINDOW_EXPECTED.puttsPer18Wrong) expect(got.set.putts.value).not.toBeCloseTo(wrong, 1);
    expect([got.set.gir.made, got.set.gir.chances]).toEqual([WINDOW_EXPECTED.girPooled.made, WINDOW_EXPECTED.girPooled.of]);
    expect(got.set.scoring).toBeCloseTo(WINDOW_EXPECTED.scoringAverageAnyLength, 2);
    expect(got.set.n).toBe(3);
    expect(got.set.roundIds).toEqual(WINDOW_EXPECTED.countedRoundIds);
    expect(got.set.roundIds).not.toContain(G4_ID);
    // G4's +34.51 is the only strokes gained on file, and it is never read.
    expect(got.set.sg.total).toBeNull();
    expect(sgByCategoryOf(got.set)).toEqual({ tee: null, approach: null, short_game: null, putting: null });
  });

  it('names its window: this season, with the days it covers and the rounds with their holes', async () => {
    const got = await read();
    if (got.status !== 'ok') throw new Error('season figures failed');
    expect(got.label).toBe('This season · Oct 1 to Oct 10 · hole stats from 2');
    expect(got.set.from! >= GOLDEN_SEASON_START).toBe(true);
  });

  it('equals Ask’s figures and Stats’ window for the same rounds (every length, a nine at half)', async () => {
    const holder = db();
    const got = await read(holder);
    if (got.status !== 'ok') throw new Error('season figures failed');
    const sb = evalClient(holder) as never;
    const { rounds } = await loadSeasonRounds(sb, [GOLDEN_PLAYER_ID], { surface: 'test.ask', since: GOLDEN_SEASON_START });
    const cache = await loadRoundCache(sb, [G1_ID, G2_ID], 'test.ask');
    const ask = playerFiguresOver(rounds, withHoles(filterFor('season'), 'all'), GOLDEN_SEASON_START, cache.byRound);
    expect(got.set.n).toBe(ask.rounds);
    expect(got.set.holeN).toBe(ask.hole_rounds);
    expect(got.set.scoring).toBeCloseTo(ask.scoring_average!, 10);
    expect(got.set.putts.value).toBeCloseTo(ask.putts_per_round!, 10);
    expect(got.set.gir.pct).toBeCloseTo(ask.gir_pct!, 10);
    expect(got.set.fairways.pct).toBeCloseTo(ask.fairway_pct!, 10);
    expect(got.set.roundIds).toEqual(ask.round_ids);
  });

  it('fails as a whole when the stats rows do not read, rather than print figures without their rates', async () => {
    const holder = db();
    const sb = evalClient(holder);
    const broken = { from: (t: string) => (t === 'golf_round_stats_cache' ? { select: () => ({ in: async () => ({ data: null, error: { message: 'boom' } }) }) } : sb.from(t)) };
    const got = await loadPlayerSeasonFigures(broken as never, GOLDEN_PLAYER_ID, { zone: ZONE, surface: 'test.season', now: NOW });
    expect(got.status).toBe('failed');
  });

  it('the themes’ strokes gained by category: G4’s +34.51 never read, and three whole rounds with it before a part reads', async () => {
    expect(await loadPlayerSeasonSg(evalClient(db()) as never, GOLDEN_PLAYER_ID, { surface: 'test.sg', now: NOW })).toEqual({ tee: null, approach: null, short_game: null, putting: null });
    // Give G1 and G3 putting strokes gained: two whole rounds stay under the floor; with G2's nine they are still 2.5.
    const rows = goldenRoundRows().map((r) => (r.id === G1_ID ? { ...r, strokes_gained_putting: -1 } : r.id === G2_ID ? { ...r, strokes_gained_putting: -0.5 } : r));
    const rounds = rows.map((r) => ({ ...r, total_only: r.id === 'golden-g3' })) as never[];
    expect(seasonSgByCategory(rounds, ZONE, NOW).putting).toBeNull();
    // A third 18 still leaves 2.5 whole rounds; a fourth makes 3.5. Per 18 the nine's −0.5 is −1.0 and weighs half: −3.5 over 3.5.
    const g1 = rows.find((r) => r.id === G1_ID) as object;
    const third = [...rounds, { ...g1, id: 'golden-g5', round_date: '2026-10-20', strokes_gained_putting: -1 }] as never[];
    expect(seasonSgByCategory(third, ZONE, NOW).putting).toBeNull();
    const fourth = [...third, { ...g1, id: 'golden-g6', round_date: '2026-10-25', strokes_gained_putting: -1 }] as never[];
    expect(seasonSgByCategory(fourth, ZONE, NOW).putting).toBeCloseTo(-1, 10);
  });

  it('the season starts on the team’s clock, and Eastern when the player has no team', async () => {
    const holder = { current: { tables: { golf_team_members: [{ player_id: 'p', team_id: 't', status: 'active', created_at: '2026-08-02' }], golf_team_settings: [{ team_id: 't', timezone: 'America/Los_Angeles' }] } } };
    expect(await loadPlayerTeamZone(evalClient(holder) as never, 'p', 'test')).toBe('America/Los_Angeles');
    expect(await loadPlayerTeamZone(evalClient({ current: { tables: { golf_team_members: [], golf_team_settings: [] } } }) as never, 'p', 'test')).toBe('America/New_York');
  });
});
