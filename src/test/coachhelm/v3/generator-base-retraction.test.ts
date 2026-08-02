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

interface RecordedSelect {
  table: string;
  filters: Array<{ op: string; args: unknown[] }>;
}
interface RecordedUpdate {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ op: string; args: unknown[] }>;
}
const recordedSelects: RecordedSelect[] = [];
const recordedUpdates: RecordedUpdate[] = [];
/** Candidate rows the sweep's SELECT returns (id + metadata + lifecycle + updated_at). */
let retractionRows: Array<{
  id: string;
  metadata: Record<string, unknown> | null;
  lifecycle_state: string;
  updated_at: string;
}> = [];
let retractionError: { message: string } | null = null;
let updateError: { message: string } | null = null;

function makeSelectBuilder(table: string) {
  const rec: RecordedSelect = { table, filters: [] };
  recordedSelects.push(rec);
  const thenable = {
    eq: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'eq', args }), thenable)),
    like: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'like', args }), thenable)),
    in: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'in', args }), thenable)),
    is: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'is', args }), thenable)),
    neq: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'neq', args }), thenable)),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        resolve({ data: retractionError ? null : retractionRows, error: retractionError }),
      ),
  };
  return thenable;
}

function makeUpdateBuilder(table: string, payload: Record<string, unknown>) {
  const rec: RecordedUpdate = { table, payload, filters: [] };
  recordedUpdates.push(rec);
  const thenable = {
    eq: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'eq', args }), thenable)),
    // The production update chain now terminates in `.select('id')` so the
    // optimistic `.eq('lifecycle_state', ...)` guard's row-match is actually
    // observable — without it, RunResult.retracted would count updates that
    // matched zero rows as archives. Return the id row that was targeted so
    // a successful (non-error) update genuinely proves a row was archived.
    select: vi.fn((..._args: unknown[]) => thenable),
    then: (resolve: (v: unknown) => unknown) => {
      if (updateError) return Promise.resolve(resolve({ data: null, error: updateError }));
      const idFilter = rec.filters.find((f) => f.op === 'eq' && f.args[0] === 'id');
      const rowId = idFilter?.args[1];
      return Promise.resolve(
        resolve({ data: rowId !== undefined ? [{ id: rowId }] : [], error: null }),
      );
    },
  };
  return thenable;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => makeSelectBuilder(table),
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

function filterMap(rec: { filters: Array<{ op: string; args: unknown[] }> }): Record<string, unknown[][]> {
  const out: Record<string, unknown[][]> = {};
  for (const f of rec.filters) (out[f.op] ??= []).push(f.args);
  return out;
}

beforeEach(() => {
  recordedSelects.length = 0;
  recordedUpdates.length = 0;
  retractionRows = [
    { id: 'stale-1', metadata: { seeded: true }, lifecycle_state: 'detected', updated_at: new Date().toISOString() },
    { id: 'stale-2', metadata: null, lifecycle_state: 'tentative', updated_at: new Date().toISOString() },
  ];
  retractionError = null;
  updateError = null;
  upsertInsightV3Mock.mockReset().mockResolvedValue('fresh-row-id');
  loadStandingForMetricMock.mockReset().mockResolvedValue(null);
  computeCounterfactualMock.mockReset().mockReturnValue(null);
  loadPlayerScoringBaselineMock.mockReset().mockResolvedValue(75);
  loadPlayerCohortMock.mockReset().mockResolvedValue({ gender: null });
  logServerErrorMock.mockReset().mockResolvedValue(undefined);
});

describe('BaseGenerator stale-scope retraction (audit P2 + regrade hardening)', () => {
  it('retracts the full scope when aggregate() returns null (dequalified), stamping provenance', async () => {
    const result = await new ScopedGenerator('player-1', { agg: null }).run();
    expect(result).toEqual({ id: null, gated: false, status: 'no_data', retracted: 2 });

    // One candidate SELECT with the full guard set (matured now included —
    // it gets the staleness bound client-side).
    expect(recordedSelects).toHaveLength(1);
    const f = filterMap(recordedSelects[0]!);
    expect(f.eq).toContainEqual(['player_id', 'player-1']);
    expect(f.eq).toContainEqual(['status', 'active']);
    expect(f.like).toEqual([['signature', 'v3:test_scope:bucket_a%']]);
    expect(f.in).toEqual([['lifecycle_state', ['tentative', 'detected', 'matured']]]);
    expect(f.is).toContainEqual(['acknowledged_at', null]);
    expect(f.is).toContainEqual(['addressed_at', null]);
    expect(f.neq).toBeUndefined();

    // Per-row archive UPDATEs with provenance merged into metadata.
    expect(recordedUpdates).toHaveLength(2);
    for (const u of recordedUpdates) {
      expect(u.payload.lifecycle_state).toBe('archived');
      expect(u.payload.archived_at).toBeTruthy();
      const meta = u.payload.metadata as Record<string, unknown>;
      expect(meta.archived_by).toBe('generator-scope-sweep');
      expect(meta.archive_reason).toBe('scope:test_scope:bucket_a');
      expect(meta.retracted_at).toBeTruthy();
    }
    // Pre-existing metadata is preserved, not clobbered.
    const first = recordedUpdates.find((u) => {
      const fm = filterMap(u);
      return fm.eq?.some((args) => args[0] === 'id' && args[1] === 'stale-1');
    });
    expect((first!.payload.metadata as Record<string, unknown>).seeded).toBe(true);
    // Optimistic lifecycle guard present on every update.
    for (const u of recordedUpdates) {
      const fm = filterMap(u);
      expect(fm.eq?.some((args) => args[0] === 'lifecycle_state')).toBe(true);
    }
  });

  it('retracts when the aggregate falls below minSampleN', async () => {
    const result = await new ScopedGenerator('player-1', {
      agg: { sampleN: 2, playerValue: -1 },
    }).run();
    expect(result.retracted).toBe(2);
    expect(recordedUpdates).toHaveLength(2);
  });

  it('applies the matured staleness bound: recent matured rows are spared, stale ones archived', async () => {
    const now = Date.now();
    retractionRows = [
      { id: 'matured-fresh', metadata: null, lifecycle_state: 'matured', updated_at: new Date(now - 2 * 86400_000).toISOString() },
      { id: 'matured-stale', metadata: null, lifecycle_state: 'matured', updated_at: new Date(now - 9 * 86400_000).toISOString() },
      { id: 'detected-any', metadata: null, lifecycle_state: 'detected', updated_at: new Date(now - 1 * 86400_000).toISOString() },
    ];
    const result = await new ScopedGenerator('player-1', { agg: null }).run();
    expect(result.retracted).toBe(2);
    const archivedIds = recordedUpdates.map((u) => {
      const fm = filterMap(u);
      return fm.eq?.find((args) => args[0] === 'id')?.[1];
    });
    expect(archivedIds.sort()).toEqual(['detected-any', 'matured-stale']);
  });

  it('does NOT retract on the no-standing exit (infrastructure lag)', async () => {
    loadStandingForMetricMock.mockResolvedValue(null);
    const result = await new ScopedGenerator('player-1', { requiresStanding: true }).run();
    expect(result).toEqual({ id: null, gated: false, status: 'standing_lag' });
    expect(recordedSelects).toHaveLength(0);
    expect(recordedUpdates).toHaveLength(0);
  });

  it('retracts superseded siblings after a successful emit, keeping the fresh signature', async () => {
    const result = await new ScopedGenerator('player-1', { requiresStanding: false }).run();
    expect(result.id).toBe('fresh-row-id');
    expect(result.retracted).toBe(2);
    const f = filterMap(recordedSelects[0]!);
    expect(f.neq).toEqual([['signature', 'v3:test_scope:bucket_a:-1']]);
  });

  it('does NOT retract when the philosophy gate suppresses the write', async () => {
    upsertInsightV3Mock.mockResolvedValue('__gated_out__');
    const result = await new ScopedGenerator('player-1', { requiresStanding: false }).run();
    expect(result).toEqual({ id: null, gated: true, status: 'gated' });
    expect(recordedSelects).toHaveLength(0);
  });

  it('DOES retract when the team toggle disables the generator (regrade NEW-P3)', async () => {
    const result = await new ScopedGenerator('player-1', { enabled: false }).run();
    expect(result).toEqual({ id: null, gated: true, status: 'gated', retracted: 2 });
    expect(recordedUpdates).toHaveLength(2);
  });

  it('does NOT retract from the error path (error \u2260 dequalification)', async () => {
    const result = await new ScopedGenerator('player-1', { aggThrows: true }).run();
    // P0-04: the error path now reports an explicit failed receipt.
    expect(result).toEqual({ id: null, gated: false, status: 'failed' });
    expect(recordedSelects).toHaveLength(0);
    expect(logServerErrorMock).toHaveBeenCalled();
  });

  it('is a no-op when the generator declares no scope (default)', async () => {
    const result = await new ScopedGenerator('player-1', { agg: null, scope: null }).run();
    expect(result).toEqual({ id: null, gated: false, status: 'no_data', retracted: 0 });
    expect(recordedSelects).toHaveLength(0);
  });

  it('swallows + logs a sweep select failure without failing the run', async () => {
    retractionError = { message: 'permission denied' };
    const result = await new ScopedGenerator('player-1', { requiresStanding: false }).run();
    expect(result.id).toBe('fresh-row-id');
    expect(result.retracted).toBe(0);
    expect(logServerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('stale-scope retraction select failed'),
      expect.anything(),
    );
  });

  it('counts only successful per-row archives when an update fails', async () => {
    updateError = { message: 'conflict' };
    const result = await new ScopedGenerator('player-1', { agg: null }).run();
    expect(result.retracted).toBe(0);
    expect(logServerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('retraction update failed'),
      expect.anything(),
    );
  });
});
