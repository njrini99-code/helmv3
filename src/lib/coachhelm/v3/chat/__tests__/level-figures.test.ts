import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { benchmarkSource, comparisonsFor, levelFigure, SOURCED_LEVEL_FIGURES, type StandingLite } from '../benchmark-reads';
import { pgrst } from './pgrst-double';

// Player Ask, staging, 2026-11-08: "From 50-125 yd you average 29.39 ft. The Division I average is 28 ft." The 28 is a seeded estimate from an
// internal research note, not a published Division I average. A level figure is stated only with a traceable basis, and worded for what it is.

const row = (over: Record<string, unknown> = {}) =>
  ({ metric_id: 'approach_proximity_50_125ft', season: '2024', display_label: 'Approach Proximity 50-125 yd', pga_tour_value: 18, korn_ferry_value: null, div1_avg_value: 28, div2_avg_value: 33, div3_avg_value: 38, hs_avg_value: 45, pga_p25: 16, pga_p50: 18, pga_p75: 22, source: 'Tour 50-125 yd ~16-19 ft. D1 ~25-32 ft (§3).', ...over }) as never;
const level = (std: never, teamLevel: 'd1' | 'd2' | 'd3' = 'd1') => comparisonsFor({ metricId: 'approach_proximity_50_125ft', std, tour: 'pga', teamLevel, standing: null, team: { kind: 'missing', reason: 'x', note: 'x' }, teamFigure: false }).find((c) => c.kind === 'level')!;

afterEach(() => {
  delete SOURCED_LEVEL_FIGURES.approach_proximity_50_125ft;
});

describe('a level figure needs a traceable basis', () => {
  it('no division figure in the standards table has one today: every level reads "no college figure", whatever the table holds', () => {
    expect(SOURCED_LEVEL_FIGURES).toEqual({});
    for (const lv of ['d1', 'd2', 'd3'] as const) {
      expect(level(row(), lv)).toMatchObject({ value: null, missing_reason: 'no college figure' });
    }
    expect(levelFigure(row(), 'hs')).toBeNull();
  });

  it('a figure with a stated basis is stated, and an estimate is worded as an estimate with its basis, never as an average', () => {
    SOURCED_LEVEL_FIGURES.approach_proximity_50_125ft = { d1: { basis: 'estimate', source: 'scratch-golfer proximity, Shot Scope' } };
    const est = level(row());
    expect(est).toMatchObject({ label: 'Division I estimate', value: 28, missing_reason: null });
    expect(est.note).toContain('An estimate: scratch-golfer proximity, Shot Scope.');
    // Another level of the same metric has no basis.
    expect(level(row(), 'd2')).toMatchObject({ value: null, missing_reason: 'no college figure' });
    SOURCED_LEVEL_FIGURES.approach_proximity_50_125ft = { d1: { basis: 'published', source: 'a published table' } };
    expect(level(row())).toMatchObject({ label: 'Division I average', value: 28 });
  });
});

// Owner, 2026-11-08: every comparison covers level, team and Tour. With no college figure that can be traced, the level is Helm's own data: the
// mean of the OTHER players on Helm at the team's division, else the other college players on Helm; the place stays.
describe('the level is Helm’s own cohort, the player left out', () => {
  const standing = (over: Partial<StandingLite> = {}): StandingLite => ({ player_id: 'p1', metric_id: 'gir_pct', player_value: 60, level_avg: 55, level_n: 71, level_pct: 90, team_avg: 57, team_n: 9, team_pct: 50, basis: null, ...over });
  const ref = { kind: 'missing' as const, reason: 'x', note: 'x' };
  const levelOf = (over: Record<string, unknown>) =>
    comparisonsFor({ metricId: 'gir_pct', std: row({ metric_id: 'gir_pct' }), tour: 'pga', teamLevel: 'd1', standing: standing(), team: ref, teamFigure: false, ...over } as never).find((c) => c.kind === 'level')!;

  it('the division cohort’s mean leaves the player out, names its n, and keeps the place among college players on Helm', () => {
    // 23 players average 50 with this player at 60: the other 22 average (50 * 23 - 60) / 22.
    const c = levelOf({ divisionCohort: { avg: 50, n: 23 } });
    // The level carries the player's own all-rounds figure (the standing's player_value), the basis the mean is over.
    expect(c).toMatchObject({ label: 'Division I players on Helm (n=22)', value: 49.55, your_value: 60, missing_reason: null, place_percent: 90, place_of: 71 });
    expect(c.note).toContain('Mean of the other 22 Division I players on Helm');
    expect(c.note).toContain('this player is left out');
    expect(c.note).toContain('Place is among 71 college players on helm');
  });

  it('needs at least 8 others: a division cohort of 8 (7 others) is not enough, and the college players on Helm stand in, labelled that way', () => {
    const c = levelOf({ divisionCohort: { avg: 50, n: 8 } });
    // (55 * 71 - 60) / 70
    expect(c).toMatchObject({ label: 'College players on Helm (n=70)', value: 54.93, place_percent: 90 });
    expect(c.note).toMatch(/not yet 8 other Division I players/);
    expect(levelOf({ divisionCohort: { avg: 50, n: 9 } })).toMatchObject({ label: 'Division I players on Helm (n=8)' });
    expect(levelOf({ divisionCohort: null, tour: 'lpga' })).toMatchObject({ label: 'Women’s college players on Helm (n=70)' });
  });

  it('with too few of either, the level is missing and says so, and still gives the place', () => {
    const c = levelOf({ divisionCohort: null, standing: standing({ level_avg: null, level_n: 7, level_pct: null }) });
    expect(c).toMatchObject({ value: null, missing_reason: 'not enough Division I players on Helm yet', place_percent: null });
    expect(levelOf({ divisionCohort: { avg: 50, n: 23 }, standing: standing({ level_avg: null, level_n: 7, level_pct: 80 }) })).toMatchObject({ value: 49.55 });
    // A cohort of exactly 9 players has 8 others: allowed. The standing's own floor is 8 including the player, so 8 total is 7 others: not.
    expect(levelOf({ divisionCohort: null, standing: standing({ level_avg: 55, level_n: 8 }) })).toMatchObject({ value: null, missing_reason: 'not enough Division I players on Helm yet' });
    expect(levelOf({ divisionCohort: null, standing: standing({ level_avg: 55, level_n: 9 }) })).toMatchObject({ label: 'College players on Helm (n=8)' });
  });

  it('a team’s own figure is not compared with players’ means, and a division that is not set stays "not set"', () => {
    expect(levelOf({ teamFigure: true, standing: null, divisionCohort: { avg: 50, n: 23 } })).toMatchObject({ value: null, missing_reason: 'no college figure' });
    expect(levelOf({ teamLevel: null, divisionCohort: { avg: 50, n: 23 } })).toMatchObject({ value: null, missing_reason: 'not set' });
  });

  describe('the source reads aggregates only', () => {
    const rows = [
      { gender: 'mens', level: 'd1', metric_id: 'gir_pct', cohort_avg: '61.25', cohort_n: 23, computed_at: 'x' },
      { gender: 'mens', level: 'd1', metric_id: 'sg_putting', cohort_avg: 0.1, cohort_n: 7, computed_at: 'x' },
      { gender: 'womens', level: 'd1', metric_id: 'gir_pct', cohort_avg: 70, cohort_n: 30, computed_at: 'x' },
      { gender: 'mens', level: 'd2', metric_id: 'gir_pct', cohort_avg: 40, cohort_n: 12, computed_at: 'x' },
    ];

    it('asks for the level and gender, selects the mean and the count and no player column, and drops a cohort under the floor', async () => {
      const { sb, calls } = pgrst({ golf_division_cohort: { rows } });
      const got = await benchmarkSource(sb, 'team-1').divisionCohort('d1', 'pga', ['gir_pct', 'sg_putting']);
      expect([...got!.entries()]).toEqual([['gir_pct', { avg: 61.25, n: 23 }]]);
      const mine = calls.filter((c) => c.table === 'golf_division_cohort');
      expect(mine.find((c) => c.method === 'select')!.args[0]).toBe('metric_id, cohort_avg, cohort_n');
      expect(mine.filter((c) => c.method === 'eq').map((c) => JSON.stringify(c.args)).sort()).toEqual(['["gender","mens"]', '["level","d1"]']);
      expect(JSON.stringify([...got!.values()])).not.toMatch(/player/);
    });

    it('a table that is not there yet is "no division cohort" (null), not an error', async () => {
      const { sb } = pgrst({ golf_division_cohort: { error: { code: '42P01', message: 'relation "golf_division_cohort" does not exist' } } });
      expect(await benchmarkSource(sb, 'team-1').divisionCohort('d1', 'pga', ['gir_pct'])).toBeNull();
    });
  });
});
