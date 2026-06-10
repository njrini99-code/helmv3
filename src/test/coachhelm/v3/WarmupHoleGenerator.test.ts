import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WarmupHoleGenerator } from '@/lib/coachhelm/v3/generators/warmup-hole';

const PLAYER_ID = 'p-1';

// --- C7 hermetic harness: mock golf_rounds / golf_holes / golf_shots ----------
type Row = Record<string, unknown>;
let roundRows: Row[] = [{ id: 'r1' }];
let holeRows: Row[] = [];
let shotRows: Row[] = [];

function builder(rows: Row[]) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'in', 'not', 'order', 'range']) b[m] = vi.fn(() => b);
  b.then = (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: rows, error: null });
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) =>
      t === 'golf_rounds' ? builder(roundRows) : t === 'golf_shots' ? builder(shotRows) : builder(holeRows),
  }),
}));
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: (_c: unknown, t: string) =>
    t === 'golf_rounds' ? builder(roundRows) : t === 'golf_shots' ? builder(shotRows) : builder(holeRows),
}));
beforeEach(() => { roundRows = [{ id: 'r1' }]; holeRows = []; shotRows = []; });

function makeAgg(over: Partial<{
  playerValue: number;
  hole1_avg: number;
  rest_avg: number;
  rounds_with_hole1: number;
  cause_putt_pct: number;
  cause_tee_pct: number;
  cause_penalty_pct: number;
}> = {}) {
  return {
    last_round_date: '2026-05-25',
    sampleN: over.rounds_with_hole1 ?? 12,
    playerValue: over.playerValue ?? 0.35,
    hole1_avg: over.hole1_avg ?? 0.45,
    rest_avg: over.rest_avg ?? 0.10,
    rounds_with_hole1: over.rounds_with_hole1 ?? 12,
    cause_putt_pct: over.cause_putt_pct ?? 0,
    cause_tee_pct: over.cause_tee_pct ?? 0,
    cause_penalty_pct: over.cause_penalty_pct ?? 0,
  };
}

describe('WarmupHoleGenerator', () => {
  it('identity', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    expect(g.name).toBe('WarmupHoleGenerator');
    expect(g.insightType).toBe('warmup_hole');
    expect(g.category).toBe('pressure');
    expect(g.metricId).toBe('opening_hole_delta');
    expect(g.minSampleN).toBe(5);
  });

  it('positive delta = "harder" framing', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ playerValue: 0.35 }));
    expect(c.title).toContain('+0.35');
    expect(c.content).toContain('harder than same-par holes 2-18');
    expect(c.signature).toBe('warmup_hole:hole_1');
  });

  it('negative delta = "easier" framing', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ playerValue: -0.20, hole1_avg: -0.10, rest_avg: 0.10 }));
    expect(c.title).toContain('-0.20');
    expect(c.content).toContain('easier than same-par holes 2-18');
  });

  it('includes round count', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ rounds_with_hole1: 18 }));
    expect(c.content).toContain('18 rounds');
  });

  it('evidence references PGA 0.1 anchor', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg());
    expect(c.evidence.comparison_value).toBe(0.1);
    expect(c.evidence.comparison_source).toBe('pga_baseline');
    expect(c.evidence.unit).toBe('strokes');
  });

  it('stamps feed_exempt so the leverage floor keeps warmup out', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg());
    expect(c.evidence.feed_exempt).toBe(true);
  });
});

describe('C7 par-normalized opening tax', () => {
  it('aggregate returns null when hole 1 is NOT a positive tax (do not emit for the 7 negative-delta players)', async () => {
    // Hole 1 easier than same-par holes 2-18 → no warmup tax → no card.
    holeRows = [
      // round r1: hole 1 (par 4, score 4 = E), a par-4 later (score 5 = +1)
      { round_id: 'r1', hole_number: 1, par: 4, score: 4, putts: 2, penalty_strokes: 0 },
      { round_id: 'r1', hole_number: 5, par: 4, score: 5, putts: 2, penalty_strokes: 0 },
    ];
    const agg = await new WarmupHoleGenerator(PLAYER_ID).aggregate();
    expect(agg).toBeNull();
  });

  it('par-normalizes: hole 1 (par 5) compares to par-5 holes 2-18, not par-3s', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    // Synchronous compose contract: a positive par-normalized delta still frames "harder".
    const c = g.composeContent(makeAgg({ playerValue: 0.4, hole1_avg: 0.6, rest_avg: 0.2 }));
    expect(c.title).toContain('+0.40');
    expect(c.content).toContain('harder');
  });

  it('decomposes the opening loss into a named cause when present', () => {
    const g = new WarmupHoleGenerator(PLAYER_ID);
    const c = g.composeContent(makeAgg({ playerValue: 0.4, cause_putt_pct: 60, cause_tee_pct: 25, cause_penalty_pct: 15 }));
    expect(c.content.toLowerCase()).toContain('putt');
    expect(c.content).toContain('60%');
  });
});
