import { describe, expect, it } from 'vitest';

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { ThemeNode, CauseNode } from '@/lib/coachhelm/v3/themes/types';
import {
  MAX_PREDICTION_BAND_STROKES,
  buildDriverTrends,
  buildInsightUnit,
  buildLastRound,
  buildLeakMap,
  buildNextRoundWindow,
  buildPlanRows,
  buildScoringTrend,
  buildSituations,
  fmtSigned,
  fmtUnsigned,
  formatAreaName,
  readQuality,
  situationLabel,
} from '../buildPlayerHubViewModel';

const EM_DASH = '—';

function insight(overrides: Partial<EvidenceInsight> = {}, evidence: Record<string, unknown> = {}): EvidenceInsight {
  return {
    id: 'ins-1',
    player_id: 'p-1',
    category: 'putting',
    title: 'Short putts are leaking strokes',
    content: 'You make 48% from 3 to 5 feet.',
    signature: null,
    evidence: {
      metric: 'putts_made_3_5ft_pct',
      metric_label: '3-5 ft makes',
      unit: 'percent',
      your_value: 0.48,
      your_value_display: '48%',
      comparison_value: 0.71,
      comparison_label: 'Team',
      comparison_source: 'team_avg',
      secondary_value: 0.91,
      secondary_label: 'PGA Tour',
      sample_n: 44,
      window_days: 30,
      window_start: '2026-08-01',
      window_end: '2026-08-31',
      strokes_impact: 1.14,
      strokes_impact_method: 'counterfactual',
      confidence: 0.82,
      confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
      ...evidence,
    },
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'high',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-08-31T00:00:00Z',
    updated_at: '2026-08-31T00:00:00Z',
    ...overrides,
  } as EvidenceInsight;
}

function theme(overrides: Partial<ThemeNode>): ThemeNode {
  return {
    category: 'putting',
    sgMetricId: 'sg_putting',
    displayLabel: 'Putting',
    isOutcomeTheme: false,
    themeStrokesPerRound: 0,
    tourGapPerRound: 0,
    sgPerRound: null,
    causes: [],
    state: 'thin',
    ...overrides,
  } as ThemeNode;
}

function cause(overrides: Partial<CauseNode>): CauseNode {
  return {
    insight_id: 'c-1',
    metric: 'putts_made_3_5ft_pct',
    title: '3-5 ft makes',
    content: '',
    strokesSavedPerRound: 0.5,
    tourGapPerRound: 1.2,
    counterfactualSuppressed: false,
    standingPlayerValue: null,
    standingPgaValue: null,
    standingTeamAvgValue: null,
    drivers: [],
    drills: [],
    canMakePlan: true,
    ...overrides,
  } as CauseNode;
}

describe('number helpers', () => {
  it('signs in the strokes-gained sense with a true minus and no sign on a rounded zero', () => {
    expect(fmtSigned(0.341)).toBe('+0.34');
    expect(fmtSigned(-0.209)).toBe('−0.21');
    expect(fmtSigned(-0.001)).toBe('0.00');
    expect(fmtUnsigned(-1.64)).toBe('1.6');
  });

  it('title-cases a snake_case area and leaves a humanized one alone', () => {
    expect(formatAreaName('practice_frequency')).toBe('Practice Frequency');
    expect(formatAreaName('Around The Green')).toBe('Around The Green');
  });
});

describe('readQuality (word band, never a percent)', () => {
  it('buckets 0..1 and 0..100 confidence into three words', () => {
    expect(readQuality(0.82)).toEqual({ level: 3, word: 'Strong read' });
    expect(readQuality(55)).toEqual({ level: 2, word: 'Fair read' });
    expect(readQuality(0.2)).toEqual({ level: 1, word: 'Early read' });
    expect(readQuality(null)).toBeNull();
  });
});

describe('buildScoringTrend', () => {
  const win = (name: string, size: number, slope: number, direction: string) => ({ name, size, slope, direction });

  it('reads agreeing windows as one word with the change in strokes over each window', () => {
    const t = buildScoringTrend({
      trends: { windows: [win('fast', 5, -0.4, 'improving'), win('medium', 12, -0.1, 'improving')] },
    });
    expect(t?.word).toBe('Improving');
    expect(t?.sense).toBe('better');
    expect(t?.windows.map((w) => w.text)).toEqual(['1.6 strokes lower across 5 rounds', '1.1 strokes lower across 12 rounds']);
    expect(t?.sentence).toBe('Last 5 rounds: 1.6 strokes lower across 5 rounds.');
  });

  it('names a turn when the recent window disagrees with the long one, and says both', () => {
    const t = buildScoringTrend({
      trends: { windows: [win('fast', 5, 0.5, 'declining'), win('slow', 25, -0.05, 'improving')] },
    });
    expect(t?.word).toBe('Turning worse');
    expect(t?.headline).toBe('Your recent scores have turned up');
    expect(t?.sentence).toContain('Over 25 rounds: 1.2 strokes lower across 25 rounds.');
  });

  it('shows a window once when few rounds collapse every window to the same size', () => {
    const t = buildScoringTrend({
      trends: { windows: [win('fast', 4, 0, 'stable'), win('medium', 4, 0, 'stable'), win('slow', 4, 0, 'stable')] },
    });
    expect(t?.windows).toHaveLength(1);
    expect(t?.word).toBe('Steady');
    expect(t?.windows[0]?.short).toBe('Holding steady');
  });

  it('returns null without windows (no fabricated trend)', () => {
    expect(buildScoringTrend(null)).toBeNull();
    expect(buildScoringTrend({ trends: { windows: [] } })).toBeNull();
    expect(buildScoringTrend({ trends: { signal: 'mixed' } })).toBeNull();
  });

  it('leaves out a window a partial round has dragged past a plausible change', () => {
    // A nine-hole 37 stored as -35 bends a 5-round slope to about -6 a round.
    const t = buildScoringTrend({
      trends: {
        windows: [
          { name: 'fast', size: 5, slope: -6.2, direction: 'improving' },
          { name: 'slow', size: 21, slope: 0.02, direction: 'stable' },
        ],
      },
    });
    expect(t?.windows.map((w) => w.rounds)).toEqual([21]);
    expect(t?.word).toBe('Steady');
    expect(buildScoringTrend({ trends: { windows: [{ name: 'fast', size: 5, slope: -6.2, direction: 'improving' }] } })).toBeNull();
  });
});

describe('buildDriverTrends (one sign convention: + is better)', () => {
  it('keeps the word, colour sense and signed delta in agreement, biggest mover first', () => {
    const rows = buildDriverTrends([
      theme({ trend: { direction: 'improving', recentAvg: 0.1, priorAvg: -0.2, delta: 0.3, recentN: 5, priorN: 5 } }),
      theme({
        category: 'approach',
        sgMetricId: 'sg_approach',
        displayLabel: 'Approach',
        trend: { direction: 'declining', recentAvg: -0.9, priorAvg: -0.4, delta: -0.5, recentN: 5, priorN: 6 },
      }),
      theme({ category: 'scoring', sgMetricId: null, isOutcomeTheme: true, displayLabel: 'Scoring' }),
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Approach', 'Putting']);
    expect(rows[0]).toMatchObject({ sense: 'worse', word: 'Slipping', deltaText: '−0.50 a round', sample: 'Last 5 rounds vs the 6 before' });
    expect(rows[1]).toMatchObject({ sense: 'better', word: 'Improving', deltaText: '+0.30 a round' });
  });
});

describe('buildInsightUnit', () => {
  it('builds the cause chain in order with a Likely marker on an inferred cause', () => {
    const unit = buildInsightUnit(
      insight({}, {
        diagnosis: {
          symptom: 'You make 48% of putts from 3 to 5 ft',
          root_cause: 'Misses finish high side under pressure',
          causality_level: 'inferred_hypothesis',
          drivers: [],
          recommended_action: 'Gate drill',
          confidence_reason: 'n=44',
        },
      }),
    );
    expect(unit.claim).toBe('Short putts are leaking strokes');
    expect(unit.chain.map((s) => [s.label, s.text, s.marker])).toEqual([
      ['What we see', 'You make 48% of putts from 3 to 5 ft', undefined],
      ['What it is worth', 'About 1.1 strokes a round', undefined],
      ['Why', 'Misses finish high side under pressure', 'Likely'],
    ]);
    expect(unit.body).toBeNull();
    expect(unit.read?.word).toBe('Strong read');
  });

  it('marks a cause measured only when it was observed in a shot sequence', () => {
    const unit = buildInsightUnit(
      insight({}, {
        diagnosis: { symptom: 's', root_cause: 'c', causality_level: 'observed_sequence', drivers: [], recommended_action: '', confidence_reason: '' },
      }),
    );
    expect(unit.chain.find((s) => s.key === 'cause')?.marker).toBe('Measured');
  });

  it('puts a percent rail on a 0-100 axis with fractions scaled, never "42% ... 104%" (NUM-38)', () => {
    const rail = buildInsightUnit(insight()).rail!;
    expect(rail.min).toBe(0);
    expect(rail.max).toBe(100);
    expect(rail.marks.map((m) => [m.key, m.label, m.value, m.display])).toEqual([
      ['you', 'You', 48, '48%'],
      ['team', 'Team', 71, '71%'],
      ['tour', 'PGA Tour', 91, '91%'],
    ]);
    expect(rail.lowerIsBetter).toBe(false);
    expect(rail.youSense).toBe('worse');
  });

  it('reads a lower-is-better metric the right way round', () => {
    const rail = buildInsightUnit(
      insight({}, { metric: 'approach_proximity', unit: 'feet', your_value: 28, your_value_display: '', comparison_value: 34, secondary_value: 25 }),
    ).rail!;
    expect(rail.lowerIsBetter).toBe(true);
    expect(rail.youSense).toBe('better');
    expect(rail.min).toBeGreaterThanOrEqual(0);
  });

  it('states the sample and a live data-through line, and flags an insight built before the last round (NUM-12)', () => {
    const unit = buildInsightUnit(insight(), { lastRoundDate: '2026-09-20' });
    expect(unit.sample).toBe('44 putts over 30 days');
    expect(unit.dataThrough).toBe('Data through Aug 31');
    expect(unit.predatesLastRound).toBe(true);
    expect(buildInsightUnit(insight(), { lastRoundDate: '2026-08-30' }).predatesLastRound).toBe(false);
  });

  it('turns a movement into one word whose sense matches the metric polarity', () => {
    const up = buildInsightUnit(insight({ metadata: { movement: { from: 0.41, to: 0.48, direction: 'up', percent_change: 0.17 } } }));
    expect(up.movement).toEqual({ word: 'Improving', sense: 'better', text: '41% to 48%' });
    const worse = buildInsightUnit(
      insight(
        { metadata: { movement: { from: 20, to: 26, direction: 'up', percent_change: 0.3 } } },
        { metric: 'approach_proximity', unit: 'feet', your_value: 26, your_value_display: '' },
      ),
    );
    expect(worse.movement).toMatchObject({ word: 'Slipping', sense: 'worse' });
  });

  it('falls back to the prose only when there is no structured chain, and carries the first drill', () => {
    const unit = buildInsightUnit(
      insight(
        { drills: [{ id: 'd1', slug: 'gate', title: 'Gate drill', duration_min: 15, difficulty: 'easy' }] },
        { metric_label: '', strokes_impact: 0 },
      ),
    );
    expect(unit.chain).toEqual([]);
    expect(unit.body).toBe('You make 48% from 3 to 5 feet.');
    expect(unit.drill).toEqual({ title: 'Gate drill', minutes: 15 });
  });
});

describe('buildLeakMap', () => {
  it('ranks leak-theme causes by strokes to win back, skipping suppressed and zero causes', () => {
    const rows = buildLeakMap([
      theme({
        state: 'leak',
        causes: [
          cause({ insight_id: 'a', title: '3-5 ft makes', strokesSavedPerRound: 0.42, tourGapPerRound: 1.1 }),
          cause({ insight_id: 'b', title: 'Lag speed', strokesSavedPerRound: 0, tourGapPerRound: 0.3 }),
          cause({ insight_id: 'c', title: 'Break read', strokesSavedPerRound: 0.2, counterfactualSuppressed: true }),
        ],
      }),
      theme({
        category: 'approach',
        displayLabel: 'Approach',
        state: 'leak',
        causes: [cause({ insight_id: 'd', title: '150-175 yd', strokesSavedPerRound: 0.61, tourGapPerRound: 0.61 })],
      }),
      theme({ category: 'tee', displayLabel: 'Off the Tee', state: 'strength', causes: [cause({ insight_id: 'e', strokesSavedPerRound: 0.9 })] }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['d', 'a']);
    expect(rows[0]).toMatchObject({ theme: 'Approach', gainText: '0.61 a round', tourText: null });
    expect(rows[1]).toMatchObject({ gainText: '0.42 a round', tourText: '1.10 to Tour level' });
  });
});

describe('buildSituations (patterns are situations, not skills)', () => {
  it('names the situation plainly and states the score gap without a sign', () => {
    const rows = buildSituations([
      { area: 'Back-to-back rounds', strokesGained: -4.25, unit: 'strokes/round' },
      { area: 'In tournament', strokesGained: -6.42, unit: 'strokes/round' },
      { area: 'practice_frequency', strokesGained: -0.3, value: 0.3, unit: 'opportunity' },
      { area: '150-175 yds Shots', strokesGained: -2.3, value: 23.4, unit: 'yd from target' },
    ]);
    expect(rows.map((r) => [r.label, r.valueText, r.sense])).toEqual([
      ['Tournament rounds', '6.4 strokes higher', 'worse'],
      ['Second day in a row', '4.3 strokes higher', 'worse'],
      ['150-175 yd shots', '23 yd', 'level'],
      ['Practice Frequency', null, 'level'],
    ]);
  });

  it('keeps a known label mapping case-insensitive', () => {
    expect(situationLabel('IN QUALIFIER')).toBe('Qualifying rounds');
  });
});

describe('buildNextRoundWindow (band guard)', () => {
  it('shows a to-par band labelled as the 80% range, never the confidence number', () => {
    const w = buildNextRoundWindow({ predictedValue: 2.3, predictedRangeLow: -1.2, predictedRangeHigh: 5.1, metric: 'score_to_par' });
    expect(w?.pointText).toBe('+2.3');
    expect(w?.band).toMatchObject({ lowText: '−1.2', highText: '+5.1' });
    expect(w?.caption).toBe('80% of rounds like this land in the band');
    expect(w?.metricLabel).toBe('to par');
  });

  it(`hides a band wider than ${MAX_PREDICTION_BAND_STROKES} strokes and keeps the estimate`, () => {
    const w = buildNextRoundWindow({ predictedValue: 74.2, predictedRangeLow: 66, predictedRangeHigh: 80, metric: 'total_score' });
    expect(w?.band).toBeNull();
    expect(w?.pointText).toBe('74.2');
    expect(w?.caption).toBe('The range shows once more rounds narrow it');
  });

  it('prints E for level par and returns null with no prediction', () => {
    expect(buildNextRoundWindow({ predictedValue: 0.02, metric: 'score_to_par' })?.pointText).toBe('E');
    expect(buildNextRoundWindow(null)).toBeNull();
    expect(buildNextRoundWindow({ predictedValue: null })).toBeNull();
  });
});

describe('buildLastRound / buildPlanRows', () => {
  it('formats the last round and hides a placeholder course name', () => {
    expect(buildLastRound([{ score: 76, scoreToPar: 4, date: '2026-09-20', courseName: 'Unknown Course' }])).toEqual({
      score: 76,
      toParText: '+4',
      date: 'Sep 20',
      course: null,
    });
    expect(buildLastRound([])).toBeNull();
    // A nine-hole score saved against an 18-hole par keeps its score, loses the to-par.
    expect(buildLastRound([{ score: 37, scoreToPar: -35, date: '2026-09-17', courseName: 'Peek' }])?.toParText).toBeNull();
  });

  it('measures plan progress from the baseline, not current / target', () => {
    const rows = buildPlanRows([
      { id: 'a', title: 'Lag putting', baseline_value: 61, current_value: 63, target_value: 66, status: 'active' },
      { id: 'b', title: null, area_type: 'short_game', baseline_value: null, current_value: 40, target_value: 50, status: 'paused' },
    ]);
    expect(rows[0]).toEqual({ id: 'a', title: 'Lag putting', pct: 40, status: '40% of the way' });
    expect(rows[1]).toEqual({ id: 'b', title: 'Short Game', pct: null, status: 'Paused' });
  });
});

describe('no em dash placeholders anywhere in the view model', () => {
  it('never emits the missing-value glyph', () => {
    const strings = JSON.stringify([
      buildInsightUnit(insight({}, { your_value_display: '', comparison_value: undefined, secondary_value: undefined })),
      buildSituations([{ area: 'In tournament', strokesGained: -1, unit: 'strokes/round' }]),
      buildNextRoundWindow({ predictedValue: 1, metric: 'score_to_par' }),
      buildPlanRows([{ id: 'x' }]),
    ]);
    expect(strings).not.toContain(EM_DASH);
  });
});
