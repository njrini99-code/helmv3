/**
 * Recent-window recheck (owner decision 2026-09-25): a lifetime-window
 * insight is rechecked against the player's recent rounds. When the recent
 * window beats the target by more than chance the row is retired to
 * lifecycle 'archived' (engine axis only, provenance in metadata); it is
 * re-emitted — and so resurrected — only when the leak actually re-appears.
 *
 * Covers the statistics, the grading, the pure lifecycle decisions, and
 * BaseGenerator.run()'s application of them against a fake DB boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock the DB boundary BEFORE importing the SUT ------------------------
const upsertInsightV3Mock = vi.fn();
const logServerErrorMock = vi.fn();

interface RecordedUpdate {
  payload: Record<string, unknown>;
  filters: Array<{ op: string; args: unknown[] }>;
}
const recordedUpdates: RecordedUpdate[] = [];
/** The row the pre-upsert signature lookup finds (null = none yet). */
let existingRow: Record<string, unknown> | null = null;
/** The row the post-upsert SELECT (by id) returns. */
let currentRow: Record<string, unknown> | null = null;
/** Whether the CAS update matches a row. */
let casMatches = true;

function makeSelectBuilder() {
  const b = {
    eq: vi.fn(() => b),
    like: vi.fn(() => b),
    in: vi.fn(() => b),
    is: vi.fn(() => b),
    neq: vi.fn(() => b),
    order: vi.fn(() => b),
    limit: vi.fn(() => Promise.resolve({ data: existingRow ? [existingRow] : [], error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: currentRow, error: null })),
    // The scope sweep awaits the builder itself; no scope in these tests.
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
  };
  return b;
}

function makeUpdateBuilder(payload: Record<string, unknown>) {
  const rec: RecordedUpdate = { payload, filters: [] };
  recordedUpdates.push(rec);
  const b = {
    eq: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'eq', args }), b)),
    is: vi.fn((...args: unknown[]) => (rec.filters.push({ op: 'is', args }), b)),
    select: vi.fn(() => b),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve({ data: casMatches ? [{ id: 'row-1' }] : [], error: null })),
  };
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => makeSelectBuilder(),
      update: (payload: Record<string, unknown>) => makeUpdateBuilder(payload),
    }),
  }),
}));

vi.mock('@/lib/coachhelm/v3/insights/upsert-v3', () => ({
  upsertInsightV3: (...args: unknown[]) => upsertInsightV3Mock(...args),
  V3_SIGNATURE_PREFIX: 'v3:',
  GATED_OUT: '__gated_out__',
}));

vi.mock('@/lib/coachhelm/v3/engine/root-cause-context', () => ({
  loadRootCauseContext: vi.fn(async () => null),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerErrorMock(...args),
}));

import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import {
  decideRecheckTransition,
  meanUpperBound,
  parScoringRecheck,
  puttBandRecheck,
  RECHECK_RESOLVED_BY,
  RECHECK_RETIRED_REASON,
  shouldSuppressReemit,
  wilsonLowerBound,
  type InsightRecheck,
  type RecentPutt,
} from '@/lib/coachhelm/v3/engine/recent-recheck';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';
import type { InsightEvidence, InsightInput } from '@/lib/coachhelm/v2/insights/types';

const NOW = '2026-09-25T00:00:00.000Z';

function putt(d: number | null, made: boolean): RecentPutt {
  return { round_id: 'r', distance_to_hole_before: d, result: made ? 'hole' : 'green', putt_made: made };
}
function putts(n: number, made: number, d = 4): RecentPutt[] {
  return Array.from({ length: n }, (_, i) => putt(d, i < made));
}

function recheck(status: InsightRecheck['status']): InsightRecheck {
  return {
    status,
    checked_at: NOW,
    window_days: 90,
    recent_value: 1,
    bound: 1,
    sample_n: 30,
    min_sample_n: 20,
    comparison_value: 1,
  };
}

const RETIRED_META = {
  resolved_by: RECHECK_RESOLVED_BY,
  retired_reason: RECHECK_RETIRED_REASON,
  archived_by: RECHECK_RESOLVED_BY,
  archive_reason: RECHECK_RETIRED_REASON,
  movement_count: 2,
};

describe('bounds', () => {
  it('Wilson lower bound sits below the point estimate and tightens with n', () => {
    const small = wilsonLowerBound(9, 10);
    const large = wilsonLowerBound(90, 100);
    expect(small).toBeLessThan(0.9);
    expect(large).toBeLessThan(0.9);
    expect(large).toBeGreaterThan(small);
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it('mean upper bound sits above the mean; null under 2 values', () => {
    expect(meanUpperBound([4, 5, 4, 5])!).toBeGreaterThan(4.5);
    expect(meanUpperBound([4])).toBeNull();
  });
});

describe('puttBandRecheck', () => {
  it('uses the cache band rule (lo, hi]: 3 ft is out of the 3–5 band, 5 ft is in', () => {
    const r = puttBandRecheck([putt(3, true), putt(3, true), putt(5, false), putt(4, true)], { lo: 3, hi: 5 }, 90.5, 1, NOW);
    expect(r.sample_n).toBe(2);
    expect(r.recent_value).toBe(50);
  });

  it('counts putt_made=true as made even without result=hole, and clamps distance to 120', () => {
    const ps: RecentPutt[] = [
      { round_id: 'r', distance_to_hole_before: 4, result: null, putt_made: true },
      { round_id: 'r', distance_to_hole_before: 400, result: 'green', putt_made: false },
    ];
    expect(puttBandRecheck(ps, { lo: 3, hi: 5 }, 90.5, 1, NOW).recent_value).toBe(100);
    expect(puttBandRecheck(ps, { lo: 25, hi: null }, 5.5, 1, NOW).sample_n).toBe(1);
  });

  it('clears only when the Wilson lower bound beats the anchor', () => {
    // 30/30 → lower bound ~95% > 90.5 → cleared.
    expect(puttBandRecheck(putts(30, 30), { lo: 3, hi: 5 }, 90.5, 20, NOW).status).toBe('cleared');
    // 28/30 = 93.3% beats 90.5 on the point, but not by more than chance.
    const r = puttBandRecheck(putts(30, 28), { lo: 3, hi: 5 }, 90.5, 20, NOW);
    expect(r.status).toBe('inconclusive');
    expect(r.bound!).toBeLessThan(90.5);
  });

  it('holds while the point estimate is below the anchor', () => {
    // The 0c82eefb shape: 56/68 = 82.4% against 90.5.
    const r = puttBandRecheck(putts(68, 56, 4.5), { lo: 3, hi: 5 }, 90.5, 20, NOW);
    expect(r.recent_value).toBe(82.4);
    expect(r.status).toBe('holds');
  });

  it('thin below the band minimum — even at 100%', () => {
    const r = puttBandRecheck(putts(39, 39, 30), { lo: 25, hi: null }, 5.5, 40, NOW);
    expect(r.status).toBe('thin');
    expect(r.min_sample_n).toBe(40);
  });

  it('a 25+ ft 1-in-18 is not a clearance', () => {
    const r = puttBandRecheck(putts(18, 1, 30), { lo: 25, hi: null }, 5.5, 1, NOW);
    expect(r.recent_value).toBe(5.6);
    expect(r.status).toBe('inconclusive');
  });
});

describe('parScoringRecheck', () => {
  const hole = (round: string, par: number, score: number | null) => ({ round_id: round, par, score });

  it('averages only this par type and gates on distinct rounds', () => {
    const holes = [hole('a', 4, 4), hole('a', 3, 5), hole('b', 4, 5), hole('c', 4, null)];
    const r = parScoringRecheck(holes, 4, 4, 2, NOW);
    expect(r.recent_value).toBe(4.5);
    expect(r.sample_n).toBe(2);
    expect(r.status).toBe('holds');
  });

  it('clears only when the upper bound is under par; thin under the rounds floor', () => {
    const rounds = ['a', 'b', 'c', 'd', 'e'];
    const under = rounds.flatMap((r) => [hole(r, 3, 2), hole(r, 3, 3), hole(r, 3, 2), hole(r, 3, 3)]);
    expect(parScoringRecheck(under, 3, 3, 5, NOW).status).toBe('cleared');
    const level = rounds.flatMap((r) => [hole(r, 3, 3), hole(r, 3, 3)]);
    expect(parScoringRecheck(level, 3, 3, 5, NOW).status).toBe('inconclusive');
    expect(parScoringRecheck(under.slice(0, 16), 3, 3, 5, NOW).status).toBe('thin');
  });
});

describe('decideRecheckTransition', () => {
  it('retires a visible, coach-untouched leak only on cleared', () => {
    for (const lifecycle of ['detected', 'matured'] as const) {
      expect(decideRecheckTransition({ lifecycle, metadata: {}, isLeak: true, recheck: recheck('cleared') })).toBe('retire');
      for (const s of ['holds', 'inconclusive', 'thin'] as const) {
        expect(decideRecheckTransition({ lifecycle, metadata: {}, isLeak: true, recheck: recheck(s) })).toBe('none');
      }
    }
  });

  it('never retires tentative, addressed, resolved, archived, or a strength row', () => {
    for (const lifecycle of ['tentative', 'addressed', 'resolved', 'archived'] as const) {
      expect(decideRecheckTransition({ lifecycle, metadata: {}, isLeak: true, recheck: recheck('cleared') })).toBe('none');
    }
    expect(decideRecheckTransition({ lifecycle: 'detected', metadata: {}, isLeak: false, recheck: recheck('cleared') })).toBe('none');
  });

  it('restores the markers once an upsert has resurrected a recheck-retired row', () => {
    expect(decideRecheckTransition({ lifecycle: 'detected', metadata: RETIRED_META, isLeak: true, recheck: recheck('holds') })).toBe('restore');
    expect(decideRecheckTransition({ lifecycle: 'archived', metadata: RETIRED_META, isLeak: true, recheck: recheck('holds') })).toBe('none');
  });
});

describe('shouldSuppressReemit', () => {
  it('keeps a recheck-retired row archived unless the leak re-appeared', () => {
    const base = { existingLifecycle: 'archived' as const, existingMetadata: RETIRED_META };
    expect(shouldSuppressReemit({ ...base, isLeak: true, recheck: recheck('holds') })).toBe(false);
    for (const s of ['cleared', 'inconclusive', 'thin'] as const) {
      expect(shouldSuppressReemit({ ...base, isLeak: true, recheck: recheck(s) })).toBe(true);
    }
    expect(shouldSuppressReemit({ ...base, isLeak: true, recheck: null })).toBe(true);
    expect(shouldSuppressReemit({ ...base, isLeak: false, recheck: null })).toBe(true);
  });

  it('never suppresses rows it did not retire — other archives resurrect as before', () => {
    expect(shouldSuppressReemit({ existingLifecycle: 'archived', existingMetadata: { archived_by: 'generator-scope-sweep' }, isLeak: true, recheck: recheck('cleared') })).toBe(false);
    expect(shouldSuppressReemit({ existingLifecycle: 'detected', existingMetadata: {}, isLeak: true, recheck: recheck('cleared') })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// run() integration
// ---------------------------------------------------------------------------

interface TestAgg extends GeneratorAggregate {
  sampleN: number;
  playerValue: number;
}

class RecheckGenerator extends BaseGenerator<TestAgg> {
  readonly name = 'recheck-generator';
  readonly metricId: MetricId = 'putts_made_3_5ft_pct';
  readonly insightType = 'putt_distance';
  readonly category: InsightCategory = 'putting';
  readonly minSampleN = 5;
  protected override readonly requiresStanding = false;
  protected override readonly rechecksRecentWindow: boolean;
  recheckCalls = 0;

  constructor(
    private readonly framing: 'leak' | 'strength',
    private readonly result: InsightRecheck | null | Error,
    optIn = true,
  ) {
    super('player-1');
    this.rechecksRecentWindow = optIn;
  }

  protected override async recentWindowRecheck(): Promise<InsightRecheck | null> {
    this.recheckCalls += 1;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }

  async aggregate(): Promise<TestAgg> {
    return { sampleN: 98, playerValue: 79.6 };
  }

  composeContent(agg: TestAgg): ComposedContent {
    const evidence: InsightEvidence = {
      metric: this.metricId,
      metric_label: 'Putts Made 3-5 ft',
      unit: 'percent',
      your_value: agg.playerValue,
      your_value_display: '80%',
      comparison_value: 90.5,
      comparison_label: 'PGA Tour make %',
      comparison_source: 'pga_baseline',
      sample_n: agg.sampleN,
      window_days: 113,
      window_start: '',
      window_end: '2026-09-22',
      strokes_impact: 0,
      strokes_impact_method: 'peer_delta',
      confidence: 0,
      confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
    };
    return { title: 't', content: 'c', signature: 'putt_distance:3_5ft', priority: 'low', framing: this.framing, evidence };
  }
}

function lastUpsertEvidence(): InsightEvidence {
  const call = upsertInsightV3Mock.mock.calls.at(-1);
  if (!call) throw new Error('upsert not called');
  return (call[1] as InsightInput).evidence;
}

describe('BaseGenerator.run() recent-window recheck', () => {
  beforeEach(() => {
    upsertInsightV3Mock.mockReset().mockResolvedValue('row-1');
    logServerErrorMock.mockReset();
    recordedUpdates.length = 0;
    existingRow = { id: 'row-1', lifecycle_state: 'detected', metadata: { movement_count: 2 } };
    currentRow = { id: 'row-1', lifecycle_state: 'detected', metadata: { movement_count: 2 }, updated_at: '2026-09-24T12:00:00Z' };
    casMatches = true;
  });

  it('cleared: stamps evidence.recheck and archives on the engine axis only', async () => {
    const res = await new RecheckGenerator('leak', { ...recheck('cleared'), recent_value: 97, bound: 93, sample_n: 40 }).run();

    expect(lastUpsertEvidence().recheck?.status).toBe('cleared');
    expect(res.recheck).toBe('retire');
    expect(recordedUpdates).toHaveLength(1);
    const { payload, filters } = recordedUpdates[0]!;
    expect(payload.lifecycle_state).toBe('archived');
    expect(typeof payload.archived_at).toBe('string');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('resolved_at');
    const meta = payload.metadata as Record<string, unknown>;
    expect(meta.resolved_by).toBe(RECHECK_RESOLVED_BY);
    expect(meta.retired_reason).toBe(RECHECK_RETIRED_REASON);
    expect(meta.retired_from_state).toBe('detected');
    expect(meta.retired_recheck).toMatchObject({ recent_value: 97, bound: 93, sample_n: 40, window_days: 90 });
    expect(meta.movement_count).toBe(2);
    expect(filters).toContainEqual({ op: 'eq', args: ['lifecycle_state', 'detected'] });
    expect(filters).toContainEqual({ op: 'eq', args: ['updated_at', '2026-09-24T12:00:00Z'] });
  });

  for (const s of ['holds', 'inconclusive', 'thin'] as const) {
    it(`${s}: recorded on the evidence, row left as is`, async () => {
      const res = await new RecheckGenerator('leak', recheck(s)).run();
      expect(lastUpsertEvidence().recheck?.status).toBe(s);
      expect(res.recheck).toBeUndefined();
      expect(recordedUpdates).toHaveLength(0);
    });
  }

  it('a recheck-retired row is NOT re-emitted (so not resurrected) while the leak stays away', async () => {
    existingRow = { id: 'row-1', lifecycle_state: 'archived', metadata: RETIRED_META };
    for (const s of ['cleared', 'inconclusive', 'thin'] as const) {
      upsertInsightV3Mock.mockClear();
      const res = await new RecheckGenerator('leak', recheck(s)).run();
      expect(upsertInsightV3Mock).not.toHaveBeenCalled();
      expect(res).toMatchObject({ id: 'row-1', status: 'gated', recheck: 'kept_retired' });
    }
    expect(recordedUpdates).toHaveLength(0);
  });

  it('a recheck-retired row comes back when the leak re-appears, with its markers cleared', async () => {
    existingRow = { id: 'row-1', lifecycle_state: 'archived', metadata: RETIRED_META };
    // upsertInsight resurrects it (archived → detected); the run then clears markers.
    currentRow = { id: 'row-1', lifecycle_state: 'detected', metadata: RETIRED_META, updated_at: '2026-09-25T02:00:00Z' };
    const res = await new RecheckGenerator('leak', recheck('holds')).run();
    expect(upsertInsightV3Mock).toHaveBeenCalledTimes(1);
    expect(res.recheck).toBe('restore');
    const { payload, filters } = recordedUpdates[0]!;
    expect(payload).not.toHaveProperty('lifecycle_state');
    const meta = payload.metadata as Record<string, unknown>;
    expect(meta).not.toHaveProperty('resolved_by');
    expect(meta).not.toHaveProperty('retired_reason');
    expect(meta).not.toHaveProperty('archived_by');
    expect(meta.restored_by).toBe(RECHECK_RESOLVED_BY);
    expect(meta.movement_count).toBe(2);
    expect(filters).toContainEqual({ op: 'eq', args: ['lifecycle_state', 'detected'] });
  });

  it('rows archived by other sweeps still resurrect on re-emit', async () => {
    existingRow = { id: 'row-1', lifecycle_state: 'archived', metadata: { archived_by: 'generator-scope-sweep' } };
    await new RecheckGenerator('leak', recheck('inconclusive')).run();
    expect(upsertInsightV3Mock).toHaveBeenCalledTimes(1);
  });

  it('a lost CAS race is not reported as a transition', async () => {
    casMatches = false;
    const res = await new RecheckGenerator('leak', recheck('cleared')).run();
    expect(recordedUpdates).toHaveLength(1);
    expect(res.recheck).toBeUndefined();
  });

  it('a strength row skips the recheck entirely', async () => {
    const gen = new RecheckGenerator('strength', recheck('cleared'));
    const res = await gen.run();
    expect(gen.recheckCalls).toBe(0);
    expect(lastUpsertEvidence().recheck).toBeUndefined();
    expect(res.recheck).toBeUndefined();
  });

  it('a generator that does not opt in never rechecks or looks up', async () => {
    existingRow = { id: 'row-1', lifecycle_state: 'archived', metadata: RETIRED_META };
    const gen = new RecheckGenerator('leak', recheck('cleared'), false);
    const res = await gen.run();
    expect(gen.recheckCalls).toBe(0);
    expect(upsertInsightV3Mock).toHaveBeenCalledTimes(1);
    expect(res.recheck).toBeUndefined();
  });

  it('a throwing recheck is logged, the insight still ships, and nothing moves', async () => {
    const res = await new RecheckGenerator('leak', new Error('boom')).run();
    expect(res.status).toBe('generated');
    expect(lastUpsertEvidence().recheck).toBeUndefined();
    expect(recordedUpdates).toHaveLength(0);
    expect(logServerErrorMock.mock.calls.map((c) => String(c[0]))).toContainEqual(
      expect.stringContaining('recent-window recheck failed'),
    );
  });
});
