/**
 * Stale-scope retraction tests (to-95 audit P2): BaseGenerator.run() must
 * archive still-active rows in the generator's declared signature scope when
 * the generator no longer emits them — and must NOT retract on paths where
 * "no emit" is not evidence of staleness:
 *
 *   RETRACT:   aggregate() === null            (dequalified — no data)
 *   RETRACT:   sampleN < minSampleN            (fell below the sample gate)
 *   RETRACT:   successful emit                 (keep the fresh signature,
 *                                               archive superseded siblings)
 *   NO-OP:     requiresStanding && !standing   (infrastructure lag, would flap)
 *   NO-OP:     isEnabled() === false           (team toggle — product choice)
 *   NO-OP:     philosophy GATED_OUT            (product choice)
 *   NO-OP:     aggregate() throws              (error ≠ dequalification)
 *   NO-OP:     signatureScope() === null       (opt-in default)
 *
 * The retraction must only touch tentative/detected + status=active rows the
 * coach never touched (acknowledged_at / addressed_at null), via a soft
 * archive UPDATE — never a DELETE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock the DB boundary BEFORE importing the SUT ------------------------
const upsertInsightV3Mock = vi.fn();
const loadStandingForMetricMock = vi.fn();
const computeCounterfactualMock = vi.fn();
const loadPlayerScoringBaselineMock = vi.fn();
const loadPlayerCohortMock = vi.fn();
const logServerErrorMock = vi.fn();

interface RecordedUpdate {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ op: string; args: unknown[] }>;
}
const recordedUpdates: RecordedUpdate[] = [];
let retractionRows: Array<{ id: string }> = [];
let retractionError: { message: string } | null = null;

function makeUpdateBuilder(table: string, payload: Record<string, unknown>) {
  const rec: RecordedUpdate = { table, payload, filters: [] };
  recordedUpdates.push(rec);
  const builder = {
    eq: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'eq', args }), builder)),
    like: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'like', args }), builder)),
    in: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'in', args }), builder)),
    is: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'is', args }), builder)),
    neq: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'neq', args }), builder)),
    select: vi.fn(() =>
      Promise.resolve({ data: retractionError ? null : retractionRows, error: retractionError }),
    ),
  };
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => makeUpdateBuilder(table, payload),
    }),
  }),
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

// SUT + types — imported after the mocks are registered.
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';

interface TestAgg extends GeneratorAggregate {
  sampleN: number;
  playerValue: number;
}

class ScopedGenerator extends BaseGenerator<TestAgg> {
  readonly name = 'scoped-generator';
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
      scope?: string | null;
    } = {},
  ) {
    super(playerId);
    if (opts.requiresStanding !== undefined) {
      (this as unknown as { requiresStanding: boolean }).requiresStanding =
        opts.requiresStanding;
    }
  }

  protected override signatureScope(): string | null {
    return this.opts.scope === undefined ? 'test_scope:bucket_a' : this.opts.scope;
  }

  protected override async isEnabled(): Promise<boolean> {
    return this.opts.enabled ?? true;
  }

  async aggregate(): Promise<TestAgg | null> {
    if (this.opts.aggThrows) throw new Error('boom');
    return this.opts.agg === undefined
      ? { sampleN: 10, playerValue: -1.0 }
      : this.opts.agg;
  }

  composeContent(agg: TestAgg): ComposedContent {
    return {
      title: 'Test insight',
      content: 'Test content',
      signature: `test_scope:bucket_a:${agg.playerValue}`,
      priority: 'low',
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
        strokes_impact: 0,
        strokes_impact_method: 'rough_estimate',
        confidence: 0,
        confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
      },
    };
  }
}

function filterMap(rec: RecordedUpdate): Record<string, unknown[][]> {
  const out: Record<string, unknown[][]> = {};
  for (const f of rec.filters) (out[f.op] ??= []).push(f.args);
  return out;
}

beforeEach(() => {
  recordedUpdates.length = 0;
  retractionRows = [{ id: 'stale-1' }, { id: 'stale-2' }];
  retractionError = null;
  upsertInsightV3Mock.mockReset().mockResolvedValue('fresh-row-id');
  loadStandingForMetricMock.mockReset().mockResolvedValue(null);
  computeCounterfactualMock.mockReset().mockReturnValue(null);
  loadPlayerScoringBaselineMock.mockReset().mockResolvedValue(75);
  loadPlayerCohortMock.mockReset().mockResolvedValue({ gender: null });
  logServerErrorMock.mockReset().mockResolvedValue(undefined);
});

describe('BaseGenerator stale-scope retraction (audit P2)', () => {
  it('retracts the full scope when aggregate() returns null (dequalified)', async () => {
    const result = await new ScopedGenerator('player-1', { agg: null }).run();
    expect(result).toEqual({ id: null, gated: false, retracted: 2 });

    expect(recordedUpdates).toHaveLength(1);
    const rec = recordedUpdates[0]!;
    expect(rec.table).toBe('golf_coach_insights');
    // Soft archive — never a DELETE, and updated_at must move.
    expect(rec.payload.lifecycle_state).toBe('archived');
    expect(rec.payload.archived_at).toBeTruthy();
    expect(rec.payload.updated_at).toBeTruthy();

    const f = filterMap(rec);
    expect(f.eq).toContainEqual(['player_id', 'player-1']);
    expect(f.eq).toContainEqual(['status', 'active']);
    expect(f.like).toEqual([['signature', 'v3:test_scope:bucket_a%']]);
    expect(f.in).toEqual([['lifecycle_state', ['tentative', 'detected']]]);
    expect(f.is).toContainEqual(['acknowledged_at', null]);
    expect(f.is).toContainEqual(['addressed_at', null]);
    // Nothing to keep — no neq filter.
    expect(f.neq).toBeUndefined();
  });

  it('retracts when the aggregate falls below minSampleN', async () => {
    const result = await new ScopedGenerator('player-1', {
      agg: { sampleN: 2, playerValue: -1 },
    }).run();
    expect(result.retracted).toBe(2);
    expect(recordedUpdates).toHaveLength(1);
  });

  it('does NOT retract on the no-standing exit (infrastructure lag)', async () => {
    loadStandingForMetricMock.mockResolvedValue(null);
    const result = await new ScopedGenerator('player-1', { requiresStanding: true }).run();
    expect(result).toEqual({ id: null, gated: false });
    expect(recordedUpdates).toHaveLength(0);
  });

  it('retracts superseded siblings after a successful emit, keeping the fresh signature', async () => {
    const result = await new ScopedGenerator('player-1', { requiresStanding: false }).run();
    expect(result.id).toBe('fresh-row-id');
    expect(result.retracted).toBe(2);

    expect(recordedUpdates).toHaveLength(1);
    const f = filterMap(recordedUpdates[0]!);
    expect(f.neq).toEqual([['signature', 'v3:test_scope:bucket_a:-1']]);
  });

  it('does NOT retract when the philosophy gate suppresses the write', async () => {
    upsertInsightV3Mock.mockResolvedValue('__gated_out__');
    const result = await new ScopedGenerator('player-1', { requiresStanding: false }).run();
    expect(result).toEqual({ id: null, gated: true });
    expect(recordedUpdates).toHaveLength(0);
  });

  it('does NOT retract when the team toggle disables the generator', async () => {
    const result = await new ScopedGenerator('player-1', { enabled: false }).run();
    expect(result).toEqual({ id: null, gated: true });
    expect(recordedUpdates).toHaveLength(0);
  });

  it('does NOT retract from the error path (error ≠ dequalification)', async () => {
    const result = await new ScopedGenerator('player-1', { aggThrows: true }).run();
    expect(result).toEqual({ id: null, gated: false });
    expect(recordedUpdates).toHaveLength(0);
    expect(logServerErrorMock).toHaveBeenCalled();
  });

  it('is a no-op when the generator declares no scope (default)', async () => {
    const result = await new ScopedGenerator('player-1', { agg: null, scope: null }).run();
    expect(result).toEqual({ id: null, gated: false, retracted: 0 });
    expect(recordedUpdates).toHaveLength(0);
  });

  it('swallows + logs a retraction failure without failing the run', async () => {
    retractionError = { message: 'permission denied' };
    const result = await new ScopedGenerator('player-1', { requiresStanding: false }).run();
    // The fresh insight still landed; the sweep failure is logged, not thrown.
    expect(result.id).toBe('fresh-row-id');
    expect(result.retracted).toBe(0);
    expect(logServerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('stale-scope retraction failed'),
      expect.anything(),
    );
  });
});
