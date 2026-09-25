/**
 * Recent-window recheck (owner decision 2026-09-25): a lifetime-window
 * insight is rechecked against the player's recent rounds; when the problem
 * no longer holds the row moves to lifecycle 'resolved' (engine axis only),
 * and an engine-resolved row whose leak returns is reopened.
 *
 * Covers the pure pieces (band/par recomputation, the transition decision)
 * and BaseGenerator.run()'s application of them against a fake DB boundary.
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
/** The row the post-upsert SELECT returns. */
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
  parScoringRecheck,
  puttBandRecheck,
  RECHECK_RESOLVED_BY,
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

function recheck(status: InsightRecheck['status']): InsightRecheck {
  return {
    status,
    checked_at: NOW,
    window_days: 90,
    recent_value: 1,
    sample_n: 10,
    min_sample_n: 8,
    comparison_value: 1,
  };
}

describe('puttBandRecheck', () => {
  it('uses the cache band rule (lo, hi]: 3 ft is out of the 3–5 band, 5 ft is in', () => {
    const putts = [putt(3, true), putt(3, true), putt(5, false), putt(4, true)];
    const r = puttBandRecheck(putts, { lo: 3, hi: 5 }, 90.5, 1, NOW);
    expect(r.sample_n).toBe(2);
    expect(r.recent_value).toBe(50);
  });

  it('counts putt_made=true as made even without result=hole, and clamps distance to 120', () => {
    const putts: RecentPutt[] = [
      { round_id: 'r', distance_to_hole_before: 4, result: null, putt_made: true },
      { round_id: 'r', distance_to_hole_before: 400, result: 'green', putt_made: false },
    ];
    expect(puttBandRecheck(putts, { lo: 3, hi: 5 }, 90.5, 1, NOW).recent_value).toBe(100);
    expect(puttBandRecheck(putts, { lo: 25, hi: null }, 5.5, 1, NOW).sample_n).toBe(1);
  });

  it('cleared when the recent make % reaches the row anchor; holds while below it', () => {
    const cleared = Array.from({ length: 10 }, (_, i) => putt(4, i < 10));
    expect(puttBandRecheck(cleared, { lo: 3, hi: 5 }, 90.5, 8, NOW).status).toBe('cleared');
    const holds = Array.from({ length: 10 }, (_, i) => putt(4, i < 8));
    expect(puttBandRecheck(holds, { lo: 3, hi: 5 }, 90.5, 8, NOW).status).toBe('holds');
  });

  it('thin below the attempt floor — even at 100%', () => {
    const putts = Array.from({ length: 7 }, () => putt(4, true));
    const r = puttBandRecheck(putts, { lo: 3, hi: 5 }, 90.5, 8, NOW);
    expect(r.status).toBe('thin');
    expect(r.sample_n).toBe(7);
    expect(r.min_sample_n).toBe(8);
  });

  it('reproduces the 0c82eefb shape: 56/68 recent is still below a 90.5 anchor', () => {
    const putts = Array.from({ length: 68 }, (_, i) => putt(4.5, i < 56));
    const r = puttBandRecheck(putts, { lo: 3, hi: 5 }, 90.5, 8, NOW);
    expect(r.recent_value).toBe(82.4);
    expect(r.status).toBe('holds');
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

  it('cleared at or under par; thin under the rounds floor', () => {
    const holes = ['a', 'b', 'c', 'd', 'e'].map((r) => hole(r, 3, 3));
    expect(parScoringRecheck(holes, 3, 3, 5, NOW).status).toBe('cleared');
    expect(parScoringRecheck(holes.slice(0, 4), 3, 3, 5, NOW).status).toBe('thin');
  });
});

describe('decideRecheckTransition', () => {
  it('resolves a visible, coach-untouched leak when the recent window cleared', () => {
    for (const lifecycle of ['detected', 'matured'] as const) {
      expect(decideRecheckTransition({ lifecycle, resolvedBy: undefined, isLeak: true, recheck: recheck('cleared') })).toBe('resolve');
    }
  });

  it('never moves tentative, addressed, archived, or a strength row', () => {
    for (const lifecycle of ['tentative', 'addressed', 'archived'] as const) {
      expect(decideRecheckTransition({ lifecycle, resolvedBy: undefined, isLeak: true, recheck: recheck('cleared') })).toBe('none');
    }
    expect(decideRecheckTransition({ lifecycle: 'detected', resolvedBy: undefined, isLeak: false, recheck: recheck('cleared') })).toBe('none');
  });

  it('a thin or missing recheck never moves a row either way', () => {
    expect(decideRecheckTransition({ lifecycle: 'detected', resolvedBy: undefined, isLeak: true, recheck: recheck('thin') })).toBe('none');
    expect(decideRecheckTransition({ lifecycle: 'resolved', resolvedBy: RECHECK_RESOLVED_BY, isLeak: true, recheck: recheck('thin') })).toBe('none');
    expect(decideRecheckTransition({ lifecycle: 'detected', resolvedBy: undefined, isLeak: true, recheck: null })).toBe('none');
  });

  it('reopens only rows the recheck itself resolved — never a coach/cron resolution', () => {
    expect(decideRecheckTransition({ lifecycle: 'resolved', resolvedBy: RECHECK_RESOLVED_BY, isLeak: true, recheck: recheck('holds') })).toBe('reopen');
    expect(decideRecheckTransition({ lifecycle: 'resolved', resolvedBy: undefined, isLeak: true, recheck: recheck('holds') })).toBe('none');
    expect(decideRecheckTransition({ lifecycle: 'resolved', resolvedBy: RECHECK_RESOLVED_BY, isLeak: true, recheck: recheck('cleared') })).toBe('none');
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
  recheckCalls = 0;

  constructor(
    private readonly framing: 'leak' | 'strength',
    private readonly result: InsightRecheck | null | Error,
  ) {
    super('player-1');
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
    currentRow = { id: 'row-1', lifecycle_state: 'detected', metadata: { movement_count: 2 }, updated_at: '2026-09-24T12:00:00Z' };
    casMatches = true;
  });

  it('stamps evidence.recheck and resolves a cleared leak on the engine axis only', async () => {
    const gen = new RecheckGenerator('leak', { ...recheck('cleared'), recent_value: 95, sample_n: 20 });
    const res = await gen.run();

    expect(lastUpsertEvidence().recheck?.status).toBe('cleared');
    expect(res.recheck).toBe('resolve');
    expect(recordedUpdates).toHaveLength(1);
    const { payload, filters } = recordedUpdates[0]!;
    expect(payload.lifecycle_state).toBe('resolved');
    expect(typeof payload.resolved_at).toBe('string');
    expect(payload).not.toHaveProperty('status');
    const meta = payload.metadata as Record<string, unknown>;
    expect(meta.resolved_by).toBe(RECHECK_RESOLVED_BY);
    expect(meta.resolved_from_state).toBe('detected');
    expect(meta.movement_count).toBe(2);
    // Optimistic guard on the observed lifecycle + revision.
    expect(filters).toContainEqual({ op: 'eq', args: ['lifecycle_state', 'detected'] });
    expect(filters).toContainEqual({ op: 'eq', args: ['updated_at', '2026-09-24T12:00:00Z'] });
  });

  it('leaves the row when the leak still holds, and records the recheck', async () => {
    const res = await new RecheckGenerator('leak', recheck('holds')).run();
    expect(lastUpsertEvidence().recheck?.status).toBe('holds');
    expect(res.recheck).toBeUndefined();
    expect(recordedUpdates).toHaveLength(0);
  });

  it('a thin recent sample is recorded but never resolves', async () => {
    const res = await new RecheckGenerator('leak', recheck('thin')).run();
    expect(lastUpsertEvidence().recheck?.status).toBe('thin');
    expect(res.recheck).toBeUndefined();
    expect(recordedUpdates).toHaveLength(0);
  });

  it('reopens an engine-resolved row whose leak came back', async () => {
    currentRow = {
      id: 'row-1',
      lifecycle_state: 'resolved',
      metadata: { resolved_by: RECHECK_RESOLVED_BY, resolve_reason: 'x', resolved_from_state: 'detected' },
      updated_at: '2026-09-24T12:00:00Z',
    };
    const res = await new RecheckGenerator('leak', recheck('holds')).run();
    expect(res.recheck).toBe('reopen');
    const { payload } = recordedUpdates[0]!;
    expect(payload.lifecycle_state).toBe('detected');
    expect(payload.resolved_at).toBeNull();
    const meta = payload.metadata as Record<string, unknown>;
    expect(meta).not.toHaveProperty('resolved_by');
    expect(meta.reopened_by).toBe(RECHECK_RESOLVED_BY);
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

  it('a throwing recheck is logged and the insight still ships', async () => {
    const res = await new RecheckGenerator('leak', new Error('boom')).run();
    expect(res.status).toBe('generated');
    expect(lastUpsertEvidence().recheck).toBeUndefined();
    expect(recordedUpdates).toHaveLength(0);
    expect(logServerErrorMock.mock.calls.map((c) => String(c[0]))).toContainEqual(
      expect.stringContaining('recent-window recheck failed'),
    );
  });
});
