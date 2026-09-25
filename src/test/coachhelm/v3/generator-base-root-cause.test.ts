/**
 * `BaseGenerator.run()` × root-cause wiring (2026-09-24). The DB boundary is
 * mocked; the shot context comes from the A10 established-roster fixture so
 * the observed branch runs the real A1/A4 cores end to end through `run()`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertInsightV3Mock = vi.fn();
const loadRootCauseContextMock = vi.fn();
const isFlagEnabledMock = vi.fn();
const logServerErrorMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ __fake: true }) }));
vi.mock('@/lib/coachhelm/v3/insights/upsert-v3', () => ({
  upsertInsightV3: (...args: unknown[]) => upsertInsightV3Mock(...args),
  V3_SIGNATURE_PREFIX: 'v3:',
  GATED_OUT: '__gated_out__',
}));
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({ loadStandingForMetric: vi.fn(async () => null) }));
vi.mock('@/lib/coachhelm/v3/counterfactual/compute', () => ({ computeCounterfactual: vi.fn(() => null) }));
vi.mock('@/lib/coachhelm/v3/counterfactual/baseline-loader', () => ({ loadPlayerScoringBaseline: vi.fn(async () => 72) }));
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({ loadPlayerCohort: vi.fn(async () => ({ gender: null })) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: (...a: unknown[]) => logServerErrorMock(...a) }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (...a: unknown[]) => isFlagEnabledMock(...a) }));
vi.mock('@/lib/coachhelm/v3/engine/root-cause-context', () => ({
  loadRootCauseContext: (...a: unknown[]) => loadRootCauseContextMock(...a),
}));

import { BaseGenerator, mergeDiagnosis, buildDiagnosis, ROOT_CAUSE_DIAGNOSIS_FLAG } from '@/lib/coachhelm/v3/engine/generator-base';
import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '@/lib/coachhelm/v3/engine/types';
import type { Diagnosis, InsightInput } from '@/lib/coachhelm/v2/insights/types';
import { establishedRosterComplete } from './fixtures/shadow-eval-snapshots';

interface Agg extends GeneratorAggregate {
  sampleN: number;
  playerValue: number;
}

class ApproachLikeGenerator extends BaseGenerator<Agg> {
  readonly name = 'root-cause-test';
  readonly metricId: MetricId = 'approach_proximity_50_125ft';
  readonly insightType = 'approach_miss';
  readonly category: InsightCategory = 'approach';
  readonly minSampleN = 5;
  protected override readonly requiresStanding = false;

  constructor(private readonly opts: { framing?: ComposedContent['framing']; value?: number; diagnosis?: Diagnosis } = {}) {
    super('player-1');
  }

  async aggregate(): Promise<Agg> {
    return { sampleN: 13, playerValue: this.opts.value ?? 20 };
  }

  composeContent(agg: Agg): ComposedContent {
    return {
      title: 'Greens hit from 50-125 yds',
      content: 'content',
      signature: 'approach_miss:50_125ft',
      priority: 'low',
      ...(this.opts.framing ? { framing: this.opts.framing } : {}),
      evidence: {
        metric: 'approach_proximity_50_125ft',
        metric_label: 'Greens hit from 50-125 yds',
        unit: 'percent',
        polarity: 'higher_better',
        your_value: agg.playerValue,
        your_value_display: `${agg.playerValue}%`,
        comparison_value: 80,
        comparison_label: 'PGA Tour (approx)',
        comparison_source: 'pga_baseline',
        sample_n: agg.sampleN,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0,
        confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
        ...(this.opts.diagnosis ? { diagnosis: this.opts.diagnosis } : {}),
      },
    };
  }
}

function written(): InsightInput {
  const call = upsertInsightV3Mock.mock.calls.at(-1);
  if (!call) throw new Error('no upsert');
  return call[1] as InsightInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  upsertInsightV3Mock.mockResolvedValue('row-1');
  isFlagEnabledMock.mockReturnValue(true);
  loadRootCauseContextMock.mockResolvedValue({
    facts: establishedRosterComplete.facts,
    holes: establishedRosterComplete.holes,
    scope: establishedRosterComplete.scope,
    windowLabel: '2026-05-01 to 2026-07-31',
  });
});

describe('BaseGenerator.run() — root cause', () => {
  it('a strength ships NO diagnosis and never loads shots', async () => {
    const res = await new ApproachLikeGenerator({ framing: 'strength' }).run();
    expect(res.status).toBe('generated');
    expect(written().evidence.diagnosis).toBeUndefined();
    expect('diagnosis' in written().evidence).toBe(false);
    expect(loadRootCauseContextMock).not.toHaveBeenCalled();
  });

  it('a value-derived strength (at/above the benchmark) also ships no diagnosis', async () => {
    await new ApproachLikeGenerator({ value: 85 }).run();
    expect(written().evidence.diagnosis).toBeUndefined();
  });

  it('a leak with a repeated recorded path ships an observed_sequence with count/denominator', async () => {
    await new ApproachLikeGenerator().run();
    const d = written().evidence.diagnosis!;
    expect(d.causality_level).toBe('observed_sequence');
    expect(d.basis?.sequence).toMatchObject({ occurrences: 10, of: 13 });
    expect(d.confidence_reason).toContain('13 observations');
    expect(ROOT_CAUSE_DIAGNOSIS_FLAG).toBe('coachhelm_root_cause_diagnosis');
    expect(isFlagEnabledMock).toHaveBeenCalledWith('coachhelm_root_cause_diagnosis');
    expect(isFlagEnabledMock).not.toHaveBeenCalledWith('coachhelm_a4_sequence_attribution_surface');
    expect(loadRootCauseContextMock).toHaveBeenCalledWith('player-1', expect.objectContaining({ window_days: 90 }));
  });

  it('flag off → the same leak ships an honest inferred_hypothesis', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    await new ApproachLikeGenerator().run();
    expect(written().evidence.diagnosis!.causality_level).toBe('inferred_hypothesis');
  });

  it('the Round Review surface flag off does not turn the diagnosis off (independent flags)', async () => {
    isFlagEnabledMock.mockImplementation((id: string) => id !== 'coachhelm_a4_sequence_attribution_surface');
    await new ApproachLikeGenerator().run();
    expect(written().evidence.diagnosis!.causality_level).toBe('observed_sequence');
  });

  it('the diagnosis flag off with the surface flag on still ships an inferred_hypothesis', async () => {
    isFlagEnabledMock.mockImplementation((id: string) => id !== 'coachhelm_root_cause_diagnosis');
    await new ApproachLikeGenerator().run();
    const d = written().evidence.diagnosis!;
    expect(d.causality_level).toBe('inferred_hypothesis');
    // Same checks listed; never the removed template sentence.
    expect(d.basis?.checked.length).toBeGreaterThan(0);
    expect(d.root_cause).not.toMatch(/off its benchmark/);
  });

  it('a shot-load failure degrades to a stated hypothesis and never fails the run', async () => {
    loadRootCauseContextMock.mockRejectedValue(new Error('db down'));
    const res = await new ApproachLikeGenerator().run();
    expect(res.status).toBe('generated');
    expect(written().evidence.diagnosis!.root_cause).toContain('could not be read');
    expect(logServerErrorMock).toHaveBeenCalled();
  });

  it('a generator-composed diagnosis can never claim observed_sequence itself', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    await new ApproachLikeGenerator({
      diagnosis: {
        symptom: 's',
        root_cause: 'generator reading',
        causality_level: 'observed_sequence',
        drivers: [],
        recommended_action: 'a',
        confidence_reason: 'x',
      },
    }).run();
    const d = written().evidence.diagnosis!;
    expect(d.causality_level).toBe('inferred_hypothesis');
    // The generator's sharper text survives; the checks are attached.
    expect(d.root_cause).toBe('generator reading');
    expect(d.basis?.checked.length).toBeGreaterThan(0);
  });
});

describe('mergeDiagnosis (pure)', () => {
  const base = buildDiagnosis('x', {
    metric: 'x',
    metric_label: 'X',
    unit: 'percent',
    your_value: 1,
    your_value_display: '1%',
    comparison_value: 2,
    comparison_label: 'Tour',
    sample_n: 5,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1 },
  });

  it('no root cause (strength) → undefined', () => {
    expect(mergeDiagnosis(base, undefined, null)).toBeUndefined();
  });

  it('an observed root cause keeps the generator drivers, deduped by metric', () => {
    const composed: Diagnosis = {
      ...base,
      drivers: [{ metric: 'approach_miss_short_share', value: 60, unit: 'percent', sample_n: 10, source: 's' }],
    };
    const merged = mergeDiagnosis(base, composed, {
      symptom: 's',
      root_cause: 'path — 5 of 10',
      causality_level: 'observed_sequence',
      drivers: [{ metric: 'sequence_pattern_share', value: 50, unit: 'percent', sample_n: 10, source: 's' }],
      recommended_action: 'a',
    })!;
    expect(merged.causality_level).toBe('observed_sequence');
    expect(merged.drivers.map((d) => d.metric)).toEqual(['sequence_pattern_share', 'approach_miss_short_share']);
    expect(merged.confidence_reason).toBe(base.confidence_reason);
  });
});
