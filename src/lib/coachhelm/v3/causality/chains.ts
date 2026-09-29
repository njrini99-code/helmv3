/**
 * Compose a player's single-edge relationships into LINKED PATTERNS.
 *
 * ── HONEST CORRELATION (owner decision, 2026-09-28) ─────────────────────────
 *
 * Every edge is a same-round correlation, not a cause (deep audit rows 33/34).
 * A linked pattern is drawn only when:
 *
 *   - every hop carries correlation evidence and passes `correlation-gate.ts`
 *     (n >= 15, BH q < 0.05, |r| >= 0.3) — a pre-gate row cannot be a hop;
 *   - no hop is score arithmetic (a score component -> score_to_par);
 *   - the signs compose consistently: the product of the hop signs between
 *     any two nodes of the path must agree with every stored edge directly
 *     between those two nodes. On 2026-09-28 all 9 checkable triangles failed
 *     this (the indirect path had the opposite sign of the direct edge).
 *
 * The chain carries its composed `sign` and each hop's sign. It is presented
 * as a "linked pattern" to check, never a root cause: correlation is not
 * transitive and nothing here tests the path end to end.
 *
 * The history below explains why the composer exists.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 *
 * The engine detects one hop at a time, and 5,641 of 5,642 production rows end
 * at `score_to_par`. "Your GIR affects your score" is arithmetic — GIR is a
 * component of the score — so a coach reading the panel gets a restatement of
 * the scorecard rather than a diagnosis. Measured 2026-08-18 on Guilford:
 * 5 of 12 players have any active relationship, 7 get an empty panel, and only
 * one row on the whole roster has an effect that is not the score.
 *
 * Two adjacent edges now exist:
 *
 *     total_fairways_hit -> total_gir     (2026-08-17)
 *     total_gir          -> total_putts   (2026-08-18, ff87d8126)
 *
 * Composed they say something neither can alone: driving moves greens, greens
 * move putts. That is the sentence a coach needs — "his putting numbers look
 * like a putting problem; they are a driving problem."
 *
 * ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
 *
 * It invents nothing. A hop appears in a chain only if the engine independently
 * detected and confirmed that exact relationship FOR THAT PLAYER. This module
 * performs no statistics — it is a graph walk over rows that already passed the
 * engine's own significance gate. Transitivity of correlation is not guaranteed
 * in general, which is why `confidence` is the weakest hop rather than a
 * product, and why the caller is expected to present a chain as a hypothesis to
 * check rather than a proven mechanism.
 */

import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
import { isScoreArithmetic, passesCorrelationGate } from './correlation-gate';

export interface CausalChain {
  /** Metric ids in order, e.g. ['total_fairways_hit','total_gir','total_putts']. */
  metrics: string[];
  /** The rows traversed, in order. `hops.length === metrics.length - 1`. */
  hops: CausalRelationshipRow[];
  /**
   * The weakest hop's confidence. A chain is only as trustworthy as its
   * thinnest link — the same rule the composite rules apply to `sample_n`.
   * Deliberately NOT a product of the hop confidences: that would decay so fast
   * that every real chain looked worthless, and the honest claim here is "the
   * least certain step is this certain".
   */
  confidence: number;
  /** Weakest hop's strength, on the same reasoning. */
  strength: number;
  /** Sign of each hop's correlation, in order (+1 together, -1 opposite). */
  hopSigns: Array<1 | -1>;
  /** Composed sign: how the first and last metric move together if the links hold. */
  sign: 1 | -1;
}

type Edge = CausalRelationshipRow & { cause_metric: string; effect_metric: string };

function signOf(row: CausalRelationshipRow): 1 | -1 {
  return (row.correlation ?? 0) < 0 ? -1 : 1;
}

/** A row can be a hop only if it passed the honest-correlation gate and is not arithmetic. */
function isEligibleHop(r: CausalRelationshipRow): r is Edge {
  if (typeof r.cause_metric !== 'string' || r.cause_metric.length === 0) return false;
  if (typeof r.effect_metric !== 'string' || r.effect_metric.length === 0) return false;
  if (r.cause_metric === r.effect_metric) return false;
  if (isScoreArithmetic(r.cause_metric, r.effect_metric)) return false;
  if (r.correlation == null || r.sample_n == null || r.q_value == null) return false;
  return passesCorrelationGate({ r: r.correlation, n: r.sample_n, q: r.q_value });
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * True when every stored eligible edge between two nodes of the chain has the
 * sign the chain's hops compose to between those nodes.
 */
function signsConsistent(chain: CausalChain, signsByPair: Map<string, Set<1 | -1>>): boolean {
  const { metrics, hopSigns } = chain;
  for (let i = 0; i < metrics.length; i++) {
    let composed: 1 | -1 = 1;
    for (let j = i + 1; j < metrics.length; j++) {
      composed = (composed * hopSigns[j - 1]!) as 1 | -1;
      const direct = signsByPair.get(pairKey(metrics[i]!, metrics[j]!));
      if (!direct) continue;
      for (const s of direct) {
        if (s !== composed) return false;
      }
    }
  }
  return true;
}

/** Longest first; ties broken by confidence. */
function byDepthThenConfidence(a: CausalChain, b: CausalChain): number {
  if (b.metrics.length !== a.metrics.length) return b.metrics.length - a.metrics.length;
  return b.confidence - a.confidence;
}

/**
 * All maximal chains of length >= 2 hops that exist in `rows`.
 *
 * A single edge is never a chain — the panel already renders those, and
 * promoting one to "chain" would add a claim without adding evidence.
 */
export function composeCausalChains(rows: CausalRelationshipRow[]): CausalChain[] {
  // Only gated, non-arithmetic rows with both ends named can participate; a
  // null metric cannot be matched to anything without guessing.
  const edges = rows.filter(isEligibleHop);
  if (edges.length < 2) return [];

  const signsByPair = new Map<string, Set<1 | -1>>();
  for (const e of edges) {
    const key = pairKey(e.cause_metric, e.effect_metric);
    const set = signsByPair.get(key) ?? new Set<1 | -1>();
    set.add(signOf(e));
    signsByPair.set(key, set);
  }

  const outgoing = new Map<string, Edge[]>();
  for (const e of edges) {
    const list = outgoing.get(e.cause_metric) ?? [];
    list.push(e);
    outgoing.set(e.cause_metric, list);
  }

  const chains: CausalChain[] = [];

  const walk = (path: Edge[], visited: Set<string>): void => {
    const tail = path[path.length - 1]!;
    const next = (outgoing.get(tail.effect_metric) ?? []).filter(
      // `visited` is what stops a cycle — A->B->A terminates rather than
      // recursing, and no metric can appear twice inside one chain.
      (e) => !visited.has(e.effect_metric),
    );

    if (next.length === 0) {
      if (path.length >= 2) chains.push(toChain(path));
      return;
    }

    for (const e of next) {
      visited.add(e.effect_metric);
      walk([...path, e], visited);
      visited.delete(e.effect_metric);
    }
  };

  for (const start of edges) {
    walk([start], new Set([start.cause_metric, start.effect_metric]));
  }

  return dedupeByPath(chains.filter((c) => signsConsistent(c, signsByPair))).sort(
    byDepthThenConfidence,
  );
}

/**
 * One path, one chain.
 *
 * The same metric pair can be stored twice under different `relationship_type`s
 * — measured in production 2026-08-18, one player carries both
 * `total_gir -> score_to_par (direct)` and `total_gir -> score_to_par
 * (mediated)`, and the read action's dedupe keeps both because type is part of
 * its natural key. The walk then emits one chain per combination, and every
 * VISIBLE field of those chains is identical: the panel renders the metric
 * path and never the type. Two indistinguishable cards, and — since the panel
 * keys on the joined path — a duplicate React key.
 *
 * A chain is identified by the path it names, so the duplicates collapse. The
 * survivor is the better-supported reading: highest weakest-hop confidence,
 * then strength. Never the first one walked, which is just insertion order.
 */
function dedupeByPath(chains: CausalChain[]): CausalChain[] {
  const best = new Map<string, CausalChain>();
  for (const chain of chains) {
    const key = chain.metrics.join('>');
    const held = best.get(key);
    if (
      !held ||
      chain.confidence > held.confidence ||
      (chain.confidence === held.confidence && chain.strength > held.strength)
    ) {
      best.set(key, chain);
    }
  }
  return [...best.values()];
}

function toChain(path: Edge[]): CausalChain {
  const metrics = [path[0]!.cause_metric, ...path.map((e) => e.effect_metric)];
  const hopSigns = path.map(signOf);
  return {
    metrics,
    hops: [...path],
    confidence: Math.min(...path.map((e) => e.confidence)),
    strength: Math.min(...path.map((e) => e.strength)),
    hopSigns,
    sign: hopSigns.reduce<1 | -1>((acc, s) => (acc * s) as 1 | -1, 1),
  };
}
