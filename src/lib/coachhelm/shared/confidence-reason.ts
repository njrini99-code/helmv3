import { confidenceTier, type ConfidenceTier } from '@/lib/coachhelm/confidence-label';

/**
 * How sure a read is, in the words a coach reads (owner, READ-S1): "27 approaches. Enough for a solid read." The tier is the one
 * the read's own word comes from (confidence-label.ts), so this sentence and "Solid read" beside it can't disagree.
 */
export function sureSentence(sample: string, tier: ConfidenceTier | null): string {
  if (tier === 'solid') return `${sample}. Enough for a solid read.`;
  if (tier === 'early') return `${sample}. Enough for an early read.`;
  if (tier === 'thin') return `${sample}. Only a thin read so far.`;
  return `${sample}.`;
}

/**
 * The confidence reason a generator stores. Pure and sport-agnostic. It is shown to coaches, so it says nothing of how the blend
 * was made. A row with no blended confidence on it is tiered by its sample ramp, which is what most v3 confidence is anyway.
 */
export function buildConfidenceReason(evidence: { sample_n: number; confidence_factors: { sample_adequacy: number }; confidence?: number | null }): string {
  const n = evidence.sample_n;
  return sureSentence(`${n} observation${n === 1 ? '' : 's'}`, confidenceTier(evidence.confidence ?? evidence.confidence_factors.sample_adequacy));
}

/**
 * What generators store. Before READ-S1: "30 observations; recency/variance not measured (sample-adequacy only); sample 90% of target".
 * Since: `buildConfidenceReason`'s own sentence, which says nothing How sure doesn't, in that card's words and from the row's live tier.
 */
const ENGINE_TEXT = /\brecency\b|\bvariance\b|sample[- ]adequa|% of target|^\d+ observations?\./i;

/**
 * A stored reason a coach or player may read, or null. Rows keep the text they were written with until they are next refreshed, so
 * every surface reads the reason through this, and the engine's own bookkeeping (above) never reaches one, whole or in part.
 */
export function plainConfidenceReason(reason: string | null | undefined): string | null {
  const r = reason?.trim() ?? '';
  return r && !ENGINE_TEXT.test(r) ? r : null;
}
