/**
 * TS2 (silent-regression gap, §8 of COACHHELM_FULL_VALIDITY_AND_FACET_AUDIT_2026-06-06):
 * the existing generator-base.test.ts only exercises the three PURE helpers
 * (backfilledStrokesImpact / leveragePriorityFloor / computeMeasuredFactors).
 * The full `run()` lifecycle — gating ORDER, confidence injection, the
 * requiresStanding skip, and the counterfactual/standing injection branch — was
 * never covered, so a regression in run()'s orchestration would ship green.
 *
 * These tests instantiate a concrete BaseGenerator subclass and mock the DB
 * boundary modules (admin client, standing loader, counterfactual, baseline,
 * upsert) so the orchestration is observed end-to-end without a live DB.
 *
 * Asserted contract (from generator-base.ts header + design contract Rule 1):
 *   1. isEnabled() runs FIRST and short-circuits before aggregate() (gated:true).
 *   2. aggregate() === null → gated:false, no further work.
 *   3. aggregate.sampleN < minSampleN → gated:false, no standing/upsert.
 *   4. requiresStanding && no standing → gated:false, no upsert (cold-start).
 *   5. confidence is RE-COMPUTED via calcConfidence (never the generator's 0).
 *   6. requiresStanding=false → upsert WITHOUT standing/counterfactual.
 *   7. requiresStanding=true happy path → standing + counterfactual injected,
 *      strokes_impact backfilled, priority floored, engine writes the row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock the DB boundary BEFORE importing the SUT ------------------------
const upsertInsightV3Mock = vi.fn();
const loadStandingForMetricMock = vi.fn();
const computeCounterfactualMock = vi.fn();
const loadPlayerScoringBaselineMock = vi.fn();
const logServerErrorMock = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ __fake: true }),
}));

vi.mock('@/lib/coachhelm/v3/insights/upsert-v3', () => ({
  upsertInsightV3: (...args: unknown[]) => upsertInsightV3Mock(...args),
  V3_SIGNATURE_PREFIX: 'v3:',
  GATED_OUT: '__gated_out__',
}));

vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({
  loadStandingForMetric: (...args: unknown[]) => loadStandingForMetricMock(...args),
}));

vi.mock('@/lib/coachhelm/v3/counterfactual/compute', () => ({
  computeCounterfactual: (...args: unknown[]) => computeCounterfactualMock(...args),
}));

vi.mock('@/lib/coachhelm/v3/counterfactual/baseline-loader', () => ({
  loadPlayerScoringBaseline: (...args: unknown[]) => loadPlayerScoringBaselineMock(...args),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerErrorMock(...args),
}));

// SUT + types — imported after the mocks are registered.
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  InsightPriority,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';
import type { InsightInput } from '@/lib/coachhelm/v2/insights/types';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { CounterfactualProjection } from '@/lib/coachhelm/v3/counterfactual/types';

// --------------------------------------------------------------------------
// A minimal concrete generator used as the test subject. It records the call
// ORDER of its lifecycle hooks so we can assert gating short-circuits.
// --------------------------------------------------------------------------

interface TestAgg extends GeneratorAggregate {
  sampleN: number;
  playerValue: number;
}

const callLog: string[] = [];

class TestGenerator extends BaseGenerator<TestAgg> {
  readonly name = 'test-generator';
  // sg_putting is a real registry id with a METRIC_RENDER_CONFIG entry, so the
  // counterfactual branch (which looks up cfg = METRIC_RENDER_CONFIG[metricId])
  // exercises the real config path.
  readonly metricId: MetricId = 'sg_putting';
  readonly insightType = 'test_type';
  readonly category: InsightCategory = 'putting';
  readonly minSampleN = 5;

  constructor(
    playerId: string,
    private readonly opts: {
      enabled?: boolean;
      agg?: TestAgg | null;
      requiresStanding?: boolean;
      priority?: InsightPriority;
    } = {},
  ) {
    super(playerId);
    // requiresStanding is `protected readonly` with a class default; override
    // per-test via the constructor for the diagnostic-generator path.
    if (opts.requiresStanding !== undefined) {
      (this as unknown as { requiresStanding: boolean }).requiresStanding =
        opts.requiresStanding;
    }
  }

  protected override async isEnabled(): Promise<boolean> {
    callLog.push('isEnabled');
    return this.opts.enabled ?? true;
  }

  async aggregate(): Promise<TestAgg | null> {
    callLog.push('aggregate');
    return this.opts.agg === undefined
      ? { sampleN: 10, playerValue: -1.0 }
      : this.opts.agg;
  }

  composeContent(agg: TestAgg): ComposedContent {
    callLog.push('composeContent');
    return {
      title: 'Test insight',
      content: 'Test content',
      signature: `test:${agg.playerValue}`,
      priority: this.opts.priority ?? 'low',
      evidence: {
        metric: this.metricId,
        metric_label: 'SG: Putting',
        unit: 'strokes',
        your_value: agg.playerValue,
        your_value_display: String(agg.playerValue),
        comparison_value: 0,
        comparison_label: 'Field average',
        comparison_source: 'pga_baseline',
        sample_n: agg.sampleN,
        window_days: 30,
        window_start: '2026-05-07',
        window_end: '2026-06-06',
        // Generators hard-code 0; run() must backfill from the counterfactual.
        strokes_impact: 0,
        strokes_impact_method: 'rough_estimate',
        // Generators stamp confidence 0; run() must overwrite via calcConfidence.
        confidence: 0,
        confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
      },
    };
  }
}

function fakeStanding(over: Partial<PlayerStanding> = {}): PlayerStanding {
  return {
    player_id: 'player-1',
    metric_id: 'sg_putting',
    player_value: -1.0,
    team_avg: null,
    team_n: 0,
    team_pct: null,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 0,
    pga_delta: -1.0,
    computed_at: '2026-06-06T00:00:00Z',
    ...over,
  };
}

function fakeCf(over: Partial<CounterfactualProjection> = {}): CounterfactualProjection {
  return {
    current_baseline_score: 75,
    projected_score_if_closed: 73.8,
    strokes_saved_per_round: 1.2,
    weeks_to_typical_close: 6,
    suppressed: false,
    ...over,
  };
}

/** Second arg (the InsightInput) of the most recent upsertInsightV3 call. */
function lastUpsertInput(): InsightInput {
  const calls = upsertInsightV3Mock.mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('upsertInsightV3 was not called');
  return last[1] as InsightInput;
}

/** First arg (the message) of the most recent logServerError call. */
function lastLogMessage(): string {
  const calls = logServerErrorMock.mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('logServerError was not called');
  return String(last[0]);
}

describe('BaseGenerator.run() lifecycle (TS2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callLog.length = 0;
    upsertInsightV3Mock.mockResolvedValue('row-id-1');
    loadStandingForMetricMock.mockResolvedValue(fakeStanding());
    computeCounterfactualMock.mockReturnValue(fakeCf());
    loadPlayerScoringBaselineMock.mockResolvedValue(75);
  });

  it('isEnabled() gates FIRST and skips aggregate() when disabled (gated:true)', async () => {
    const gen = new TestGenerator('player-1', { enabled: false });
    const res = await gen.run();

    // Toggle-off now sweeps the scope (regrade NEW-P3); TestGenerator has no
    // scope so the sweep is a 0-count no-op, but the field is reported.
    expect(res).toEqual({ id: null, gated: true, retracted: 0 });
    // Order proof: isEnabled ran, aggregate did NOT.
    expect(callLog).toEqual(['isEnabled']);
    expect(loadStandingForMetricMock).not.toHaveBeenCalled();
    expect(upsertInsightV3Mock).not.toHaveBeenCalled();
  });

  it('returns gated:false and writes nothing when aggregate() is null', async () => {
    const gen = new TestGenerator('player-1', { agg: null });
    const res = await gen.run();

    // retracted:0 — the stale-scope sweep ran on this dequalify exit, but the
    // TestGenerator declares no signatureScope (see generator-base-retraction
    // tests for the scoped behavior).
    expect(res).toEqual({ id: null, gated: false, retracted: 0 });
    expect(callLog).toEqual(['isEnabled', 'aggregate']);
    expect(loadStandingForMetricMock).not.toHaveBeenCalled();
    expect(upsertInsightV3Mock).not.toHaveBeenCalled();
  });

  it('applies the min-sample-N gate before loading standing or composing', async () => {
    const gen = new TestGenerator('player-1', {
      agg: { sampleN: 4, playerValue: -1.0 }, // 4 < minSampleN(5)
    });
    const res = await gen.run();

    expect(res).toEqual({ id: null, gated: false, retracted: 0 });
    expect(callLog).toEqual(['isEnabled', 'aggregate']);
    expect(callLog).not.toContain('composeContent');
    expect(loadStandingForMetricMock).not.toHaveBeenCalled();
    expect(upsertInsightV3Mock).not.toHaveBeenCalled();
  });

  it('skips the insight when requiresStanding && no standing exists (cold-start)', async () => {
    loadStandingForMetricMock.mockResolvedValue(null);
    const gen = new TestGenerator('player-1', { requiresStanding: true });
    const res = await gen.run();

    expect(res).toEqual({ id: null, gated: false });
    // standing was looked up, but compose/upsert never ran.
    expect(loadStandingForMetricMock).toHaveBeenCalledWith('player-1', 'sg_putting');
    expect(callLog).not.toContain('composeContent');
    expect(upsertInsightV3Mock).not.toHaveBeenCalled();
  });

  it('requiresStanding=false → upserts a diagnostic row WITHOUT standing/counterfactual', async () => {
    const gen = new TestGenerator('player-1', { requiresStanding: false });
    const res = await gen.run();

    expect(res).toEqual({ id: 'row-id-1', gated: false, retracted: 0 });
    // Diagnostic path never touches the standing loader or the counterfactual.
    expect(loadStandingForMetricMock).not.toHaveBeenCalled();
    expect(computeCounterfactualMock).not.toHaveBeenCalled();

    const input = lastUpsertInput();
    expect(input.evidence).not.toHaveProperty('standing');
    expect(input.evidence).not.toHaveProperty('counterfactual');
    // strokes_impact stays the generator's composed value (no cf to backfill).
    expect(input.evidence.strokes_impact).toBe(0);
  });

  it('re-computes confidence via calcConfidence (never ships the generator 0)', async () => {
    const gen = new TestGenerator('player-1', { requiresStanding: false });
    await gen.run();

    const input = lastUpsertInput();
    // factors_measured=false is stamped (no dispersion), recency=1 →
    // calcConfidence returns max(0,min(1,sample_adequacy)) = 1, not 0.
    expect(input.evidence.confidence).toBe(1);
    expect(input.evidence.confidence).not.toBe(0);
    expect(input.evidence.confidence_factors.factors_measured).toBe(false);
  });

  it('happy path: injects standing + counterfactual, backfills strokes_impact, floors priority', async () => {
    // Counterfactual worth 1.2/rd → backfill strokes_impact and floor a
    // descriptive low priority up to high.
    computeCounterfactualMock.mockReturnValue(fakeCf({ strokes_saved_per_round: 1.2 }));
    const gen = new TestGenerator('player-1', {
      requiresStanding: true,
      priority: 'low',
    });
    const res = await gen.run();

    expect(res).toEqual({ id: 'row-id-1', gated: false, retracted: 0 });
    expect(callLog).toEqual(['isEnabled', 'aggregate', 'composeContent']);

    const input = lastUpsertInput();
    const ev = input.evidence as InsightInput['evidence'] & {
      standing?: unknown;
      counterfactual?: CounterfactualProjection | null;
    };
    expect(ev.standing).toBeDefined();
    expect(ev.counterfactual).toMatchObject({ strokes_saved_per_round: 1.2 });
    // Backfilled from the counterfactual (generator stamped 0).
    expect(ev.strokes_impact).toBe(1.2);
    // Upgrade-only leverage floor: low → high at >= 1.0 strokes/rd.
    expect(input.priority).toBe('high');
    // Signature carries the v3 prefix.
    expect(input.signature.startsWith('v3:')).toBe(true);
  });

  it('a suppressed counterfactual leaves strokes_impact + priority untouched', async () => {
    computeCounterfactualMock.mockReturnValue(
      fakeCf({ suppressed: true, strokes_saved_per_round: 1.2 }),
    );
    const gen = new TestGenerator('player-1', {
      requiresStanding: true,
      priority: 'low',
    });
    await gen.run();

    const input = lastUpsertInput();
    expect(input.evidence.strokes_impact).toBe(0); // composed value kept
    expect(input.priority).toBe('low'); // no floor applied
  });

  it('returns gated:true when the upsert is suppressed by the philosophy gate', async () => {
    upsertInsightV3Mock.mockResolvedValue('__gated_out__');
    const gen = new TestGenerator('player-1', { requiresStanding: false });
    const res = await gen.run();

    expect(res).toEqual({ id: null, gated: true });
  });

  it('swallows a thrown error, logs it, and returns gated:false (cron stays alive)', async () => {
    upsertInsightV3Mock.mockRejectedValue(new Error('db exploded'));
    const gen = new TestGenerator('player-1', { requiresStanding: false });
    const res = await gen.run();

    expect(res).toEqual({ id: null, gated: false });
    expect(logServerErrorMock).toHaveBeenCalledTimes(1);
    expect(lastLogMessage()).toContain('test-generator run() failed');
  });
});
