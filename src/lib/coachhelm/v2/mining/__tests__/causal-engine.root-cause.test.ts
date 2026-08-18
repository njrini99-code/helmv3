import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The causal engine could only ever state a tautology.
 *
 * All four hypotheses in `generateHypotheses()` carried
 * `effectMetric: 'score_to_par'`, and all four causes are arithmetic COMPONENTS
 * of the score:
 *
 *   total_gir            -> score_to_par
 *   total_putts          -> score_to_par
 *   total_fairways_hit   -> score_to_par
 *   rounds_per_week      -> score_to_par
 *
 * "Hitting more greens lowers your score" is not a discovery, it is the
 * definition of scoring. Production bears that out — 5,641 relationships across
 * exactly 4 cause metrics and ONE effect metric, `total_gir -> score_to_par`
 * alone accounting for 4,282 of them at avg strength 0.741. The engine has
 * never once explained why a component moved, which is the mechanism behind the
 * standing complaint that insights are "not root-cause".
 *
 * A root cause needs an effect that is NOT the score. The product's own
 * research doc supplies one, quantified:
 *
 *   docs/v3-research-golf-domain.md:146
 *     "### Drive -> Approach Distance/Lie -> GIR
 *      Lie quality premium: fairway -> ~65% GIR from 150; rough -> ~45%;
 *      sand -> ~25%."
 *
 * That is a documented, sourced chain from driving into GIR, and `RoundData`
 * already carries both fields — so it costs no new loading. It satisfies the
 * blocking review rule that every causal claim trace to the research doc.
 *
 * This test asserts the engine can produce a relationship whose effect is a
 * component rather than the score. Before the change it produced none.
 */

type FixtureRound = Record<string, unknown> & {
  id: string;
  score_to_par: number;
  round_date: string;
  total_putts: number;
  total_fairways_hit: number;
  total_gir: number;
};

/**
 * 40 rounds in which fairways hit and GIR move together strongly, exactly the
 * lie-quality premium the research doc describes. Scores are held flat-ish so
 * the only strong signal available is fairways -> GIR, not either -> score.
 */
function buildFixture(): FixtureRound[] {
  return Array.from({ length: 40 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 0, 1 + i));
    const fairways = 4 + (i % 9); // 4..12
    return {
      id: `round-${String(i).padStart(3, '0')}`,
      round_date: day.toISOString().slice(0, 10),
      total_fairways_hit: fairways,
      // GIR tracks fairways tightly — the documented chain.
      total_gir: fairways + 3,
      total_putts: 30,
      score_to_par: i % 2, // deliberately weak vs everything
    };
  });
}

const { state, adminFromMock, inserted } = vi.hoisted(() => {
  const state = { fixture: [] as Array<Record<string, unknown>> };
  const inserted: Array<Record<string, unknown>> = [];

  function makeRoundsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: [...state.fixture], error: null as null }).then(resolve);
    return b;
  }

  function makeWriteBuilder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.insert = (rows: unknown) => {
      for (const r of Array.isArray(rows) ? rows : [rows]) {
        inserted.push(r as Record<string, unknown>);
      }
      return Promise.resolve({ error: null });
    };
    b.update = () => b;
    b.delete = () => b;
    b.eq = () => b;
    b.not = () => b;
    b.limit = () => b;
    b.order = () => b;
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.then = (resolve: (v: { error: null }) => unknown) =>
      Promise.resolve({ error: null as null }).then(resolve);
    return b;
  }

  const adminFromMock = vi.fn((table: string) =>
    table === 'golf_rounds' ? makeRoundsBuilder() : makeWriteBuilder(),
  );
  return { state, adminFromMock, inserted };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFromMock }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { CausalEngine } from '@/lib/coachhelm/v2/mining/causal-engine';

interface EngineInternals {
  generateHypotheses(): Array<{ effectMetric: string; causeMetric: string; mechanism: string }>;
}

describe('CausalEngine — can explain a component, not only the score', () => {
  beforeEach(() => {
    state.fixture = buildFixture();
    inserted.length = 0;
    adminFromMock.mockClear();
  });

  it('tests at least one hypothesis whose effect is NOT score_to_par', () => {
    const engine = new CausalEngine('player-1', 'team-1');
    const hypotheses = (engine as unknown as EngineInternals).generateHypotheses();

    const nonScoreEffects = hypotheses.filter((h) => h.effectMetric !== 'score_to_par');
    expect(nonScoreEffects.length).toBeGreaterThan(0);
  });

  it('carries the documented driving -> GIR chain specifically', () => {
    const engine = new CausalEngine('player-1', 'team-1');
    const hypotheses = (engine as unknown as EngineInternals).generateHypotheses();

    const chain = hypotheses.find(
      (h) => h.causeMetric === 'total_fairways_hit' && h.effectMetric === 'total_gir',
    );
    expect(chain).toBeDefined();
    // The blocking review rule: a causal claim must trace to the research doc.
    // Keeping the citation in the mechanism string is what makes that checkable
    // from the row a coach eventually reads.
    expect(chain?.mechanism ?? '').toMatch(/fairway|lie/i);
  });

  it('still keeps the component -> score hypotheses', () => {
    // The tautologies are weak insights but they are not wrong, and removing
    // them would drop 5,641 rows of existing history on the floor.
    const engine = new CausalEngine('player-1', 'team-1');
    const hypotheses = (engine as unknown as EngineInternals).generateHypotheses();

    for (const metric of ['total_gir', 'total_putts', 'total_fairways_hit', 'rounds_per_week']) {
      expect(
        hypotheses.some((h) => h.causeMetric === metric && h.effectMetric === 'score_to_par'),
        metric,
      ).toBe(true);
    }
  });

  /**
   * The second non-tautological chain, and the one that changes what a coach
   * concludes rather than only what the engine says.
   *
   * `docs/v3-research-golf-domain.md:29`: "putts-per-round is *lower* for bad
   * iron players (they chip close and 1-putt for bogey)". So a low putt count
   * is not evidence of good putting — it can be evidence of missed greens. The
   * engine already tests `total_putts -> score_to_par`, which reports the
   * confounded number as a cause and says nothing about why it moved.
   *
   * Measured 2026-08-18, this matters on the real roster: of Guilford's 12
   * active players, 5 carry any active causal relationship at all and every one
   * of those relationships except a single `total_fairways_hit -> total_gir`
   * terminates in `score_to_par`. Adding one research-backed pair last night
   * produced the only genuine root cause on the team, for one player. This is
   * the same lever pulled once more.
   */
  it('carries the documented GIR -> putts confound', () => {
    const engine = new CausalEngine('player-1', 'team-1');
    const hypotheses = (engine as unknown as EngineInternals).generateHypotheses();

    const chain = hypotheses.find(
      (h) => h.causeMetric === 'total_gir' && h.effectMetric === 'total_putts',
    );
    expect(chain).toBeDefined();
    // Same blocking rule as the chain above: the claim has to carry its
    // provenance into the row a coach reads.
    expect(chain?.mechanism ?? '').toMatch(/chip|one-putt|1-putt|confound/i);
  });

  it('now tests more than one non-score effect', () => {
    const engine = new CausalEngine('player-1', 'team-1');
    const hypotheses = (engine as unknown as EngineInternals).generateHypotheses();

    const nonScore = hypotheses.filter((h) => h.effectMetric !== 'score_to_par');
    expect(nonScore.length).toBeGreaterThanOrEqual(2);
    // Distinct effects, not two routes to the same one — the point is breadth
    // of what the engine can explain.
    expect(new Set(nonScore.map((h) => h.effectMetric)).size).toBeGreaterThanOrEqual(2);
  });

  it('discovers the fairways -> GIR relationship from real-shaped rounds', async () => {
    const engine = new CausalEngine('player-1', 'team-1');
    await engine.discoverCausalRelationships();

    const found = inserted.some(
      (r) => r.cause_metric === 'total_fairways_hit' && r.effect_metric === 'total_gir',
    );
    expect(found).toBe(true);
  });
});
