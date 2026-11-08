import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { comparisonsFor, levelFigure, SOURCED_LEVEL_FIGURES } from '../benchmark-reads';

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
