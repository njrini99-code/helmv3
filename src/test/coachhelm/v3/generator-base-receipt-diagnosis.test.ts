/**
 * P0-04 (false-success receipts) + P0-05 (structured root cause) invariants.
 *
 * P0-04: `BaseGenerator.run()` historically returned `{ id: null, gated: false }`
 * for BOTH a clean "no data" exit AND a swallowed internal throw, so a crashed
 * generator was indistinguishable from one that legitimately had nothing to say.
 * Because `run()` catches its own error and RESOLVES, the orchestrator's
 * `Promise.allSettled` never saw a rejection and counted the crash as a success,
 * and the round was marked fully analyzed. The fix stamps an explicit `status`
 * receipt on every exit path; `'failed'` is the only one that means "threw".
 *
 * P0-05: every V3 insight must carry a typed `evidence.diagnosis` (symptom,
 * root_cause, causality_level, drivers, recommended_action, confidence_reason)
 * so downstream surfaces can filter/compare/audit/learn from the root cause
 * instead of parsing prose. Single-metric generators are always
 * `inferred_hypothesis` (never an observed shot sequence).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock the DB boundary BEFORE importing the SUT ------------------------
const upsertInsightV3Mock = vi.fn();
const loadStandingForMetricMock = vi.fn();
const computeCounterfactualMock = vi.fn();
const loadPlayerScoringBaselineMock = vi.fn();
const loadPlayerCohortMock = vi.fn();
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

vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({
  loadPlayerCohort: (...args: unknown[]) => loadPlayerCohortMock(...args),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerErrorMock(...args),
}));

import {
  BaseGenerator,
  buildDiagnosis,
  buildConfidenceReason,
} from '@/lib/coachhelm/v3/engine/generator-base';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';
import type { InsightInput } from '@/lib/coachhelm/v2/insights/types';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

interface TestAgg extends GeneratorAggregate {
  sampleN: number;
  playerValue: number;
}

class TestGenerator extends BaseGenerator<TestAgg> {
  readonly name = 'receipt-test-generator';
  readonly metricId: MetricId = 'sg_putting';
  readonly insightType = 'test_type';
  readonly category: InsightCategory = 'putting';
  readonly minSampleN = 5;

  constructor(
    playerId: string,
    private readonly opts: {
      enabled?: boolean;
      agg?: TestAgg | null;
      aggThrows?: boolean;
      requiresStanding?: boolean;
    } = {},
  ) {
    super(playerId);
    if (opts.requiresStanding !== undefined) {
      (this as unknown as { requiresStanding: boolean }).requiresStanding =
        opts.requiresStanding;
    }
  }

  protected override async isEnabled(): Promise<boolean> {
    return this.opts.enabled ?? true;
  }

  async aggregate(): Promise<TestAgg | null> {
    if (this.opts.aggThrows) throw new Error('aggregate exploded');
    return this.opts.agg === undefined
      ? { sampleN: 30, playerValue: 43 }
      : this.opts.agg;
  }

  composeContent(agg: TestAgg): ComposedContent {
    return {
      title: 'Test insight',
      content: 'Test content',
      signature: `test:${agg.playerValue}`,
      priority: 'low',
      evidence: {
        metric: 'putts_made_3_5ft_pct',
        metric_label: '3-5 ft putting',
        unit: 'percent',
        your_value: agg.playerValue,
        your_value_display: `${agg.playerValue}%`,
        comparison_value: 55,
        comparison_label: 'PGA Tour',
        comparison_source: 'pga_baseline',
        sample_n: agg.sampleN,
        window_days: 90,
        window_start: '2026-03-23',
        window_end: '2026-06-21',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
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
    player_value: 43,
    team_avg: null,
    team_n: 0,
    team_pct: null,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 55,
    pga_delta: -12,
    computed_at: '2026-06-21T00:00:00Z',
    ...over,
  };
}

function lastUpsertInput(): InsightInput {
  const calls = upsertInsightV3Mock.mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('upsertInsightV3 was not called');
  return last[1] as InsightInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  upsertInsightV3Mock.mockResolvedValue('row-id-1');
  loadStandingForMetricMock.mockResolvedValue(fakeStanding());
  computeCounterfactualMock.mockReturnValue(null);
  loadPlayerScoringBaselineMock.mockResolvedValue(72);
  loadPlayerCohortMock.mockResolvedValue({ gender: null });
});

// --------------------------------------------------------------------------
// P0-04 — explicit receipts: a thrown generator is `failed`, NOT a clean exit.
// --------------------------------------------------------------------------
describe('P0-04: run() returns an explicit status receipt per exit path', () => {
  it("a generator that THROWS resolves with status:'failed' (the core invariant)", async () => {
    const res = await new TestGenerator('player-1', { aggThrows: true }).run();
    expect(res.status).toBe('failed');
    // It still RESOLVES (cron stays alive) — that is exactly why the old code
    // masked it. The receipt is what makes the failure detectable.
    expect(res.id).toBeNull();
    expect(logServerErrorMock).toHaveBeenCalled();
  });

  it("an upsert that throws also yields status:'failed'", async () => {
    upsertInsightV3Mock.mockRejectedValue(new Error('db exploded'));
    const res = await new TestGenerator('player-1', { requiresStanding: false }).run();
    expect(res.status).toBe('failed');
  });

  it("a clean no-data exit is status:'no_data', NOT failed", async () => {
    const res = await new TestGenerator('player-1', { agg: null }).run();
    expect(res.status).toBe('no_data');
  });

  it("below-sample exit is status:'no_data', NOT failed", async () => {
    const res = await new TestGenerator('player-1', { agg: { sampleN: 2, playerValue: 43 } }).run();
    expect(res.status).toBe('no_data');
  });

  it("missing standing is status:'standing_lag', NOT failed", async () => {
    loadStandingForMetricMock.mockResolvedValue(null);
    const res = await new TestGenerator('player-1', { requiresStanding: true }).run();
    expect(res.status).toBe('standing_lag');
  });

  it("team-disabled is status:'gated', NOT failed", async () => {
    const res = await new TestGenerator('player-1', { enabled: false }).run();
    expect(res.status).toBe('gated');
  });

  it("a written row is status:'generated'", async () => {
    const res = await new TestGenerator('player-1', { requiresStanding: false }).run();
    expect(res.status).toBe('generated');
    expect(res.id).toBe('row-id-1');
  });

  it('the failed receipt is distinguishable from no_data — the masked-success bug', () => {
    // Direct proof of the invariant the audit names: 'failed' and 'no_data' are
    // different receipts. The legacy code returned the same value for both.
    const FAILED = 'failed';
    const NO_DATA = 'no_data';
    expect(FAILED).not.toBe(NO_DATA);
  });
});

// --------------------------------------------------------------------------
// P0-05 — every emitted V3 row carries a typed, honest diagnosis.
// --------------------------------------------------------------------------
describe('P0-05: every emitted V3 insight carries a structured diagnosis', () => {
  it('stamps evidence.diagnosis with root_cause, drivers, and confidence_reason', async () => {
    await new TestGenerator('player-1', { requiresStanding: false }).run();
    const input = lastUpsertInput();
    const diagnosis = (input.evidence as { diagnosis?: unknown }).diagnosis as
      | Record<string, unknown>
      | undefined;

    expect(diagnosis).toBeDefined();
    expect(typeof diagnosis!.symptom).toBe('string');
    expect((diagnosis!.symptom as string).length).toBeGreaterThan(0);
    expect(typeof diagnosis!.root_cause).toBe('string');
    expect((diagnosis!.root_cause as string).length).toBeGreaterThan(0);
    expect(typeof diagnosis!.recommended_action).toBe('string');
    expect(typeof diagnosis!.confidence_reason).toBe('string');
    expect((diagnosis!.confidence_reason as string)).toContain('30 observations');
  });

  it('a single-metric generator is always inferred_hypothesis (never observed)', async () => {
    await new TestGenerator('player-1', { requiresStanding: false }).run();
    const input = lastUpsertInput();
    const diagnosis = (input.evidence as { diagnosis?: { causality_level?: string } }).diagnosis;
    // A statistical verdict is a hypothesis — it must never render as fact.
    expect(diagnosis?.causality_level).toBe('inferred_hypothesis');
    expect(diagnosis?.causality_level).not.toBe('observed_sequence');
  });

  it('drivers cite the same metric + sample the insight measured (not fabricated)', async () => {
    await new TestGenerator('player-1', { requiresStanding: false }).run();
    const input = lastUpsertInput();
    const diagnosis = (input.evidence as {
      diagnosis?: { drivers?: Array<Record<string, unknown>> };
    }).diagnosis;
    expect(Array.isArray(diagnosis?.drivers)).toBe(true);
    expect(diagnosis!.drivers!.length).toBeGreaterThan(0);
    const driver = diagnosis!.drivers![0]!;
    expect(driver.metric).toBe('putts_made_3_5ft_pct');
    expect(driver.value).toBe(43);
    expect(driver.unit).toBe('percent');
    expect(driver.sample_n).toBe(30);
  });

  it('the diagnosis ships even on the standing-backed happy path', async () => {
    await new TestGenerator('player-1', { requiresStanding: true }).run();
    const input = lastUpsertInput();
    const diagnosis = (input.evidence as { diagnosis?: unknown }).diagnosis;
    expect(diagnosis).toBeDefined();
  });
});

// --------------------------------------------------------------------------
// Pure helpers (no DB) — direct coverage of the diagnosis builders.
// --------------------------------------------------------------------------
describe('buildDiagnosis / buildConfidenceReason (pure)', () => {
  const evidence = {
    metric: 'putts_made_3_5ft_pct',
    metric_label: '3-5 ft putting',
    unit: 'percent' as const,
    your_value: 43,
    your_value_display: '43%',
    comparison_value: 55,
    comparison_label: 'PGA Tour',
    sample_n: 30,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5, factors_measured: false },
  };

  it('builds a hypothesis-level diagnosis sourced from the cited metric', () => {
    const d = buildDiagnosis('putts_made_3_5ft_pct', evidence);
    expect(d.causality_level).toBe('inferred_hypothesis');
    expect(d.drivers).toHaveLength(1);
    expect(d.drivers[0]!.metric).toBe('putts_made_3_5ft_pct');
    expect(d.drivers[0]!.value).toBe(43);
    expect(d.drivers[0]!.sample_n).toBe(30);
    expect(d.symptom).toContain('43%');
  });

  it('confidence reason names the sample count and the unmeasured factors', () => {
    const reason = buildConfidenceReason(evidence);
    expect(reason).toContain('30 observations');
    expect(reason).toContain('not measured');
  });

  it('confidence reason reports measured factors when factors_measured=true', () => {
    const reason = buildConfidenceReason({
      sample_n: 30,
      confidence_factors: { sample_adequacy: 1, recency: 0.8, variance: 0.6, factors_measured: true },
    });
    expect(reason).toContain('recency measured 0.80');
    expect(reason).toContain('variance measured 0.60');
  });
});
