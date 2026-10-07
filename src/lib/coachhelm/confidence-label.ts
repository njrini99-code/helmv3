/**
 * Player-facing confidence as a word, never a percentage.
 *
 * Most CoachHelm `confidence` values are a sample-size ramp, e.g.
 * `min(n / 30, 1)` in v3/generators/putt-distance.ts. Printed as "100%
 * confidence" that read as certainty about the claim, when it only means
 * "30+ attempts". The numeric value still drives ranking (impact × confidence);
 * only the display changes.
 */

export type ConfidenceTier = 'solid' | 'early' | 'thin';

/** At or above this, the read is "Solid". Matches EvidencePanel's green tier. */
export const SOLID_READ_MIN_CONFIDENCE = 0.7;
/** At or above this, "Early"; below it, "Thin". Matches the amber/gray split. */
export const EARLY_READ_MIN_CONFIDENCE = 0.4;

const TIER_WORD: Record<ConfidenceTier, string> = {
  solid: 'Solid read',
  early: 'Early read',
  thin: 'Thin read',
};

/** Accepts 0..1 or 0..100. Non-finite → null. */
export function confidenceTier(confidence: number | null | undefined): ConfidenceTier | null {
  if (confidence == null || !Number.isFinite(confidence)) return null;
  const c = confidence > 1 ? confidence / 100 : confidence;
  if (c >= SOLID_READ_MIN_CONFIDENCE) return 'solid';
  if (c >= EARLY_READ_MIN_CONFIDENCE) return 'early';
  return 'thin';
}

/**
 * "Solid read", "Early read", or "Thin read, n=8". The sample size is shown
 * only on a thin read, where it is the reason to be careful.
 */
export function confidenceLabel(
  confidence: number | null | undefined,
  sampleN?: number | null,
): string | null {
  const tier = confidenceTier(confidence);
  if (tier === null) return null;
  const word = TIER_WORD[tier];
  if (tier === 'thin' && sampleN != null && Number.isFinite(sampleN) && sampleN > 0) {
    return `${word}, n=${Math.round(sampleN)}`;
  }
  return word;
}
