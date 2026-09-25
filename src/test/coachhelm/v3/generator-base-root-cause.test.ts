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

import { BaseGenerator, mergeDiagnosis, buildDiagnosis, hasGeneratorSequenceEvidence, ROOT_CAUSE_DIAGNOSIS_FLAG } from '@/lib/coachhelm/v3/engine/generator-base';
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
    // The generator's sharper text survives (2026-09-25: led by the context
    // narrowing when its population gate passes); the checks are attached.
    expect(d.root_cause.endsWith('generator reading')).toBe(true);
    expect(d.root_cause).toMatch(/^Observed, not a cause: 13 of 13 approaches from 50–125 yd missed the green/);
    expect(d.basis?.narrowing?.subject).toBe('approach');
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

describe('mergeDiagnosis — generator-supplied sequence evidence', () => {
  const base = buildDiagnosis('x', {
    metric: 'x',
    metric_label: 'X',
    unit: 'count',
    your_value: 1,
    your_value_display: '1',
    comparison_value: 2,
    comparison_label: 'peers',
    sample_n: 50,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1 },
  });
  const hypothesis = {
    symptom: 's',
    root_cause: 'not traced',
    causality_level: 'inferred_hypothesis' as const,
    drivers: [{ metric: 'root_cause_driver', value: 1, unit: 'count' as const, sample_n: 1, source: 's' }],
    recommended_action: 'a',
  };
  const examples = [
    { round_id: 'r1', hole_number: 3 },
    { round_id: 'r2', hole_number: 7, hole_id: 'h-2-7' },
  ];
  const claim = (over: Partial<NonNullable<Diagnosis['basis']>['sequence']> = {}, level: Diagnosis['causality_level'] = 'observed_sequence'): Diagnosis => ({
    symptom: '3-putts above peers',
    root_cause: '14 of 25 classified 3-putts start from 35+ ft',
    causality_level: level,
    drivers: [{ metric: 'three_putt_chain', value: 3, unit: 'count', sample_n: 141, source: 'golf_shots' }],
    recommended_action: 'a',
    confidence_reason: '',
    basis: {
      kind: 'shot_sequence',
      checked: ['25 classified'],
      sequence: {
        pattern: 'first putt from 35+ ft → 2 more putts',
        occurrences: 14,
        of: 25,
        population: 'classified 3-putts',
        distinct_rounds: 6,
        window: '2026-01-01 – 2026-03-01',
        examples,
        ...over,
      },
    },
  });

  it('upgrades to observed_sequence when the generator supplies sequence evidence and the capability flag is on', () => {
    const merged = mergeDiagnosis(base, claim(), hypothesis, { generatorObservedEnabled: true })!;
    expect(merged.causality_level).toBe('observed_sequence');
    expect(merged.basis?.sequence?.examples).toEqual(examples);
    expect(merged.drivers.map((d) => d.metric)).toEqual(['three_putt_chain', 'root_cause_driver']);
    expect(merged.confidence_reason).toBe(base.confidence_reason);
  });

  it('without sequence evidence a generator claim is still forced to inferred_hypothesis', () => {
    const noBasis: Diagnosis = { ...claim(), basis: undefined };
    expect(mergeDiagnosis(base, noBasis, hypothesis, { generatorObservedEnabled: true })!.causality_level).toBe('inferred_hypothesis');
    const noExamples = claim({ examples: [] });
    expect(mergeDiagnosis(base, noExamples, hypothesis, { generatorObservedEnabled: true })!.causality_level).toBe('inferred_hypothesis');
    const aggregateBasis: Diagnosis = { ...claim(), basis: { kind: 'aggregate_only', checked: ['x'] } };
    expect(mergeDiagnosis(base, aggregateBasis, hypothesis, { generatorObservedEnabled: true })!.causality_level).toBe('inferred_hypothesis');
  });

  it('evidence below the shared floors does not upgrade (population, rounds, share, example cap)', () => {
    for (const over of [{ of: 9, occurrences: 5 }, { distinct_rounds: 2 }, { occurrences: 2 }, { occurrences: 5, of: 25 }, { examples: Array.from({ length: 6 }, (_, i) => ({ round_id: `r${i}`, hole_number: 1 })) }]) {
      expect(hasGeneratorSequenceEvidence(claim(over))).toBe(false);
      expect(mergeDiagnosis(base, claim(over), hypothesis, { generatorObservedEnabled: true })!.causality_level).toBe('inferred_hypothesis');
    }
  });

  it('stays inferred when the observed-sequence capability flag is off (the default)', () => {
    expect(mergeDiagnosis(base, claim(), hypothesis)!.causality_level).toBe('inferred_hypothesis');
    expect(mergeDiagnosis(base, claim(), hypothesis, { generatorObservedEnabled: false })!.causality_level).toBe('inferred_hypothesis');
  });

  it('a generator that asks for inferred_hypothesis is never upgraded', () => {
    expect(mergeDiagnosis(base, claim({}, 'inferred_hypothesis'), hypothesis, { generatorObservedEnabled: true })!.causality_level).toBe('inferred_hypothesis');
  });

  it('a strength row (no root cause) still gets no diagnosis', () => {
    expect(mergeDiagnosis(base, claim(), null, { generatorObservedEnabled: true })).toBeUndefined();
  });
});

/** A generator whose alias metric has no root-cause sequence target and
 *  which supplies its own sequence evidence (like ThreePuttChainGenerator). */
class SequenceClaimGenerator extends BaseGenerator<Agg> {
  readonly name = 'sequence-claim-test';
  readonly metricId: MetricId = 'sg_putting';
  readonly insightType = 'putting';
  readonly category: InsightCategory = 'putting';
  readonly minSampleN = 5;
  protected override readonly requiresStanding = false;

  constructor(private readonly withEvidence: boolean) {
    super('player-1');
  }

  async aggregate(): Promise<Agg> {
    return { sampleN: 141, playerValue: 3.1 };
  }

  composeContent(agg: Agg): ComposedContent {
    return {
      title: '3-putts',
      content: 'content',
      signature: 'three_putt_chain:all',
      priority: 'low',
      framing: 'leak',
      evidence: {
        metric: 'three_putt_chain',
        metric_label: '3-putts per 18 holes',
        unit: 'count',
        polarity: 'lower_better',
        your_value: agg.playerValue,
        your_value_display: '3.1 per round',
        comparison_value: 1.4,
        comparison_label: 'GolfHelm players',
        comparison_source: 'estimated_target',
        sample_n: agg.sampleN,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0,
        confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
        diagnosis: {
          symptom: '3-putts above peers',
          root_cause: 'first putt from 35+ ft → 3+ putts on the hole: 14 of 25 classified 3-putts over 6 rounds.',
          causality_level: 'observed_sequence',
          drivers: [{ metric: 'three_putt_chain', value: 3.1, unit: 'count', sample_n: 141, source: 'golf_shots' }],
          recommended_action: 'a',
          confidence_reason: '',
          ...(this.withEvidence
            ? {
                basis: {
                  kind: 'shot_sequence' as const,
                  checked: ['25 classified'],
                  sequence: {
                    pattern: 'first putt from 35+ ft → 3+ putts on the hole',
                    occurrences: 14,
                    of: 25,
                    population: 'classified 3-putts',
                    distinct_rounds: 6,
                    window: 'w',
                    examples: [{ round_id: 'r1', hole_number: 4 }],
                  },
                },
              }
            : {}),
        },
      },
    };
  }
}

describe('BaseGenerator.run() — generator-supplied sequence evidence', () => {
  it('ships observed_sequence when the generator supplies the evidence and the capability flag is on', async () => {
    await new SequenceClaimGenerator(true).run();
    const d = written().evidence.diagnosis!;
    expect(d.causality_level).toBe('observed_sequence');
    expect(d.basis?.sequence?.examples).toEqual([{ round_id: 'r1', hole_number: 4 }]);
  });

  it('the same claim without evidence ships as inferred_hypothesis', async () => {
    await new SequenceClaimGenerator(false).run();
    expect(written().evidence.diagnosis!.causality_level).toBe('inferred_hypothesis');
  });

  it('capability flag off → inferred_hypothesis even with evidence', async () => {
    isFlagEnabledMock.mockImplementation((id: string) => id !== ROOT_CAUSE_DIAGNOSIS_FLAG);
    await new SequenceClaimGenerator(true).run();
    expect(written().evidence.diagnosis!.causality_level).toBe('inferred_hypothesis');
  });
});
