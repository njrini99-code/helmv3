/**
 * The cause line the v3 generators write on single-metric rows: "<metric> is off its benchmark. Likely cause inferred from the
 * aggregate, not a measured shot sequence" (`buildDiagnosis` in v3/engine/generator-base.ts). It states no cause. Production holds
 * two spellings of it: the current one, with a full stop (314 rows on 2026-10-20), and an older one with a dash and a lower-case
 * "likely" (441 rows). Both are matched, so a surface that prints either as a diagnosis no longer teaches coaches to skip the why.
 * Pure: text in, boolean out. The test pins both spellings.
 */
const PLACEHOLDER_CAUSE =
  /\bis off its benchmark\s*(?:[.,;:\u2013\u2014-])\s*likely cause inferred from the aggregate, not a measured shot sequence\.?$/i;

/** True for the generators' placeholder cause (never for a measured or hand-written one). */
export function isPlaceholderCause(text: string | null | undefined): boolean {
  return typeof text === 'string' && PLACEHOLDER_CAUSE.test(text.trim());
}

/** The placeholder anywhere in a longer text: its own two sentences, with the metric label that opens them. */
const PLACEHOLDER_IN_TEXT = new RegExp(`[^.!?]*${PLACEHOLDER_CAUSE.source.replace(/\$$/, '')}`, 'gi');

/** The text without the placeholder cause, so a card that prints the rest of a row's prose never prints it either. */
export function withoutPlaceholderCause(text: string | null | undefined): string {
  return (text ?? '').replace(PLACEHOLDER_IN_TEXT, '').replace(/\s+/g, ' ').trim();
}
