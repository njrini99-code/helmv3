/**
 * `BaseGenerator.run()` × root-cause wiring (PR #2073, ported for CoachHelm
 * supercharge Slice 2). The DB boundary is mocked; the shot context comes
 * from the A10 established-roster fixture so the counted branch runs the real
 * A1/A4 cores end to end through `run()`. With
 * `coachhelm_root_cause_diagnosis` off the row is written exactly as before
 * (the template diagnosis); on, the cause state decides it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertInsightV3Mock = vi.fn();
const loadRootCauseContextMock = vi.fn();
const isFlagEnabledMock = vi.fn();
const logServerErrorMock = vi.fn();
const logServerEventMock = vi.fn();

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
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...a: unknown[]) => logServerErrorMock(...a),
  logServerEvent: (...a: unknown[]) => logServerEventMock(...a),
}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (...a: unknown[]) => isFlagEnabledMock(...a) }));
vi.mock('@/lib/coachhelm/v3/engine/root-cause-context', () => ({
  loadRootCauseContext: (...a: unknown[]) => loadRootCauseContextMock(...a),
}));

import {
  BaseGenerator,
  mergeRootCauseDiagnosis,
  buildDiagnosis,
  ROOT_CAUSE_DIAGNOSIS_FLAG,
} from '@/lib/coachhelm/v3/engine/generator-base';
import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '@/lib/coachhelm/v3/engine/types';
import type { Diagnosis, InsightInput } from '@/lib/coachhelm/v2/insights/types';
import { establishedRosterComplete } from '@/test/coachhelm/v3/fixtures/shadow-eval-snapshots';

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

  constructor(private readonly opts: { framing?: ComposedContent['framing']; value?: number; diagnosis?: Diagnosis; coach?: ComposedContent['coach'] } = {}) {
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
      ...(this.opts.coach ? { coach: this.opts.coach } : {}),
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

describe('BaseGenerator.run() — coach voice', () => {
  it('stores the coach copy in evidence and leaves title/content in the player voice', async () => {
    const coach = { title: 'Greens from 50-125 yds', content: 'The player misses short.' };
    await new ApproachLikeGenerator({ coach }).run();
    expect(written().title).toBe('Greens hit from 50-125 yds');
    expect(written().content).toBe('content');
    expect(written().evidence.coach_copy).toEqual(coach);
  });

  it('does not store a coach copy whose numbers differ, or that says "you", and logs why', async () => {
    logServerEventMock.mockClear();
    await new ApproachLikeGenerator({ coach: { title: 'Greens from 50-150 yds', content: 'You miss short.' } }).run();
    expect('coach_copy' in written().evidence).toBe(false);
    expect(written().content).toBe('content');
    const calls = (logServerEventMock.mock.calls as Array<[string, { action: string; metadata: { issues: string[] } }]>)
      .filter(([, ctx]) => ctx.action.endsWith('.coach_copy'));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1].metadata.issues).toEqual(["title: numbers differ from the player's copy", 'content: second person']);
  });

  it('writes no coach_copy key when the generator has none', async () => {
    await new ApproachLikeGenerator().run();
    expect('coach_copy' in written().evidence).toBe(false);
  });
});

const TEMPLATE = /off its benchmark|inferred from the aggregate/;

describe('BaseGenerator.run() — flag off (the default on main)', () => {
  it('writes exactly the pre-Slice-2 template diagnosis, no cause, and never loads shots', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    await new ApproachLikeGenerator().run();
    const ev = written().evidence;
    const d = ev.diagnosis!;
    expect(d.root_cause).toBe(
      'Greens hit from 50-125 yds is off its benchmark. Likely cause inferred from the aggregate, not a measured shot sequence',
    );
    expect(d.causality_level).toBe('inferred_hypothesis');
    expect(d.recommended_action).toBe('Target greens hit from 50-125 yds in the next practice block');
    expect('basis' in d).toBe(false);
    expect('cause' in ev).toBe(false);
    expect('data_gap' in ev).toBe(false);
    expect(loadRootCauseContextMock).not.toHaveBeenCalled();
    expect(isFlagEnabledMock).toHaveBeenCalledWith('coachhelm_root_cause_diagnosis');
  });

  it('a strength row still carries the template diagnosis (unchanged), and a composed one keeps its text', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    await new ApproachLikeGenerator({ framing: 'strength' }).run();
    expect(written().evidence.diagnosis!.root_cause).toMatch(TEMPLATE);
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
    expect(written().evidence.diagnosis).toMatchObject({
      root_cause: 'generator reading',
      causality_level: 'inferred_hypothesis',
    });
  });
});

describe('BaseGenerator.run() — root cause (flag on)', () => {
  it('a strength ships NO diagnosis and no cause, and never loads shots', async () => {
    const res = await new ApproachLikeGenerator({ framing: 'strength' }).run();
    expect(res.status).toBe('generated');
    expect('diagnosis' in written().evidence).toBe(false);
    expect('cause' in written().evidence).toBe(false);
    expect(loadRootCauseContextMock).not.toHaveBeenCalled();
  });

  it('a value-derived strength (at/above the benchmark) also ships no diagnosis', async () => {
    await new ApproachLikeGenerator({ value: 85 }).run();
    expect(written().evidence.diagnosis).toBeUndefined();
  });

  it('a leak with a repeated recorded path ships the counted cause with count/denominator', async () => {
    await new ApproachLikeGenerator().run();
    const ev = written().evidence;
    const d = ev.diagnosis!;
    expect(d.causality_level).toBe('observed_sequence');
    expect(d.basis?.sequence).toMatchObject({ occurrences: 10, of: 13 });
    expect(d.root_cause).not.toMatch(TEMPLATE);
    expect(d.confidence_reason).toContain('13 observations');
    expect(ev.cause).toMatchObject({ state: 'observed_sequence', occurrences: 10, denominator: 13 });
    expect('data_gap' in ev).toBe(false);
    expect(ROOT_CAUSE_DIAGNOSIS_FLAG).toBe('coachhelm_root_cause_diagnosis');
    expect(isFlagEnabledMock).not.toHaveBeenCalledWith('coachhelm_a4_sequence_attribution_surface');
    expect(loadRootCauseContextMock).toHaveBeenCalledWith('player-1', expect.objectContaining({ window_days: 90 }));
  });

  it('the Round Review surface flag off does not turn the root cause off (independent flags)', async () => {
    isFlagEnabledMock.mockImplementation((id: string) => id !== 'coachhelm_a4_sequence_attribution_surface');
    await new ApproachLikeGenerator().run();
    expect(written().evidence.diagnosis!.causality_level).toBe('observed_sequence');
  });

  it('a row with no stamped window is not traced, and says so', async () => {
    loadRootCauseContextMock.mockResolvedValue(null);
    await new ApproachLikeGenerator().run();
    const ev = written().evidence;
    expect(ev.cause).toMatchObject({ state: 'not_traced', not_traced_reason: 'no_window' });
    expect(ev.diagnosis!.root_cause).toBe(
      'Not traced: this read has no stamped window, so no shot sequence was checked.',
    );
  });

  it('a shot-load failure becomes a stated not-traced cause and never fails the run', async () => {
    loadRootCauseContextMock.mockRejectedValue(new Error('db down'));
    const res = await new ApproachLikeGenerator().run();
    expect(res.status).toBe('generated');
    expect(written().evidence.diagnosis!.root_cause).toContain('could not be read');
    expect(written().evidence.cause).toMatchObject({ state: 'not_traced', not_traced_reason: 'load_failed' });
    expect(logServerErrorMock).toHaveBeenCalled();
  });

  it('a generator-composed diagnosis never claims observed_sequence and never keeps its own cause sentence', async () => {
    await new SequenceClaimGenerator().run();
    const ev = written().evidence;
    const d = ev.diagnosis!;
    // sg_putting has no shot-sequence target: the cause state is not traced.
    expect(d.causality_level).toBe('inferred_hypothesis');
    expect(ev.cause).toMatchObject({ state: 'not_traced', not_traced_reason: 'no_shot_path' });
    expect(d.root_cause).toBe('Not traced: no recorded shot path measures 3-putts per 18 holes.');
    // The generator's own drivers and symptom are kept.
    expect(d.symptom).toBe('3-putts above peers');
    expect(d.drivers.map((x) => x.metric)).toContain('three_putt_chain');
    expect(loadRootCauseContextMock).not.toHaveBeenCalled();
  });
});

describe('mergeRootCauseDiagnosis (pure)', () => {
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
  const composed: Diagnosis = {
    ...base,
    symptom: 'composed symptom',
    root_cause: 'The record does not say why.',
    recommended_action: 'composed action',
    drivers: [
      { metric: 'approach_miss_short_share', value: 60, unit: 'percent', sample_n: 10, source: 's' },
      { metric: 'sequence_pattern_share', value: 1, unit: 'percent', sample_n: 1, source: 'dup' },
    ],
  };
  const rooted = (level: Diagnosis['causality_level']) => ({
    symptom: 'rc symptom',
    root_cause: 'path — 5 of 10',
    causality_level: level,
    drivers: [{ metric: 'sequence_pattern_share', value: 50, unit: 'percent' as const, sample_n: 10, source: 's' }],
    recommended_action: 'rc action',
  });

  it('counted: the cause owns sentence, level and action; generator drivers are appended, deduped by metric', () => {
    const merged = mergeRootCauseDiagnosis(base, composed, rooted('observed_sequence'), { state: 'observed_sequence' });
    expect(merged.root_cause).toBe('path — 5 of 10');
    expect(merged.causality_level).toBe('observed_sequence');
    expect(merged.recommended_action).toBe('rc action');
    expect(merged.symptom).toBe('composed symptom');
    expect(merged.drivers.map((d) => d.metric)).toEqual(['sequence_pattern_share', 'approach_miss_short_share']);
    expect(merged.confidence_reason).toBe(base.confidence_reason);
  });

  it('likely / not traced: the generator keeps its data-grounded action; a data gap names its own', () => {
    const likely = mergeRootCauseDiagnosis(base, composed, rooted('inferred_hypothesis'), {
      state: 'inferred_hypothesis',
    });
    expect(likely.recommended_action).toBe('composed action');
    const countDown = mergeRootCauseDiagnosis(base, composed, rooted('inferred_hypothesis'), {
      state: 'not_traced',
      not_traced_reason: 'count_down',
    });
    expect(countDown.recommended_action).toBe('composed action');
    const gap = mergeRootCauseDiagnosis(base, composed, rooted('inferred_hypothesis'), {
      state: 'not_traced',
      not_traced_reason: 'data_gap',
    });
    expect(gap.recommended_action).toBe('rc action');
    const noComposed = mergeRootCauseDiagnosis(base, undefined, rooted('inferred_hypothesis'), {
      state: 'not_traced',
      not_traced_reason: 'count_down',
    });
    expect(noComposed.recommended_action).toBe(base.recommended_action);
    expect(noComposed.symptom).toBe('rc symptom');
    expect(noComposed.root_cause).not.toMatch(TEMPLATE);
  });
});

/** A generator whose alias metric has no root-cause sequence target and
 *  which composes its own observed_sequence claim (like PR #2073's
 *  ThreePuttChainGenerator, not ported). */
class SequenceClaimGenerator extends BaseGenerator<Agg> {
  readonly name = 'sequence-claim-test';
  readonly metricId: MetricId = 'sg_putting';
  readonly insightType = 'putting';
  readonly category: InsightCategory = 'putting';
  readonly minSampleN = 5;
  protected override readonly requiresStanding = false;

  constructor() {
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
        },
      },
    };
  }
}
