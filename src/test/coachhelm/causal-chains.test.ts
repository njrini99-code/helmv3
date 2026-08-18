/**
 * The causal engine states single edges. A root cause is a CHAIN.
 *
 * Every relationship a coach sees today is one hop, and 5,641 of 5,642
 * production rows end at `score_to_par` — "your GIR affects your score", which
 * is arithmetic, not a diagnosis. Measured 2026-08-18 on Guilford's roster:
 * 5 of 12 players carry any active relationship at all, and only Connor Lynde
 * has one whose effect is not the score.
 *
 * Two adjacent edges now exist in the engine:
 *
 *     total_fairways_hit -> total_gir     (added 2026-08-17, active for Connor)
 *     total_gir          -> total_putts   (added 2026-08-18, ff87d8126)
 *
 * Composed, those say: driving accuracy moves greens hit, and greens hit moves
 * putts. That is a statement no single-edge row can make, and it is the one a
 * coach needs — "his putting numbers look like a putting problem, they are a
 * driving problem."
 *
 * This module walks a player's OWN active relationships and returns the chains
 * that exist in them. It invents nothing: a chain is emitted only when every
 * hop is a row the engine independently detected and confirmed for that player.
 */
import { describe, it, expect } from 'vitest';
import { composeCausalChains } from '@/lib/coachhelm/v3/causality/chains';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';

function edge(
  causeMetric: string,
  effectMetric: string,
  over: Partial<CausalRelationshipRow> = {},
): CausalRelationshipRow {
  return {
    id: `${causeMetric}->${effectMetric}`,
    player_id: 'p1',
    cause: causeMetric,
    cause_metric: causeMetric,
    effect: effectMetric,
    effect_metric: effectMetric,
    relationship_type: 'direct',
    strength: 0.7,
    confidence: 0.8,
    mechanism: `${causeMetric} moves ${effectMetric}`,
    dose_response: false,
    intervention_potential: 0.6,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z',
    ...over,
  };
}

describe('composeCausalChains', () => {
  it('joins two edges that share a middle metric', () => {
    const chains = composeCausalChains([
      edge('total_fairways_hit', 'total_gir'),
      edge('total_gir', 'total_putts'),
    ]);

    expect(chains).toHaveLength(1);
    expect(chains[0]!.metrics).toEqual(['total_fairways_hit', 'total_gir', 'total_putts']);
    expect(chains[0]!.hops).toHaveLength(2);
  });

  it('extends to three hops when the data supports it', () => {
    const chains = composeCausalChains([
      edge('total_fairways_hit', 'total_gir'),
      edge('total_gir', 'total_putts'),
      edge('total_putts', 'score_to_par'),
    ]);

    const longest = chains[0]!;
    expect(longest.metrics).toEqual([
      'total_fairways_hit',
      'total_gir',
      'total_putts',
      'score_to_par',
    ]);
  });

  it('returns the LONGEST chain first — that is the deepest root cause', () => {
    // Two disjoint chains so the ordering has something to order. The first
    // fixture for this test produced only ONE chain (a lone score edge cannot
    // chain), so chains[0] and chains[last] were the same row and the
    // assertion could never be true.
    const chains = composeCausalChains([
      // 3 hops
      edge('total_fairways_hit', 'total_gir'),
      edge('total_gir', 'total_putts'),
      edge('total_putts', 'score_to_par'),
      // 2 hops, sharing no metric with the above
      edge('penalty_strokes', 'double_bogey_rate'),
      edge('double_bogey_rate', 'round_variance'),
    ]);

    expect(chains.length).toBeGreaterThan(1);
    expect(chains[0]!.metrics.length).toBe(4);
    expect(chains[chains.length - 1]!.metrics.length).toBe(3);
    expect(chains[0]!.metrics.length).toBeGreaterThan(chains[chains.length - 1]!.metrics.length);
  });

  it('emits NOTHING when no two edges connect', () => {
    // The common production case today: four causes, all pointing at the score.
    // None of them chain, and inventing a link would be fabrication.
    const chains = composeCausalChains([
      edge('total_gir', 'score_to_par'),
      edge('total_putts', 'score_to_par'),
      edge('total_fairways_hit', 'score_to_par'),
      edge('rounds_per_week', 'score_to_par'),
    ]);

    expect(chains).toEqual([]);
  });

  it('never emits a single edge as a chain', () => {
    expect(composeCausalChains([edge('total_gir', 'total_putts')])).toEqual([]);
  });

  it('does not walk into a cycle', () => {
    // A -> B and B -> A are both plausible detections; the walk must terminate
    // and must not repeat a metric inside one chain.
    const chains = composeCausalChains([
      edge('total_gir', 'total_putts'),
      edge('total_putts', 'total_gir'),
    ]);

    for (const c of chains) {
      expect(new Set(c.metrics).size).toBe(c.metrics.length);
    }
  });

  it('carries the weakest hop as the chain confidence', () => {
    // A chain is only as trustworthy as its thinnest link — the same rule the
    // composite rules already apply to sample_n.
    const chains = composeCausalChains([
      edge('total_fairways_hit', 'total_gir', { confidence: 0.9 }),
      edge('total_gir', 'total_putts', { confidence: 0.4 }),
    ]);

    expect(chains[0]!.confidence).toBeCloseTo(0.4, 10);
  });

  it('ignores rows with a missing metric on either end', () => {
    const chains = composeCausalChains([
      edge('total_fairways_hit', 'total_gir', { effect_metric: null }),
      edge('total_gir', 'total_putts'),
    ]);
    expect(chains).toEqual([]);
  });
});

/**
 * PARALLEL EDGES — found 2026-08-18 by querying production after the composer
 * shipped, not by reading the code.
 *
 * `dedupeAndRank` in the read action keys on
 * `player_id|cause|effect|relationship_type`, so RELATIONSHIP TYPE is part of
 * the identity and two rows for the same metric pair both survive it. That is
 * not hypothetical:
 *
 *     player 654d35a1…  total_gir   -> score_to_par   direct AND mediated
 *     player 654d35a1…  total_putts -> score_to_par   direct AND mediated
 *
 * The walk treats those as two distinct edges, so a chain running through that
 * pair is emitted once per type — two cards whose every VISIBLE field is
 * identical, since the panel renders the metric path and never the type. Worse,
 * `CausalWhyPanel` keys chain cards on `metrics.join('>')`, which is the same
 * string for both: a duplicate React key on a live surface.
 *
 * Not live today — that player has no edge leading INTO total_gir or
 * total_putts, and Cole Bennett, the only player who currently chains at all,
 * has one row per pair. It becomes live the moment the engine detects one more
 * adjacent relationship for anyone who already carries a doubled pair.
 *
 * A chain is identified by the path it names. Two readings of the same path are
 * one chain, and the honest survivor is the better-supported one.
 */
describe('composeCausalChains — parallel edges are one chain, not two', () => {
  it('emits a single chain when a hop exists under two relationship types', () => {
    const chains = composeCausalChains([
      edge('total_fairways_hit', 'total_gir'),
      edge('total_gir', 'score_to_par', { id: 'gir-direct', relationship_type: 'direct', confidence: 0.6 }),
      edge('total_gir', 'score_to_par', { id: 'gir-mediated', relationship_type: 'mediated', confidence: 0.9 }),
    ]);

    expect(chains).toHaveLength(1);
    expect(chains[0]!.metrics).toEqual(['total_fairways_hit', 'total_gir', 'score_to_par']);
  });

  it('keeps the better-supported reading of a duplicated path', () => {
    const chains = composeCausalChains([
      edge('total_fairways_hit', 'total_gir'),
      edge('total_gir', 'score_to_par', { id: 'gir-direct', relationship_type: 'direct', confidence: 0.6 }),
      edge('total_gir', 'score_to_par', { id: 'gir-mediated', relationship_type: 'mediated', confidence: 0.9 }),
    ]);

    // Weakest hop of the surviving chain is min(0.8, 0.9) — the 0.6 reading lost.
    expect(chains[0]!.confidence).toBeCloseTo(0.8, 10);
  });

  it('gives every emitted chain a distinct metric path, so a key can be built from it', () => {
    const chains = composeCausalChains([
      edge('total_fairways_hit', 'total_gir'),
      edge('total_gir', 'total_putts', { id: 'putts-direct', relationship_type: 'direct' }),
      edge('total_gir', 'total_putts', { id: 'putts-mediated', relationship_type: 'mediated' }),
      edge('penalty_strokes', 'double_bogey_rate'),
      edge('double_bogey_rate', 'round_variance'),
    ]);

    const paths = chains.map((c) => c.metrics.join('>'));
    expect(new Set(paths).size).toBe(paths.length);
  });
});
