import { describe, it, expect } from 'vitest';
import type {
  InsightEffectivenessData,
  InsightTypeMetrics,
  PredictionPerformanceData,
} from '@/app/golf/actions/coachhelm-analytics';
import { summarizeAdoption, summarizeCalibration, topInsightTypes } from '../buildEffectivenessScoreboard';

function metric(overrides: Partial<InsightTypeMetrics> = {}): InsightTypeMetrics {
  return {
    insightType: 'putting_weakness',
    insightsGenerated: 10,
    insightsDismissed: 1,
    insightsActedUpon: 6,
    insightsWithOutcome: 4,
    outcomesImproved: 3,
    outcomesNoChange: 1,
    outcomesWorsened: 0,
    actionRate: 0.6,
    improvementRate: 0.75,
    effectivenessScore: 0.7,
    ...overrides,
  };
}

function effectiveness(byType: InsightTypeMetrics[]): InsightEffectivenessData {
  const totalGenerated = byType.reduce((n, m) => n + m.insightsGenerated, 0);
  const totalActedUpon = byType.reduce((n, m) => n + m.insightsActedUpon, 0);
  return {
    byType,
    overall: {
      totalGenerated,
      totalActedUpon,
      totalWithOutcome: byType.reduce((n, m) => n + m.insightsWithOutcome, 0),
      totalImproved: byType.reduce((n, m) => n + m.outcomesImproved, 0),
      overallActionRate: totalGenerated > 0 ? totalActedUpon / totalGenerated : 0,
      overallImprovementRate: 0,
      overallEffectivenessScore: 0,
    },
    periodStart: '2026-06-01',
    periodEnd: '2026-07-01',
  };
}

function performance(overrides: Partial<PredictionPerformanceData['summary']> = {}): PredictionPerformanceData {
  return {
    accuracyOverTime: [],
    calibration: [],
    errorDistribution: [],
    summary: {
      totalPredictions: 10,
      validatedPredictions: 10,
      overallAccuracy: 0.7,
      meanAbsoluteError: 0.1,
      calibrationScore: 0.8,
      overconfidenceRate: 0.1,
      underconfidenceRate: 0.1,
      ...overrides,
    },
    periodStart: '2026-06-01',
    periodEnd: '2026-07-01',
  };
}

describe('summarizeAdoption', () => {
  it('is not live when nothing has generated', () => {
    expect(summarizeAdoption(undefined)).toEqual({ live: false, pct: 0, actedUpon: 0, generated: 0 });
  });

  it('rounds the acted-on fraction to a whole percent', () => {
    const result = summarizeAdoption(effectiveness([metric({ insightsGenerated: 4, insightsActedUpon: 1 })]));
    expect(result).toEqual({ live: true, pct: 25, actedUpon: 1, generated: 4 });
  });
});

describe('topInsightTypes', () => {
  it('excludes unmeasured types (no recorded outcome)', () => {
    const untested = metric({ insightType: 'untested', insightsWithOutcome: 0 });
    const tested = metric({ insightType: 'tested', insightsWithOutcome: 2 });
    const result = topInsightTypes([untested, tested], 'best');
    expect(result.map((r) => r.insightType)).toEqual(['tested']);
  });

  it('ranks best-first by effectivenessScore for direction "best"', () => {
    const low = metric({ insightType: 'low', effectivenessScore: 0.2 });
    const high = metric({ insightType: 'high', effectivenessScore: 0.9 });
    const mid = metric({ insightType: 'mid', effectivenessScore: 0.5 });
    const result = topInsightTypes([low, high, mid], 'best');
    expect(result.map((r) => r.insightType)).toEqual(['high', 'mid', 'low']);
  });

  it('ranks worst-first by effectivenessScore for direction "worst"', () => {
    const low = metric({ insightType: 'low', effectivenessScore: 0.2 });
    const high = metric({ insightType: 'high', effectivenessScore: 0.9 });
    const result = topInsightTypes([low, high], 'worst');
    expect(result.map((r) => r.insightType)).toEqual(['low', 'high']);
  });

  it('caps at the limit (default 3)', () => {
    const items = Array.from({ length: 5 }, (_, i) => metric({ insightType: `type-${i}`, effectivenessScore: i }));
    expect(topInsightTypes(items, 'best')).toHaveLength(3);
  });
});

describe('summarizeCalibration', () => {
  it('is not live below the minimum validated-prediction sample', () => {
    const result = summarizeCalibration(performance({ validatedPredictions: 2 }));
    expect(result.live).toBe(false);
    expect(result.tone).toBe('neutral');
  });

  it('is not live when performance is undefined', () => {
    expect(summarizeCalibration(undefined).live).toBe(false);
  });

  it('flags overconfidence when the overconfidence rate leads', () => {
    const result = summarizeCalibration(
      performance({ validatedPredictions: 20, overconfidenceRate: 0.4, underconfidenceRate: 0.05 }),
    );
    expect(result.live).toBe(true);
    expect(result.tone).toBe('warning');
    expect(result.label).toContain('overconfident');
  });

  it('flags underconfidence when the underconfidence rate leads', () => {
    const result = summarizeCalibration(
      performance({ validatedPredictions: 20, overconfidenceRate: 0.05, underconfidenceRate: 0.4 }),
    );
    expect(result.tone).toBe('warning');
    expect(result.label).toContain('underconfident');
  });

  it('reads as well matched when neither rate leads by the gap threshold', () => {
    const result = summarizeCalibration(
      performance({ validatedPredictions: 20, overconfidenceRate: 0.12, underconfidenceRate: 0.1 }),
    );
    expect(result.tone).toBe('positive');
    expect(result.label).toContain('well matched');
  });
});
