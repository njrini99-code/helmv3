import { describe, expect, it } from 'vitest';
import { deriveTone, isImprovement } from '@/components/golf/coachhelm/insight-card/tone-derivation';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { buildDiagnosis } from '@/lib/coachhelm/v3/engine/generator-base';
import { COMPARISON_SOURCES } from '@/lib/coachhelm/v2/insights/types';

/**
 * Repair plan Package 2 — "verify no new contradiction across the headline,
 * body, evidence panel, and action". These fixtures pin the consumer-side
 * identity repairs for the approach_miss row shape that production carries
 * (registry id = proximity in feet, headline value = green-hit percent).
 */

/** The production approach_miss evidence shape, as written by the generator. */
function approachMissEvidence(over: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'approach_proximity_125_175ft',
    metric_label: 'Greens hit from 125-175 yd',
    unit: 'percent',
    polarity: 'higher_better',
    your_value: 55.7,
    your_value_display: '56%',
    comparison_value: 65,
    comparison_label: 'PGA Tour (approx)',
    comparison_source: 'pga_baseline',
    sample_n: 45,
    window_days: 90,
    window_start: '',
    window_end: '',
    strokes_impact: 0,
    strokes_impact_method: 'peer_delta',
    confidence: 0.6,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5, factors_measured: false },
    ...over,
  };
}

function insight(evidence: InsightEvidence, over: Partial<EvidenceInsight> = {}): EvidenceInsight {
  return {
    id: 'i-1',
    title: '125-175 yd approach: 56% greens hit',
    content: '',
    category: 'approach',
    priority: 'low',
    lifecycle_state: 'detected',
    status: 'active',
    evidence,
    metadata: null,
    created_at: '2026-09-01T00:00:00Z',
    ...over,
  } as unknown as EvidenceInsight;
}

describe('approach_miss identity: green-hit percent under a proximity id', () => {
  it('movement on the green-hit rate reads in the right direction (was inverted for every live row)', () => {
    const ev = approachMissEvidence();
    expect(isImprovement('up', ev.metric, ev)).toBe(true);
    expect(isImprovement('down', ev.metric, ev)).toBe(false);
  });

  it('rows written before `polarity` existed resolve the same way from unit + label', () => {
    const { polarity: _omit, ...legacy } = approachMissEvidence();
    expect('polarity' in legacy).toBe(false);
    expect(isImprovement('up', legacy.metric, legacy)).toBe(true);
    expect(isImprovement('down', legacy.metric, legacy)).toBe(false);
  });

  it('deriveTone can call a player ahead of the green-hit anchor encouraging', () => {
    const ahead = insight(approachMissEvidence({ your_value: 72, comparison_value: 65 }));
    expect(deriveTone(ahead)).toBe('encouraging');
    const behind = insight(approachMissEvidence({ your_value: 40, comparison_value: 65 }));
    expect(deriveTone(behind)).toBe('neutral');
  });

  it('a genuine proximity row (feet) keeps the registry reading', () => {
    const ev = approachMissEvidence({
      metric_label: 'Approach Proximity 125-175 yd',
      unit: 'feet',
      polarity: undefined,
      your_value: 21,
      comparison_value: 30,
    });
    delete (ev as { polarity?: unknown }).polarity;
    expect(isImprovement('down', ev.metric, ev)).toBe(true);
    expect(deriveTone(insight(ev))).toBe('neutral'); // 21 < 30 is ahead on a lower_better metric, but tone only rewards positive polarity
  });

  it('the base diagnosis driver carries the evidence label so a percent never renders under a feet heading', () => {
    const ev = approachMissEvidence();
    const d = buildDiagnosis(ev.metric, ev);
    expect(d.drivers[0]).toMatchObject({
      metric: 'approach_proximity_125_175ft',
      label: 'Greens hit from 125-175 yd',
      unit: 'percent',
      value: 55.7,
    });
    expect(d.symptom).toContain('Greens hit from 125-175 yd: 56%');
  });
});

/**
 * Every live (metric, unit, label) triple was enumerated against the render
 * registry on 2026-09-12. `sg_ott` is the only other registry id whose rows
 * carry a different unit (percent: driver fairway %, 72 rows) — the label
 * fallback and the registry agree there, and the producer now stamps
 * `polarity` anyway. Two non-registry ids resolved to higher_better by name
 * and were painting a worsening value green; their producers now stamp
 * `polarity: lower_better`. The rows below are the live shapes.
 */
describe('polarity on the other live row shapes', () => {
  const rows: Array<{ name: string; ev: Partial<InsightEvidence>; lowerBetter: boolean }> = [
    {
      name: 'tee strategy: fairway % under the SG id (unit disagrees, label agrees)',
      ev: { metric: 'sg_ott', metric_label: 'Tee Strategy', unit: 'percent', polarity: 'higher_better' },
      lowerBetter: false,
    },
    {
      name: 'tee strategy legacy row without polarity',
      ev: { metric: 'sg_ott', metric_label: 'Tee Strategy', unit: 'percent', polarity: undefined },
      lowerBetter: false,
    },
    {
      name: 'lag-distance 3-putt estimate (non-registry id, no name-pattern hit)',
      ev: { metric: 'three_putt_chain', metric_label: 'Estimated 3-putt rate (15+ ft)', unit: 'percent', polarity: 'lower_better' },
      lowerBetter: true,
    },
    {
      name: 'v2 worst holes (strokes over par)',
      ev: { metric: 'course_worst_holes', metric_label: 'Worst 3 holes on Boonsboro CC', unit: 'strokes', polarity: 'lower_better' },
      lowerBetter: true,
    },
    {
      name: 'short-approach composite: on-green leave in feet',
      ev: { metric: 'approach_proximity_50_125ft', metric_label: 'Short approach + scrambling', unit: 'feet', polarity: 'lower_better' },
      lowerBetter: true,
    },
    {
      name: 'registry percent rows keep the registry reading',
      ev: { metric: 'putts_made_3_5ft_pct', metric_label: 'Putts Made 3-5 ft', unit: 'percent', polarity: undefined },
      lowerBetter: false,
    },
    {
      name: 'registry lower_better rows keep the registry reading',
      ev: { metric: 'big_number_rate', metric_label: 'Double Bogey-or-Worse Rate', unit: 'percent', polarity: undefined },
      lowerBetter: true,
    },
  ];
  for (const row of rows) {
    it(row.name, () => {
      const ev = approachMissEvidence(row.ev);
      if (row.ev.polarity === undefined) delete (ev as { polarity?: unknown }).polarity;
      expect(isImprovement('down', ev.metric, ev)).toBe(row.lowerBetter);
      expect(isImprovement('up', ev.metric, ev)).toBe(!row.lowerBetter);
    });
  }

  it('a worsening 3-putt estimate is never called encouraging', () => {
    const worse = insight(
      approachMissEvidence({
        metric: 'three_putt_chain', metric_label: 'Estimated 3-putt rate (15+ ft)', unit: 'percent',
        polarity: 'lower_better', your_value: 25, comparison_value: 3,
      }),
      { category: 'putting' },
    );
    expect(deriveTone(worse)).toBe('neutral');
  });
});

describe('estimated_target is a first-class comparison source', () => {
  it('is in the runtime tuple used for validation', () => {
    expect(COMPARISON_SOURCES).toContain('estimated_target');
  });
});
