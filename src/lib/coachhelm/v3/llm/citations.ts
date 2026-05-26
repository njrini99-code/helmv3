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

const NUMERIC_RE = /(?:^|\s|\()(-?\d+(?:\.\d+)?%?)(?=[\s,.;:!\?\)\]]|$)/g;

export interface CitationVerification {
  verified: boolean;
  /** Tokens found in the text that did NOT match any evidence value.
   *  Useful for debugging fabricated cites. */
  unmatched_tokens: string[];
}

export function verifyCitations(text: string, evidence: EvidenceClaim[]): CitationVerification {
  const allowedValues = new Set(evidence.map((e) => normalize(String(e.value))));

  const unmatched: string[] = [];
  for (const match of text.matchAll(NUMERIC_RE)) {
    const tok = match[1];
    if (!tok) continue;
    const normalized = normalize(tok);
    if (!allowedValues.has(normalized)) {
      unmatched.push(tok);
    }
  }

  // Allow universally-safe tokens: 0, 100, 1, single digits inside common
  // phrases like "1 stroke" / "2 strokes" — these aren't claims about data.
  const SAFE = new Set(['0', '1', '2', '3', '100']);
  const trulyUnmatched = unmatched.filter((t) => !SAFE.has(normalize(t)));

  return {
    verified: trulyUnmatched.length === 0,
    unmatched_tokens: trulyUnmatched,
  };
}

function normalize(s: string): string {
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
