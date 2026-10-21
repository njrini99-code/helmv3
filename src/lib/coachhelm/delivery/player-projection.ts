/**
 * What a player's own feed may carry of a read's evidence (CoachHelm Slice 1b,
 * post-merge review finding 8).
 *
 * The support pass (`v3/support/run-pass.ts`, flag `coachhelm_support_v1`)
 * merges the claim ladder and its statistics into `evidence`: the rung, the
 * reasons a read was held back, the q value, the shrunk strokes. Those are
 * the coach's audit material (02 §6: Working hypothesis is coach only), and no
 * player renderer reads them, but the player feed returns evidence verbatim.
 * This projection drops them where player-facing evidence leaves the server.
 *
 * A row the pass never stamped (every row while the flag is off) comes back
 * as the same object, so flag-off output is unchanged.
 *
 * Pure.
 */

/** Evidence keys written by the support pass that a player never receives. */
export const PLAYER_HIDDEN_EVIDENCE_KEYS = [
  'support',
  'ladder',
  'what_ladder',
  'ladder_reasons',
  'strokes_shrunk',
  'shrink',
] as const;

function hasHiddenKey(evidence: object): boolean {
  return PLAYER_HIDDEN_EVIDENCE_KEYS.some((k) => Object.hasOwn(evidence, k));
}

/** The insight with the support pass's coach-only evidence keys removed. */
export function projectInsightForPlayer<T extends { evidence: unknown }>(insight: T): T {
  const evidence = insight.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) || !hasHiddenKey(evidence)) {
    return insight;
  }
  const kept: Record<string, unknown> = { ...(evidence as Record<string, unknown>) };
  for (const k of PLAYER_HIDDEN_EVIDENCE_KEYS) delete kept[k];
  return { ...insight, evidence: kept as T['evidence'] };
}

export function projectInsightsForPlayer<T extends { evidence: unknown }>(insights: readonly T[]): T[] {
  return insights.map(projectInsightForPlayer);
}
