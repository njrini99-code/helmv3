/**
 * Evidence registration for the two-sentence post-round recap
 * (`generateLLMRecap` in `src/app/golf/actions/round-recap.ts`).
 *
 * WHY THIS EXISTS
 *
 * The recap prompt hands the model a `facts` block — score, putts, fairway %,
 * GIR %, front/back nine, season scoring average — and instructs it, verbatim:
 *
 *     "- Reference at least one specific stat by number."
 *
 * It then called `compose()` with `evidence: []`. Those two things cannot both
 * be satisfied: `verifyCitations` rejects every numeric token absent from the
 * evidence set (bar the universally-safe 0/1/2/3/100), so a recap that OBEYS
 * the instruction is guaranteed to fail verification and be thrown away for the
 * deterministic fallback. The model was punished for using what it was handed.
 *
 * Measured in production 2026-08-17 (`golf_coachhelm_llm_calls`): every
 * discarded call that recorded its evidence set recorded it EMPTY — 4 of 4 —
 * and the unmatched tokens are the facts themselves (`71` a score, `26,78,73.5`,
 * `27,78.6`, `14,50`). Over the whole `round_review` task, 75 calls fell back to
 * template against 28 verified.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not loosen the verifier. Only figures the prompt literally showed the
 * model are registered; a number that was never handed over is still rejected.
 * That is the same principle `round-review.ts` applies to composite-insight
 * titles, and for the same reason: a number we supplied is not a fabrication.
 *
 * It uses the verifier's OWN scanner (`extractNumericTokens`), so the set we
 * register and the set it later judges cannot drift apart — two regexes
 * diverging is exactly how a figure becomes registerable-but-unverifiable.
 */

import type { EvidenceClaim } from './types';
import { extractNumericTokens } from './citations';

/** Matches a token the scanner returned that carries a percent sign. */
const PERCENT_TOKEN_RE = /^(-?\d+(?:\.\d+)?)%$/;

/**
 * Register every numeric figure appearing in the recap prompt's `facts` block.
 *
 * Percentages are registered in both renderings the model actually produces:
 * shown "78.6%", a model will as readily write "79%", and those are the same
 * true fact. Discarding an entire recap over which one it picked is not a
 * judgement worth making — the same reasoning `pushDerivedPct` documents in
 * `round-review.ts`.
 */
export function buildRecapEvidence(facts: string[]): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [];
  const seen = new Set<string>();

  const add = (field: string, value: string): void => {
    if (seen.has(value)) return;
    seen.add(value);
    claims.push({ field, value });
  };

  for (const fact of facts) {
    for (const token of extractNumericTokens(fact)) {
      add('recap_fact_figure', token);

      const percent = PERCENT_TOKEN_RE.exec(token);
      if (percent?.[1]) {
        const rounded = Math.round(Number(percent[1]));
        if (Number.isFinite(rounded)) add('recap_fact_figure_rounded', String(rounded));
      }
    }
  }

  return claims;
}
