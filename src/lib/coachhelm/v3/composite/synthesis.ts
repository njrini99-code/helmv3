/**
 * v3 composite synthesis runner (W28).
 *
 * Calls each rule.detect() with the player's recent Tier-1 insights,
 * applies conflict resolution (subset suppression per Part IX.3), and
 * upserts the matched composites via upsertInsightV3 (reuses W21's
 * dedup + v3:composite: signature space).
 *
 * Designed to run AFTER all Tier-1 generators complete — they need to
 * have written their rows for the rules to detect them.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { upsertInsightV3, GATED_OUT } from '@/lib/coachhelm/v3/insights/upsert-v3';
import { logServerError } from '@/lib/server-error-logger';
import { calcConfidence } from '@/lib/coachhelm/v2/insights/types';
import type { CausalityLevel, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { COMPOSITE_RULES } from './index';
import { loadRecentInsightsForPlayer } from './loader';
import { loadCompositeContext } from './hole-sequence-loader';
import type { CompositeMatch, CompositeRule, EvidenceInsight } from './types';

const COMPOSITE_PREFIX = 'composite';

/**
 * P0-06 composite confidence calibration.
 *
 * Composites combine TWO Tier-1 signals, so the joint evidence is thinner than
 * either source — use a 30-round target (matching putt-distance / course-mgmt,
 * the most common single-metric target) so `sample_adequacy` reflects the real
 * combined `sample_n` instead of the static 0.8 every rule used to hard-code.
 */
const COMPOSITE_TARGET_N = 30;

/**
 * Confidence ceiling for an `inferred_hypothesis` composite (P0-06). A cascade
 * synthesized from independent standings is a coach HYPOTHESIS, not a measured
 * fact — even a fully-sampled one must not present with the conviction of a
 * directly-measured single-metric leak. `observed_sequence` composites (the
 * cause was seen in an actual shot sequence) are NOT capped here.
 */
const INFERRED_CONFIDENCE_CEILING = 0.6;

/**
 * Diagnostic `strokes_impact` backfill for composites (tee-strat-1/lag3putt-3).
 *
 * Composite rules that don't compute their own leverage hard-code
 * `strokes_impact: 0` (bunker-miss-side, flyer-lie, lag-distance, long-approach-
 * 3putt-cascade, short-side-scrambling-chain, short-approach-proximity-gap).
 * They never run through the generator-base counterfactual backfill, so they
 * ship `strokes_impact = 0` and rank LAST on every flat surface (Hub card,
 * coach feed, digest) — under titles framed as urgent cascades.
 *
 * A composite is a synthesis of its source Tier-1 insights, whose
 * `evidence.strokes_impact` is itself counterfactual-derived (the H2 backfill).
 * So we backfill the composite from the MAX source `strokes_impact` — the
 * cascade is at least as costly as its strongest contributing leak, and MAX
 * (not SUM) avoids inflating leverage past any real per-round counterfactual
 * (respects the CF-1/CF-2 ceiling concern). Rules that DID compute a positive
 * leverage (front-9-starter, closing-hole-fatigue, doubles-after-bogey,
 * pressure-decel-chain) keep their own value. Ctx-driven composites with no
 * source insights (`source_insight_ids: []`) have nothing to borrow → unchanged.
 * Pure + exported for direct unit testing.
 */
export function backfilledCompositeStrokesImpact(
  composedImpact: number,
  sourceInsightIds: string[],
  impactBySourceId: Map<string, number>,
  ownMagnitudeFallback = 0,
): number {
  if (Number.isFinite(composedImpact) && composedImpact > 0) return composedImpact;
  let maxSource = 0;
  for (const id of sourceInsightIds) {
    const v = impactBySourceId.get(id);
    if (typeof v === 'number' && Number.isFinite(v) && v > maxSource) maxSource = v;
  }
  if (maxSource > 0) return maxSource;
  // Zero-source ctx composite with no borrowable leverage: use the rule's OWN
  // measured magnitude (a gap it already derived, e.g. proximity-over-Tour) so it
  // doesn't ship 0 and tie-break by recency. Never a fabricated constant.
  if (Number.isFinite(ownMagnitudeFallback) && ownMagnitudeFallback > 0) {
    return ownMagnitudeFallback;
  }
  return composedImpact;
}

/**
 * Build an `id → |strokes_impact|` lookup from the loaded source insights so the
 * composite backfill can borrow counterfactual-derived leverage from a
 * composite's source rows. Absolute value: a composite cascade is costing
 * strokes regardless of the sign convention on the underlying metric.
 */
export function buildSourceImpactLookup(insights: EvidenceInsight[]): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const i of insights) {
    const impact = i.evidence?.strokes_impact;
    if (typeof impact === 'number' && Number.isFinite(impact)) {
      lookup.set(i.id, Math.abs(impact));
    }
  }
  return lookup;
}

/**
 * Pick the widest source window (earliest start, latest end) across the
 * composite's source insights (P0-06). A composite spans whichever rounds its
 * contributing signals were drawn from, so its window should at least cover
 * theirs — the rules ship `window_start/end: ''`. Returns `null` when no source
 * carries a usable ISO window so the caller leaves the field untouched.
 * Pure + exported for direct unit testing.
 */
export function sourceWindowSpan(
  sourceInsightIds: string[],
  insights: EvidenceInsight[],
): { window_start: string; window_end: string } | null {
  const ids = new Set(sourceInsightIds);
  let start: string | null = null;
  let end: string | null = null;
  for (const i of insights) {
    if (!ids.has(i.id)) continue;
    const ws = i.evidence?.window_start;
    const we = i.evidence?.window_end;
    if (typeof ws === 'string' && ws && (start === null || ws < start)) start = ws;
    if (typeof we === 'string' && we && (end === null || we > end)) end = we;
  }
  if (start === null && end === null) return null;
  return { window_start: start ?? '', window_end: end ?? '' };
}

/**
 * P0-06 — calibrate a composite's confidence down to what the evidence actually
 * supports, and copy real windows from its source insights.
 *
 * Composites bypass `BaseGenerator.run()` (the synthesis runner calls
 * `rule.compose()` then upserts directly), so they never got the honesty
 * treatment generators do. Every composite hard-coded
 * `{ sample_adequacy: 0.8, recency: 1.0, variance: 0.5 }`, which `calcConfidence`
 * blended into a fabricated 0.77 — over-confident for what is usually a
 * hypothesis built from two independent standings.
 *
 * This normalization:
 *   1. Recomputes `sample_adequacy` HONESTLY from the composite's real combined
 *      `sample_n` (vs `COMPOSITE_TARGET_N`) instead of the static 0.8.
 *   2. Forces `factors_measured: false` — a composite has no per-round
 *      dispersion, so recency/variance are placeholders. `calcConfidence` then
 *      drops the fabricated +0.45 blend and surfaces honest sample-adequacy.
 *   3. Defaults `causality_level` to `inferred_hypothesis` unless a rule proved
 *      an observed sequence — most composites are hypotheses.
 *   4. CAPS the confidence of an inferred chain at `INFERRED_CONFIDENCE_CEILING`
 *      so it never reads as a measured fact. An `observed_sequence` chain keeps
 *      its honest sample-adequacy confidence (no cap).
 *   5. Copies the widest source window into empty composite windows.
 *
 * Pure + exported for direct unit testing.
 */
export function normalizeCompositeEvidence(
  evidence: InsightEvidence,
  sourceWindow: { window_start: string; window_end: string } | null,
): InsightEvidence {
  const clamp01 = (n: number): number =>
    !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n;

  const causality_level: CausalityLevel = evidence.causality_level ?? 'inferred_hypothesis';

  const sampleN = Number.isFinite(evidence.sample_n) ? evidence.sample_n : 0;
  let sampleAdequacy = clamp01(sampleN / COMPOSITE_TARGET_N);
  // The inferred-hypothesis ceiling must be DURABLE: upsertInsight recomputes
  // confidence from confidence_factors alone (it ignores the `confidence` field
  // we set). In honest mode (factors_measured:false, recency>=1) calcConfidence
  // returns ~min(1, sample_adequacy), so capping sample_adequacy itself is what
  // makes the ceiling stick through the recompute — not just the local value.
  if (causality_level === 'inferred_hypothesis') {
    sampleAdequacy = Math.min(sampleAdequacy, INFERRED_CONFIDENCE_CEILING);
  }

  // Composites never carry genuine per-round dispersion: flag the static
  // recency/variance as unmeasured so calcConfidence does the honest thing.
  const confidence_factors = {
    ...evidence.confidence_factors,
    sample_adequacy: sampleAdequacy,
    factors_measured: false as const,
  };

  // Honest base confidence (honest mode → ~min(1, sample_adequacy)). The cap is
  // already baked into sample_adequacy above so this matches the upsert recompute.
  const confidence = calcConfidence({ confidence_factors });

  // Copy source windows only into empty slots — never clobber a window a rule
  // actually set.
  const window_start =
    evidence.window_start && evidence.window_start.length > 0
      ? evidence.window_start
      : sourceWindow?.window_start ?? evidence.window_start;
  const window_end =
    evidence.window_end && evidence.window_end.length > 0
      ? evidence.window_end
      : sourceWindow?.window_end ?? evidence.window_end;

  return {
    ...evidence,
    confidence_factors,
    confidence,
    causality_level,
    window_start,
    window_end,
  };
}

/**
 * True when `candidateIds` is a strict, NON-EMPTY subset of `otherIds` — i.e.
 * another composite that fired already covers exactly these source insights.
 *
 * The `length > 0` guard is load-bearing: ctx-driven composites (closing-hole-
 * fatigue, doubles-after-bogey, front-9-starter, short-side-scrambling-chain,
 * flyer-lie-over-the-green) read raw round/shot data and carry
 * `source_insight_ids: []`. An empty array `.every()`s as a vacuous subset of
 * every set, so without this guard a single insight-driven composite would
 * suppress ALL ctx composites — silently deleting correct insights (and whole
 * outcome themes that gate to empty when they have no causes). Exported so the
 * conflict-resolution contract is unit-tested directly, not reimplemented.
 */
export function isSubsumedBy(candidateIds: string[], otherIds: string[]): boolean {
  return (
    candidateIds.length > 0 &&
    candidateIds.length < otherIds.length &&
    candidateIds.every((id) => otherIds.includes(id))
  );
}

/**
 * True when two composites name at least one common source insight id. The
 * `length > 0` guard on EACH side is load-bearing: ctx composites carry
 * `source_insight_ids: []`, and `[]` shares nothing with anything — two ctx
 * cascades (closing-hole-fatigue, front-9-starter) must stay independent.
 */
export function sharesSource(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((id) => set.has(id));
}

/**
 * Collapse composites that SHARE >=1 source insight to the single highest-impact
 * one — a stricter sibling of `isSubsumedBy` (which only catches strict subsets).
 * Order-independent + deterministic: on an impact tie the lexically-smaller id
 * wins. Disjoint (incl. all ctx) composites pass through. Generic over the match
 * shape so it is unit-tested in isolation.
 */
export function dedupeBySharedSource<T>(
  items: T[],
  idsOf: (item: T) => string[],
  impactOf: (item: T) => number,
): T[] {
  // Stable identity for tiebreaking: serialize the whole item so two distinct
  // objects are always distinguishable even when their source-ids are identical.
  const keyOf = (item: T): string => JSON.stringify(item);
  const kept: T[] = [];
  for (const cand of items) {
    const clashIdx = kept.findIndex((k) => sharesSource(idsOf(cand), idsOf(k)));
    if (clashIdx === -1) {
      kept.push(cand);
      continue;
    }
    // clashIdx !== -1, so the element exists — the non-null assertion is safe.
    const incumbent = kept[clashIdx] as T;
    const candWins =
      impactOf(cand) > impactOf(incumbent) ||
      (impactOf(cand) === impactOf(incumbent) && keyOf(cand) < keyOf(incumbent));
    if (candWins) kept[clashIdx] = cand;
  }
  return kept;
}

export interface SynthesisResult {
  player_id: string;
  rule_matches: number;
  rule_suppressed: number;
  rule_emitted: number;
  errors: number;
  /** Stale composite rows archived by the post-run scope sweep (regrade LIFE-P2). */
  stale_retracted?: number;
}

/**
 * Run synthesis for one player. Idempotent — upsertInsightV3's dedup
 * means re-running this on the same player produces the same outcome.
 */
export async function synthesizeForPlayer(playerId: string): Promise<SynthesisResult> {
  const result: SynthesisResult = {
    player_id: playerId,
    rule_matches: 0,
    rule_suppressed: 0,
    rule_emitted: 0,
    errors: 0,
  };

  let insights;
  try {
    insights = await loadRecentInsightsForPlayer(playerId);
  } catch (err) {
    await logServerError(
      `synthesizeForPlayer: load failed for ${playerId}: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.composite.synthesis.load' },
    );
    result.errors += 1;
    return result;
  }
  // P2-20: do NOT early-return when there are no Tier-1 insights. Several
  // composites are CONTEXT-ONLY (closing-hole fatigue, front-9 starter,
  // doubles-after-bogey, short-side scrambling) — they detect() off raw
  // hole/shot context and ignore `insights` entirely. Bailing here meant a
  // player with rich shot data but no Tier-1 rows produced zero composites.
  // Insight-driven rules safely no-op on an empty `insights` array (they
  // filter for matching insight types and find none), so it is correct to
  // fall through and let every rule see the loaded ctx below.

  // W30.5: pre-load hole-sequence + lie-typed shot context once so rules
  // that need raw data (closing-hole fatigue, doubles-after-bogey, etc.)
  // don't each hit the DB. Failure-isolated — empty arrays on error so
  // those rules quietly no-op.
  let ctx;
  try {
    ctx = await loadCompositeContext(playerId);
  } catch (err) {
    await logServerError(
      `synthesizeForPlayer: ctx load failed for ${playerId}: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.composite.synthesis.ctx' },
    );
    ctx = { hole_scores: [], short_game_shots: [], flyer_lie_shots: [] };
  }

  // Pass 1: collect all matches with their owning rule.
  const matches: Array<{ rule: CompositeRule; match: CompositeMatch }> = [];
  for (const rule of COMPOSITE_RULES) {
    try {
      const m = rule.detect(insights, ctx);
      if (m) matches.push({ rule, match: m });
    } catch (err) {
      await logServerError(
        `synthesizeForPlayer: rule ${rule.id} detect threw for ${playerId}: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'v3.composite.synthesis.detect' },
      );
      result.errors += 1;
    }
  }
  result.rule_matches = matches.length;
  if (matches.length === 0) return result;

  // Pass 2: conflict resolution per Part IX.3. If rule B's
  // source_insight_ids ⊂ rule A's source_insight_ids and BOTH fired,
  // suppress B (A covers it). See `isSubsumedBy` for the empty-array guard.
  const survivors: typeof matches = [];
  for (const candidate of matches) {
    const isSubsumed = matches.some(
      (other) =>
        other !== candidate &&
        isSubsumedBy(candidate.match.source_insight_ids, other.match.source_insight_ids),
    );
    if (isSubsumed) {
      result.rule_suppressed += 1;
    } else {
      survivors.push(candidate);
    }
  }

  // Pass 2b: SAME-SOURCE dedup. `isSubsumedBy` only suppresses strict subsets;
  // two composites that merely SHARE a source insight (e.g. lag_3putt and
  // pressure_decel both naming the 3-5 ft putt row) would otherwise both surface
  // and double-narrate one leak. Keep the higher-impact one, sized by the same
  // backfilled leverage we will upsert (so the kept choice matches what ranks).
  const impactBySourceId = buildSourceImpactLookup(insights);
  const impactOf = (m: { rule: CompositeRule; match: CompositeMatch }): number =>
    backfilledCompositeStrokesImpact(
      m.rule.compose(m.match).evidence.strokes_impact,
      m.match.source_insight_ids,
      impactBySourceId,
    );
  const deduped = dedupeBySharedSource(
    survivors,
    (m) => m.match.source_insight_ids,
    impactOf,
  );
  result.rule_suppressed += survivors.length - deduped.length;

  // Pass 3: upsert each survivor.
  const supabase = createAdminClient();
  const emittedSignatures = new Set<string>();
  for (const { rule, match } of deduped) {
    try {
      const composed = rule.compose(match);
      const strokesImpact = backfilledCompositeStrokesImpact(
        composed.evidence.strokes_impact,
        match.source_insight_ids,
        impactBySourceId,
        Math.abs(Number(composed.evidence.strokes_impact ?? 0)),
      );
      // P0-06: calibrate the composite's confidence down to its real evidence
      // (honest sample-adequacy + inferred-hypothesis ceiling) and copy the
      // source insight windows in. Must run on the evidence we actually upsert.
      const calibrated = normalizeCompositeEvidence(
        { ...composed.evidence, strokes_impact: strokesImpact },
        sourceWindowSpan(match.source_insight_ids, insights),
      );
      const evidence = {
        ...calibrated,
        composite_rule_id: rule.id,
        source_insight_ids: match.source_insight_ids,
      };
      const sig = `${COMPOSITE_PREFIX}:${rule.id}:${composed.signature}`;
      // Track BEFORE the gate check: a philosophy-gated match still owns its
      // signature — the sweep must not archive an existing row just because
      // the gate suppressed this run's refresh (mirrors BaseGenerator).
      emittedSignatures.add(`v3:${sig}`);
      const upsertResult = await upsertInsightV3(supabase, {
        player_id: playerId,
        category: rule.category,
        insight_type: 'composite',
        signature: `v3:${sig}`,
        title: composed.title,
        content: composed.content,
        priority: rule.priority,
        evidence: evidence as typeof composed.evidence,
      });
      if (upsertResult !== GATED_OUT) {
        result.rule_emitted += 1;
      }
    } catch (err) {
      await logServerError(
        `synthesizeForPlayer: rule ${rule.id} compose/upsert threw for ${playerId}: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'v3.composite.synthesis.upsert' },
      );
      result.errors += 1;
    }
  }

  // Stale-composite scope sweep (regrade LIFE-P2 / NEW-P2): composite
  // signatures embed data-derived suffixes (decel band, bunker side), so a
  // band move / side flip left the superseded sibling coach-visible, and a
  // dequalified rule's row had NO retirement path at all — the exact gap
  // BaseGenerator.signatureScope closed for the 9 generator families. Mirror
  // that sweep across the whole per-player `v3:composite:` space, but ONLY on
  // a fully clean run (errors === 0): a rule that threw is an infra failure,
  // not dequalification, and must not archive anything (NEW-P1 contract).
  if (result.errors === 0) {
    try {
      const nowIso = new Date().toISOString();
      const { data: rows, error: selErr } = await supabase
        .from('golf_coach_insights')
        .select('id, signature, metadata, lifecycle_state')
        .eq('player_id', playerId)
        .like('signature', `v3:${COMPOSITE_PREFIX}:%`)
        .in('lifecycle_state', ['tentative', 'detected'])
        .eq('status', 'active')
        .is('acknowledged_at', null)
        .is('addressed_at', null);
      if (selErr) throw new Error(selErr.message);
      const stale = (rows ?? []).filter(
        (r) => typeof r.signature === 'string' && !emittedSignatures.has(r.signature),
      );
      let retracted = 0;
      for (const r of stale) {
        const metadata = {
          ...((r.metadata as Record<string, unknown> | null) ?? {}),
          archived_by: 'composite-scope-sweep',
          archive_reason: `not-reemitted:${r.signature}`,
          retracted_at: nowIso,
        };
        const { error } = await supabase
          .from('golf_coach_insights')
          .update({
            lifecycle_state: 'archived',
            archived_at: nowIso,
            updated_at: nowIso,
            metadata,
          })
          .eq('id', r.id)
          .eq('lifecycle_state', r.lifecycle_state);
        if (!error) retracted += 1;
      }
      result.stale_retracted = retracted;
    } catch (err) {
      await logServerError(
        `synthesizeForPlayer: stale-composite sweep failed for ${playerId}: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'v3.composite.synthesis.sweep' },
      );
      // Sweep failure must not fail the synthesis run that emitted insights.
    }
  }

  return result;
}
