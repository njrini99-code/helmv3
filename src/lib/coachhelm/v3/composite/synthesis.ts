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
import type { CompositeMatch, CompositeRule } from './types';

const COMPOSITE_PREFIX = 'composite';

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

  // Pass 1: collect all matches with their owning rule.
  const matches: Array<{ rule: CompositeRule; match: CompositeMatch }> = [];
  for (const rule of COMPOSITE_RULES) {
    try {
      const m = rule.detect(insights);
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
  // source_insight_ids ⊆ rule A's source_insight_ids and BOTH fired,
  // suppress B (A covers it).
  const survivors: typeof matches = [];
  for (const candidate of matches) {
    const isSubsumed = matches.some(
      (other) =>
        other !== candidate &&
        candidate.match.source_insight_ids.length < other.match.source_insight_ids.length &&
        candidate.match.source_insight_ids.every((id) =>
          other.match.source_insight_ids.includes(id),
        ),
    );
    if (isSubsumed) {
      result.rule_suppressed += 1;
    } else {
      survivors.push(candidate);
    }
  }

  // Pass 3: upsert each survivor.
  const supabase = createAdminClient();
  for (const { rule, match } of survivors) {
    try {
      const composed = rule.compose(match);
      const evidence = {
        ...composed.evidence,
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
