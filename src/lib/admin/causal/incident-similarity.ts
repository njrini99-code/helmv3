/**
 * Incident similarity — over `aliases.ts`'s structural fingerprints, never
 * over free-text message similarity alone.
 *
 * `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §6 J.4.
 * `src/lib/admin/incidents/aliases.ts`'s `classifyMergeConfidence` already
 * decides, PAIRWISE, whether two incident-shaped records are the same root
 * cause — by construction it never reads `message`/`source`/`userId` as a
 * merge key (see that file's own header: "THE NEVER-MERGE RULES ARE
 * ENFORCED BY OMISSION"). This module is the SAME classifier used for a
 * different question: given one target incident and a corpus of others,
 * rank the corpus by how similar each one is, instead of partitioning a
 * batch into groups.
 *
 * WHY THIS DOES NOT MINE `memory/incidents/**\/INC-*.md`. That corpus was
 * inspected directly before writing this module: 11 files, each a hand-
 * written prose write-up with a small `Feature:`/`Status:`/`Risk:`/
 * `First seen:` header and no parseable `helmTraceId`/`sentryTraceId`/
 * `canonicalFingerprint`/`rpc`+`errorCode` fields — the exact shape
 * `MergeCandidateFacts` needs. Forcing those files into that shape would
 * mean either fabricating fields this classifier was built specifically
 * never to invent, or feeding it all-null facts that trivially classify as
 * `'none'` for every pair — false, confident-looking emptiness rather than
 * an honest gap. `MergeCandidateFacts` is the shape `correlate.ts`'s own
 * output (`UnifiedIncident`) already carries at runtime — a real trace id,
 * RPC, error code and feature id per record — which is where this module's
 * corpus is meant to come from once a caller wires it up, not from the
 * markdown write-up corpus.
 *
 * PURE. No I/O — reuses `classifyMergeConfidence` exactly as `aliases.ts`
 * exports it; this file adds no new comparison logic of its own.
 */

import {
  classifyMergeConfidence,
  type ClassifyOptions,
  type MergeCandidateFacts,
  type MergeConfidenceTier,
} from '@/lib/admin/incidents/aliases';

export interface SimilarIncidentMatch {
  candidate: MergeCandidateFacts;
  tier: Exclude<MergeConfidenceTier, 'none'>;
  reason: string;
  matchedOn: readonly string[];
}

/**
 * Ranks `corpus` by similarity to `target`, highest tier first (ties broken
 * by the corpus's own input order — deterministic, no hidden secondary
 * sort). Every `'none'` classification is dropped rather than returned at
 * the bottom of the list — a caller asking "what's similar to this" should
 * never have to filter out "not similar" results themselves.
 *
 * The target itself is excluded from its own corpus by id, so a caller may
 * safely pass the full incident set including the target without a
 * pre-filter.
 */
export function findSimilarIncidents(
  target: MergeCandidateFacts,
  corpus: readonly MergeCandidateFacts[],
  options: ClassifyOptions = {},
): SimilarIncidentMatch[] {
  const matches: SimilarIncidentMatch[] = [];

  for (const candidate of corpus) {
    if (candidate.id === target.id) continue;
    const decision = classifyMergeConfidence(target, candidate, options);
    if (decision.tier === 'none') continue;
    matches.push({
      candidate,
      tier: decision.tier,
      reason: decision.reason,
      matchedOn: decision.matchedOn,
    });
  }

  const TIER_RANK: Record<Exclude<MergeConfidenceTier, 'none'>, number> = { highest: 0, medium: 1 };
  return matches
    .map((m, index) => ({ m, index }))
    .sort((a, b) => TIER_RANK[a.m.tier] - TIER_RANK[b.m.tier] || a.index - b.index)
    .map(({ m }) => m);
}
