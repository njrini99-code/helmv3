/**
 * CoachHelm BASEBALL multi-factor signal ranking (V10).
 *
 * docs/.../25_premium_ui_coachhelm_v10 §"Ranking Model". Signals compete for a
 * coach's limited attention, so they must be RANKED — not just listed by
 * created_at. The V10 ranking blends, per the spec:
 *
 *   PROMOTE: severity, source confidence, recency, role relevance, repeated
 *            trend (matured), measurable next action, safety/readiness risk,
 *            import blocking trusted stats, proximity to next game/practice.
 *   DEMOTE:  low confidence, no action path, stale source, duplicate, source-
 *            starved (thin) claim.
 *
 * This module is PURE: it scores a candidate from its already-computed fields
 * (priority, confidence, evidence, generator) + light context (is it a composite,
 * does it have video, days to next event). The action computes a `rank_score`
 * and writes it so every surface orders identically. Nothing here re-derives
 * confidence or direction — it only WEIGHS what the generators already produced.
 */

import type { InsightPriority } from '@/lib/coachhelm/shared/evidence-types';
import type { BaseballInsightCandidate } from './generators';

/** Severity weight — the dominant term. */
const PRIORITY_WEIGHT: Record<InsightPriority, number> = {
  urgent: 100,
  high: 70,
  medium: 40,
  low: 15,
};

/**
 * Domain → role-relevance weight. Safety/readiness + import-blocking signals are
 * promoted (they gate other work); descriptive operational coverage is demoted.
 * Keyed by the generator id family so a new generator slots in by intent.
 */
const GENERATOR_ROLE_WEIGHT: Record<string, number> = {
  // safety / readiness risk — top of the spec's PROMOTE list
  composite_lift_to_field_risk: 24,
  readiness: 20,
  workload: 18,
  composite_command_decay: 18,
  lift_rpe_spike: 12,
  // import blocking trusted stats — promote (it poisons everything downstream)
  import_quality: 22,
  // schedule conflict — deterministic + time-bound, promote
  schedule_conflict: 16,
  // performance composites + single-metric performance
  composite_translation_gap: 14,
  velo_command_decay: 12,
  two_strike_chase: 8,
  game_vs_practice_gap: 8,
  lift_compliance: 8,
  // effectiveness / coverage = lower-urgency operational
  practice_effectiveness: 6,
  video_evidence: 4,
};

/** Light, optional context the action can supply to sharpen ranking. */
export interface RankingContext {
  /** Days until the player's next game/practice (null = unknown). */
  daysToNextEvent?: number | null;
  /** Lifecycle state of the existing row, if this is a refresh of one. */
  lifecycleState?: string | null;
  /** Does the candidate already have linked video evidence? */
  hasVideo?: boolean;
  /** Is this a duplicate of a higher-ranked candidate this run? */
  isDuplicate?: boolean;
}

/**
 * Score a single candidate. Higher = more attention-worthy. Deterministic +
 * bounded so two runs over the same data rank identically.
 */
export function scoreBaseballCandidate(
  c: BaseballInsightCandidate,
  ctx: RankingContext = {},
): number {
  let score = PRIORITY_WEIGHT[c.priority];

  // Source confidence — promote trusted signals (0..20).
  score += Math.round(c.confidence * 20);

  // Role relevance / safety promotion.
  score += GENERATOR_ROLE_WEIGHT[c.generator] ?? 6;

  // Composites prove a cross-domain pattern → small promotion over single-metric.
  if (c.generator.startsWith('composite_')) score += 8;

  // Repeated/validated trend (matured) → promote; tentative → slight demote.
  if (ctx.lifecycleState === 'matured') score += 10;
  else if (ctx.lifecycleState === 'tentative') score -= 6;

  // Observed-fact signals (counted, not inferred) are more trustworthy → promote.
  if (c.evidence.causality_level === 'observed_sequence') score += 6;

  // Proximity to next game/practice — a flag mattering for tomorrow ranks above
  // the same flag two weeks out. Only applies to player-scoped signals.
  if (c.playerId && typeof ctx.daysToNextEvent === 'number') {
    if (ctx.daysToNextEvent <= 1) score += 12;
    else if (ctx.daysToNextEvent <= 3) score += 6;
  }

  // DEMOTE: source-starved / thin claim (sample below target) — the spec's
  // "source-starved claim" demotion, on top of the priority clamp upstream.
  if (c.evidence.target_n > 0 && c.evidence.sample_n < c.evidence.target_n) {
    const shortfall = 1 - c.evidence.sample_n / c.evidence.target_n;
    score -= Math.round(shortfall * 12);
  }

  // DEMOTE: no actionable next step (a diagnosis without a recommended action).
  if (!c.evidence.diagnosis.recommended_action?.trim()) score -= 15;

  // DEMOTE: duplicate of a higher candidate this run.
  if (ctx.isDuplicate) score -= 30;

  // PROMOTE: evidence-backed (has video) signals are easier to act on.
  if (ctx.hasVideo) score += 5;

  return Math.max(0, score);
}

/** A candidate paired with its computed rank score, for write + ordering. */
export interface RankedBaseballCandidate {
  candidate: BaseballInsightCandidate;
  rankScore: number;
}

/**
 * Rank a full set of candidates. Marks intra-run duplicates (same generator +
 * player) so only the strongest of a duplicate group keeps its full score, then
 * sorts descending. Pure.
 */
export function rankBaseballCandidates(
  candidates: BaseballInsightCandidate[],
  contextFor?: (c: BaseballInsightCandidate) => RankingContext,
): RankedBaseballCandidate[] {
  // Identify duplicates: same (generator, playerId) — keep the highest-priority
  // one at full score, demote the rest.
  const seen = new Map<string, number>(); // key -> best priority weight so far
  const keyOf = (c: BaseballInsightCandidate) => `${c.generator}:${c.playerId ?? 'team'}`;
  for (const c of candidates) {
    const k = keyOf(c);
    const w = PRIORITY_WEIGHT[c.priority];
    if (!seen.has(k) || w > seen.get(k)!) seen.set(k, w);
  }
  const usedBest = new Set<string>();

  const ranked = candidates.map((c) => {
    const k = keyOf(c);
    const baseCtx = contextFor?.(c) ?? {};
    // Mark all but the first best-priority occurrence as duplicate.
    let isDuplicate = false;
    if (PRIORITY_WEIGHT[c.priority] === seen.get(k)) {
      if (usedBest.has(k)) isDuplicate = true;
      else usedBest.add(k);
    } else {
      isDuplicate = true;
    }
    return {
      candidate: c,
      rankScore: scoreBaseballCandidate(c, { ...baseCtx, isDuplicate: baseCtx.isDuplicate ?? isDuplicate }),
    };
  });

  return ranked.sort((a, b) => b.rankScore - a.rankScore);
}
