import { describe, expect, it } from 'vitest';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { penalties } from '../../preview/fixtures-coachhelm';
import { kindOf } from '../coachhelm-classify';
import { toChInsight } from '../coachhelm-map';
import type { ChTourBaseline } from '../coachhelm-shape';

/** TEAM-S1 (P0): the Tour bar drew 18 ft beside greens hit, 67%, because the Tour row belongs to the metric id and this row carries that id with a percent. */
const METRIC = 'approach_proximity_50_125ft';
const TOUR: ChTourBaseline = { tour: 'pga', values: new Map([[METRIC, 18], ['penalty_rate_per_round', 0.3], ['big_number_rate', 2], ['practice_tournament_delta', 0.5]]) };

const read = (e: Partial<InsightEvidence>, content = ''): EvidenceInsight => {
  const base = penalties('pl-1');
  return { ...base, ...(content ? { content } : {}), evidence: { ...base.evidence, secondary_source: undefined, secondary_value: undefined, ...e } };
};
const greensHit = (e: Partial<InsightEvidence>, content = '') => read({ metric: METRIC, metric_label: 'Greens hit from 50–125 yd', unit: 'percent', your_value: 67, your_value_display: '67%', comparison_label: 'Tour', ...e }, content);

describe('the Tour bar beside a read', () => {
  it('equals the Tour figure the read states, not the Tour row of its metric id', () => {
    const row = greensHit({ comparison_source: 'pga_baseline', comparison_value: 72 }, 'You hit 67% of greens from 50–125 yd against the Tour’s 72%.');
    const c = toChInsight(row, { tour: TOUR }).compare!;
    expect(c.tour).toBe(72);
    expect(row.content).toContain(`${c.tour}%`);
    expect(c.unit).toBe('%');
  });

  it('is not drawn when the only Tour figure is in another unit', () => {
    for (const comparison_source of ['cohort_avg', 'your_baseline', 'team_avg', 'absolute_target', 'estimated_target', 'd2_avg'] as const) {
      const ch = toChInsight(greensHit({ comparison_source, comparison_value: 60 }), { tour: TOUR });
      expect(ch.compare!.tour, comparison_source).toBeNull();
    }
  });

  it('the gauge and the strength decision agree: no 18 ft on a percent card', () => {
    const row = greensHit({ comparison_source: 'cohort_avg', comparison_value: 60 });
    const ch = toChInsight(row, { tour: TOUR });
    expect(ch.evidence.gauge).toBeNull();
    // 67 is "better" than a lower-is-better 18 only by mixing the units; with no comparison it is not a strength.
    expect(kindOf(row, TOUR)).toBe('finding');
  });

  it('another comparison is never called Tour', () => {
    // Penalties against the player's own 1.4: the Tour bar is the Tour's 0.3, in the same unit, not the 1.4. With no Tour known, none.
    const row = read({ metric: 'penalty_rate_per_round', unit: 'count', comparison_source: 'your_baseline', comparison_value: 1.4 });
    expect(toChInsight(row, { tour: TOUR }).compare!.tour).toBe(0.3);
    expect(toChInsight(row, { tour: null }).compare!.tour).toBeNull();
  });

  it('the Tour tick the generator carried beside a college figure is the bar', () => {
    const row = greensHit({ comparison_source: 'cohort_avg', comparison_value: 60, secondary_source: 'pga_baseline', secondary_value: 72 });
    expect(toChInsight(row, { tour: TOUR }).compare!.tour).toBe(72);
  });

  it.each([
    ['penalty_rate_per_round', 'count', 0.3],
    ['big_number_rate', 'percent', 2],
    ['practice_tournament_delta', 'strokes', 0.5],
  ] as const)('a college comparison on %s, in its own unit, still draws the Tour’s value', (metric, unit, tour) => {
    const row = read({ metric, unit, comparison_source: 'cohort_avg', comparison_value: 9 });
    const ch = toChInsight(row, { tour: TOUR });
    expect(ch.compare!.tour).toBe(tour);
    expect(ch.evidence.gauge).not.toBeNull();
  });

  it('a metric the registry doesn’t know can’t be confirmed, so it draws none', () => {
    const row = read({ metric: 'made_up_metric', comparison_source: 'cohort_avg', comparison_value: 9 });
    expect(toChInsight(row, { tour: { tour: 'pga', values: new Map([['made_up_metric', 3]]) } }).compare!.tour).toBeNull();
  });
});
