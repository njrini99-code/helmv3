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
import { COMPOSITE_RULES } from './index';
import { loadRecentInsightsForPlayer } from './loader';
import { loadCompositeContext } from './hole-sequence-loader';
import type { CompositeMatch, CompositeRule, EvidenceInsight } from './types';

const COMPOSITE_PREFIX = 'composite';

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
): number {
  if (Number.isFinite(composedImpact) && composedImpact > 0) return composedImpact;
  let maxSource = 0;
  for (const id of sourceInsightIds) {
    const v = impactBySourceId.get(id);
    if (typeof v === 'number' && Number.isFinite(v) && v > maxSource) maxSource = v;
  }
  return maxSource > 0 ? maxSource : composedImpact;
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

export interface SynthesisResult {
  player_id: string;
  rule_matches: number;
  rule_suppressed: number;
  rule_emitted: number;
  errors: number;
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
  if (insights.length === 0) return result;

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

  // Pass 3: upsert each survivor. Build the source-impact lookup once so the
  // strokes_impact backfill can borrow counterfactual-derived leverage from
  // each composite's source insights (see backfilledCompositeStrokesImpact).
  const impactBySourceId = buildSourceImpactLookup(insights);
  const supabase = createAdminClient();
  for (const { rule, match } of survivors) {
    try {
      const composed = rule.compose(match);
      const strokesImpact = backfilledCompositeStrokesImpact(
        composed.evidence.strokes_impact,
        match.source_insight_ids,
        impactBySourceId,
      );
      const evidence = {
        ...composed.evidence,
        strokes_impact: strokesImpact,
        composite_rule_id: rule.id,
        source_insight_ids: match.source_insight_ids,
      };
      const sig = `${COMPOSITE_PREFIX}:${rule.id}:${composed.signature}`;
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

  return result;
}
