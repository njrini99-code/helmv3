/**
 * v3 LLM citation verifier (W30).
 *
 * Per Part XI.3: every numeric or named-entity claim the model emits
 * must trace back to an EvidenceClaim the caller supplied. The
 * compose() pipeline calls verifyCitations() on the generated text;
 * the result decides whether the call is logged as `verified: true`.
 *
 * v1 implementation: extract numeric tokens (integers, decimals,
 * percentages) and proper-noun-shaped tokens from the generated text,
 * and confirm each one appears in the evidence value set. False
 * positives are tolerated (we just won't flag verified=true); false
 * negatives are not (a fabricated cite must not pass).
 *
 * Future hardening (deferred): structured `cite(field, value)` tool
 * call per master plan Part XI.3 — the model would emit JSON tool
 * calls rather than free text, eliminating extraction ambiguity.
 */

import type { EvidenceClaim } from './types';

const NUMERIC_RE = /(?:^|\s|\()(-?\d+(?:\.\d+)?%?)(?=[\s,.;:!?)\]]|$)/g;

/**
 * A made/attempted fraction — `8/14`, `10/18`.
 *
 * `NUMERIC_RE` cannot see either half of one: the first number is followed by
 * `/` and the second is preceded by it, and neither is in that pattern's
 * boundary sets. So a fraction was invisible to the verifier and the model
 * could write ANY fraction and still be logged `verified: true` — a false
 * negative, which this module's contract says is the one kind of error it must
 * not make. The same fact rendered "(8 of 14)" was checked normally, so two
 * spellings of one claim got opposite scrutiny.
 *
 * Fractions are what the model actually produces here. `buildEvidence` in
 * ./round-review.ts registers `fairways_hit`/`fairways_total` and
 * `gir`/`gir_total` as separate counts precisely because the prompt hands over
 * counts, and its own comment lists the derivations observed in production
 * (`57.1 = 8/14`, `72.2 = 13/18`). Both halves are therefore already in the
 * evidence set: a truthful fraction verifies, and a fabricated numerator does
 * not.
 *
 * `(?![\/\d])` after the denominator is what keeps a slash DATE out. `8/14/2026`
 * must not become the citable claims 8, 14 and 2026 — a date is not a
 * measurement, and demanding it appear in the evidence set would discard the
 * whole review, which is the 17.8%-of-calls failure round-review.ts documents.
 */
const FRACTION_RE = /(?:^|\s|\()(\d+)\/(\d+)(?![/\d])(?=[\s,.;:!?)\]]|$)/g;

export interface CitationVerification {
  verified: boolean;
  /** Tokens found in the text that did NOT match any evidence value.
   *  Useful for debugging fabricated cites. */
  unmatched_tokens: string[];
}

/**
 * Every numeric token this verifier would find in `text`.
 *
 * Exported so a caller can register the figures it puts IN FRONT of the model
 * using the exact same scanner that will later judge them. A prompt is allowed
 * to contain numbers — the round review injects composite-insight titles like
 * "3-5 ft putting: 47%" verbatim — and any figure shown to the model but absent
 * from the evidence set is a false positive by construction: the model is
 * punished for using what it was handed.
 *
 * Sharing this function is the point. Two independent regexes drifting apart is
 * exactly how a number becomes registerable-but-unverifiable, or vice versa.
 */
export function extractNumericTokens(text: string): string[] {
  // Both scanners run over the whole string, then the results are merged back
  // into READING ORDER. Order matters because a caller registering the figures
  // it showed the model compares these lists positionally in review, and a
  // reader debugging `unmatched_tokens` expects them in the order they appear.
  const found: Array<{ at: number; token: string }> = [];

  for (const match of text.matchAll(NUMERIC_RE)) {
    if (match[1]) found.push({ at: match.index + match[0].indexOf(match[1]), token: match[1] });
  }
  for (const match of text.matchAll(FRACTION_RE)) {
    const [numerator, denominator] = [match[1], match[2]];
    if (!numerator || !denominator) continue;
    const start = match.index + match[0].indexOf(numerator);
    found.push({ at: start, token: numerator });
    found.push({ at: start + numerator.length + 1, token: denominator });
  }

  return found.sort((a, b) => a.at - b.at).map((f) => f.token);
}

/**
 * Universally-safe tokens: 0, 100, 1, single digits inside common phrases
 * like "1 stroke" / "2 strokes" — these aren't claims about data.
 *
 * Exported so claim-validator.ts's `uncited_number` check (the typed
 * validator's own vacuous-pass guard) judges prose by the same safe list
 * this scanner does — two independently-maintained safe lists is how a
 * token becomes flaggable by one gate and not the other.
 */
export const SAFE_NUMERIC_TOKENS = new Set(['0', '1', '2', '3', '100']);

export function verifyCitations(text: string, evidence: EvidenceClaim[]): CitationVerification {
  const allowedValues = new Set(evidence.map((e) => normalize(String(e.value))));

  const unmatched: string[] = [];
  for (const tok of extractNumericTokens(text)) {
    const normalized = normalize(tok);
    if (!allowedValues.has(normalized)) {
      unmatched.push(tok);
    }
  }

  const trulyUnmatched = unmatched.filter((t) => !SAFE_NUMERIC_TOKENS.has(normalize(t)));

  return {
    verified: trulyUnmatched.length === 0,
    unmatched_tokens: trulyUnmatched,
  };
}

/**
 * Strip trailing %, unit suffixes, and trailing ".0..." so a value like
 * "28 ft" or "1.4 strokes" normalizes to the bare number the extraction
 * regex pulls out of free text.
 *
 * Exported so claim-validator.ts's `uncited_number` check can compare a
 * prose-extracted token against an accepted claim's numeric value using
 * this exact same normalization — a second normalizer drifting from this
 * one is exactly how a number becomes flaggable by one gate and not the
 * other.
 */
export function normalize(s: string): string {
  // Strip trailing %, unit suffixes (ft/yd/strokes/etc.), and trailing
  // ".0..." so evidence values like "28 ft" or "1.4 strokes" normalize
  // down to the bare number the text-extraction regex pulls out.
  return s
    .trim()
    .replace(/%$/, '')
    .replace(/\s*(ft|yd|yards|feet|inches|in|m|cm|mph|kph|strokes?)$/i, '')
    .replace(/\.0+$/, '')
    .toLowerCase();
}
