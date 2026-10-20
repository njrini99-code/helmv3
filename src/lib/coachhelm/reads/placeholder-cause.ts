/**
 * The cause line `buildDiagnosis` (v3/engine/generator-base.ts) writes on every single-metric v3 row: "<metric> is off its benchmark.
 * Likely cause inferred from the aggregate, not a measured shot sequence". It states no cause. It is the same sentence on 420 of the
 * 572 reads a production check counted on 2026-10-19, so a surface that prints it as a diagnosis teaches coaches to skip the why.
 * Pure: text in, boolean out. Keep the pattern in step with that template; the test pins both.
 */
const PLACEHOLDER_CAUSE = /\bis off its benchmark\.\s*Likely cause inferred from the aggregate, not a measured shot sequence\.?$/i;

/** True for the generators' placeholder cause (never for a measured or hand-written one). */
export function isPlaceholderCause(text: string | null | undefined): boolean {
  return typeof text === 'string' && PLACEHOLDER_CAUSE.test(text.trim());
}
