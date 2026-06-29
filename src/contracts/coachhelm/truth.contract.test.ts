import { describe, expect, it } from 'vitest';

import {
  getMetricDirection,
  improvementSign,
  METRIC_DIRECTION,
  METRIC_IDS,
} from '@/lib/coachhelm/v3/metrics/registry';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';
import {
  cappedStrokesImpact,
  sampleDamping,
  scoreInsight,
  STROKES_IMPACT_CEILING,
} from '@/lib/coachhelm/v3/ranking/score';
import { verifyCitations } from '@/lib/coachhelm/v3/llm/citations';
import { estimateCostUsd, FALLBACK_PRIORITY, MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';
import { calcConfidence } from '@/lib/coachhelm/shared/evidence-types';

describe('CoachHelm metric direction contracts', () => {
  it('CH-AI-001 and CH-AI-002 keep metric direction complete and mirrored in render config', () => {
    expect(Object.keys(METRIC_DIRECTION).sort()).toEqual([...METRIC_IDS].sort());
    expect(Object.keys(METRIC_RENDER_CONFIG).sort()).toEqual([...METRIC_IDS].sort());

    for (const metric of METRIC_IDS) {
      expect(METRIC_RENDER_CONFIG[metric].direction).toBe(METRIC_DIRECTION[metric]);
    }
  });

  it('CH-AI-003 gives lower-is-better metrics a negative improvement sign and higher-is-better metrics a positive sign', () => {
    expect(getMetricDirection('penalty_rate_per_round')).toBe('lower_better');
    expect(improvementSign('penalty_rate_per_round')).toBe(-1);
    expect(getMetricDirection('approach_proximity_125_175ft')).toBe('lower_better');
    expect(improvementSign('approach_proximity_125_175ft')).toBe(-1);
    expect(getMetricDirection('gir_pct')).toBe('higher_better');
    expect(improvementSign('gir_pct')).toBe(1);
    expect(getMetricDirection('sg_total')).toBe('higher_better');
    expect(improvementSign('sg_total')).toBe(1);
  });
});

describe('CoachHelm evidence and confidence contracts', () => {
  it('CH-AI-004 rejects unsupported numeric claims in LLM/NLG output', () => {
    expect(
      verifyCitations('Approach proximity improved to 28 ft with a 62% GIR rate.', [
        { field: 'approach_proximity', value: '28 ft' },
        { field: 'gir_pct', value: '62%' },
      ]),
    ).toEqual({ verified: true, unmatched_tokens: [] });

    expect(
      verifyCitations('Approach proximity improved to 28 ft with a 74% GIR rate.', [
        { field: 'approach_proximity', value: '28 ft' },
        { field: 'gir_pct', value: '62%' },
      ]),
    ).toEqual({ verified: false, unmatched_tokens: ['74%'] });
  });

  it('CH-AI-005 surfaces thin samples honestly when recency and variance are placeholders', () => {
    expect(
      calcConfidence({
        confidence_factors: {
          sample_adequacy: 0.2,
          recency: 1,
          variance: 1,
          factors_measured: false,
        },
      }),
    ).toBe(0.2);

    expect(sampleDamping(0)).toBe(0.25);
    expect(sampleDamping(3)).toBeLessThan(1);
    expect(sampleDamping(undefined)).toBe(1);
  });

  it('CH-AI-006 keeps ranking scores finite, non-negative, and magnitude-capped', () => {
    expect(cappedStrokesImpact(Number.NaN)).toBe(0);
    expect(cappedStrokesImpact(42)).toBe(STROKES_IMPACT_CEILING);

    const score = scoreInsight(
      {
        insight_type: 'putting',
        strokes_impact: 42,
        confidence: 1.5,
        metric: 'sg_putting',
        priority: 'high',
        sample_n: 12,
      },
      { putting: 1.25 },
      [],
    );

    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(STROKES_IMPACT_CEILING * 1.25 * 1.5);
  });

  it('CH-AI-009 keeps model budget cost and fallback priority explicit per task', () => {
    expect(Object.keys(MODEL_FOR_TASK).sort()).toEqual(Object.keys(FALLBACK_PRIORITY).sort());
    expect(FALLBACK_PRIORITY.round_review).toBeLessThan(FALLBACK_PRIORITY.coach_chat);
    expect(FALLBACK_PRIORITY.coach_chat).toBeLessThan(FALLBACK_PRIORITY.hero_narrative);
    expect(estimateCostUsd(MODEL_FOR_TASK.round_review, 1_000_000, 1_000_000)).toBeGreaterThan(0);
    expect(estimateCostUsd('unknown-model', 1_000_000, 1_000_000)).toBe(0);
  });
});
