import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit row 33 (2026-09-28): the engine labelled same-round |r| >= 0.3 as
 * cause and effect, two of its three "causal" sub-tests could not fail
 * (temporal precedence on raw un-centred products; a natural experiment that
 * counted any change at all), it dropped the sign, and 4 of 6 hypotheses were
 * score arithmetic. Owner decision "honest correlation": store significant,
 * signed correlations only.
 */

type Round = {
  id: string;
  round_date: string;
  score_to_par: number;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
};

const { state, adminFromMock, writes } = vi.hoisted(() => {
  const state = { fixture: [] as Array<Record<string, unknown>> };
  const writes = {
    inserted: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
  };

  function roundsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
      // The engine asks for newest-first.
      Promise.resolve({ data: [...state.fixture].reverse(), error: null as null }).then(resolve);
    return b;
  }

  function writeBuilder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.insert = (row: Record<string, unknown>) => {
      writes.inserted.push(row);
      return Promise.resolve({ error: null });
    };
    b.update = (patch: Record<string, unknown>) => {
      writes.updates.push(patch);
      return b;
    };
    b.eq = () => b;
    b.not = () => b;
    b.limit = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.then = (resolve: (v: { error: null }) => unknown) =>
      Promise.resolve({ error: null as null }).then(resolve);
    return b;
  }

  const adminFromMock = vi.fn((table: string) =>
    table === 'golf_rounds' ? roundsBuilder() : writeBuilder(),
  );
  return { state, adminFromMock, writes };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFromMock }),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { CausalEngine } from '@/lib/coachhelm/v2/mining/causal-engine';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function day(i: number): string {
  return new Date(Date.UTC(2026, 0, 1 + i * 3)).toISOString().slice(0, 10);
}

/** Independent, realistic-magnitude stats: nothing moves with anything. */
function randomRounds(seed: number, n: number): Round[] {
  const rand = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    round_date: day(i),
    score_to_par: 4 + Math.round(rand() * 10),
    total_putts: 28 + Math.round(rand() * 8),
    total_fairways_hit: 4 + Math.round(rand() * 8),
    total_gir: 4 + Math.round(rand() * 10),
  }));
}

/** Fairways strongly positive with GIR, and putts NEGATIVE with GIR, with no
 *  structure across rounds in time (each round's fairways drawn independently). */
function linkedRounds(n: number): Round[] {
  const rand = mulberry32(99);
  return Array.from({ length: n }, (_, i) => {
    const fairways = 4 + Math.round(rand() * 8);
    const gir = fairways + Math.round(rand() * 2);
    return {
      id: `r${i}`,
      round_date: day(i),
      score_to_par: 5 + Math.round(rand() * 6),
      // Fewer putts when more greens: a NEGATIVE relationship, to prove the sign is kept.
      total_putts: 40 - gir + Math.round(rand() * 2),
      total_fairways_hit: fairways,
      total_gir: gir,
    };
  });
}

beforeEach(() => {
  writes.inserted.length = 0;
  writes.updates.length = 0;
  adminFromMock.mockClear();
});

interface Internals {
  generateHypotheses(): Array<{ causeMetric: string; effectMetric: string; mechanism: string }>;
}

describe('CausalEngine — honest correlation gate', () => {
  it('no longer tests score-arithmetic hypotheses (components of the score -> score_to_par)', () => {
    const hs = (new CausalEngine('p1') as unknown as Internals).generateHypotheses();
    for (const metric of ['total_gir', 'total_putts', 'total_fairways_hit']) {
      expect(
        hs.some((h) => h.causeMetric === metric && h.effectMetric === 'score_to_par'),
        metric,
      ).toBe(false);
    }
    expect(hs.some((h) => h.causeMetric === 'total_fairways_hit' && h.effectMetric === 'total_gir')).toBe(true);
    expect(hs.some((h) => h.causeMetric === 'total_gir' && h.effectMetric === 'total_putts')).toBe(true);
  });

  it('mechanism copy never asserts causation', () => {
    const hs = (new CausalEngine('p1') as unknown as Internals).generateHypotheses();
    for (const h of hs) {
      expect(h.mechanism).not.toMatch(/\b(directly|creates|leads to|causes|convert into)\b/i);
      expect(h.mechanism).toMatch(/tend|may|can|often/i);
    }
  });

  it('stores nothing for random, uncorrelated players across many seeds', async () => {
    let players = 0;
    let anyPassed = 0;
    for (let seed = 1; seed <= 60; seed++) {
      state.fixture = randomRounds(seed, 15 + (seed % 15));
      const rels = await new CausalEngine(`p${seed}`).discoverCausalRelationships({ persist: false });
      players++;
      if (rels.length > 0) anyPassed++;
    }
    // The old gate stored something for roughly a quarter of pure-noise players.
    expect(anyPassed / players).toBeLessThan(0.1);
  });

  it('keeps the SIGN, the sample size and the p/q values in evidence', async () => {
    state.fixture = linkedRounds(24);
    const rels = await new CausalEngine('p1').discoverCausalRelationships({ persist: false });
    const girPutts = rels.find((r) => r.causeMetric === 'total_gir' && r.effectMetric === 'total_putts');
    expect(girPutts).toBeDefined();
    const ev = girPutts!.evidence as unknown as Record<string, number | string>;
    expect(ev.method).toBe('correlation_v1');
    expect(ev.correlation as number).toBeLessThan(-0.3);
    expect(ev.sampleN).toBe(24);
    expect(ev.pValue as number).toBeLessThan(0.05);
    expect(ev.qValue as number).toBeLessThan(0.05);
    expect(girPutts!.strength).toBeCloseTo(Math.abs(ev.correlation as number), 10);
    // A correlation claims no direction.
    expect(girPutts!.relationshipType).toBe('bidirectional');
  });

  it('temporal precedence and natural experiments can fail and are not in the gate', async () => {
    state.fixture = linkedRounds(24);
    const rels = await new CausalEngine('p1').discoverCausalRelationships({ persist: false });
    expect(rels.length).toBeGreaterThan(0);
    // Rounds are independent in time, so the centred lag-1 test fails here —
    // and the rows are still stored because the gate is the correlation test.
    expect(rels.every((r) => r.evidence.temporalPrecedence === false)).toBe(true);
    for (const r of rels) {
      for (const ex of r.evidence.naturalExperiments) {
        expect(ex.effectChange).not.toMatch(/^Score /);
      }
    }
  });

  it('confidence is a significance measure (1 - q), not a causal score', async () => {
    state.fixture = linkedRounds(24);
    const rels = await new CausalEngine('p1').discoverCausalRelationships({ persist: false });
    for (const r of rels) {
      const q = (r.evidence as unknown as { qValue: number }).qValue;
      expect(r.confidence).toBeCloseTo(Math.min(0.99, 1 - q), 10);
    }
  });

  it('a player below 15 rounds gets no rows AND retires their old active rows', async () => {
    state.fixture = linkedRounds(12);
    const rels = await new CausalEngine('p1').discoverCausalRelationships();
    expect(rels).toEqual([]);
    expect(writes.inserted).toHaveLength(0);
    expect(writes.updates.some((u) => u.is_active === false)).toBe(true);
  });
});
