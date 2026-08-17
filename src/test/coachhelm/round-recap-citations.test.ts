/**
 * `generateLLMRecap` (src/app/golf/actions/round-recap.ts) composes the
 * two-sentence post-round recap persisted to `golf_rounds.ai_recap`.
 *
 * Its prompt hands the model a `facts` block — score, putts, fairway %, GIR %,
 * front/back nine, season scoring average — and then instructs, verbatim:
 *
 *     "- Reference at least one specific stat by number."
 *
 * …while passing `evidence: []` to `compose()`.
 *
 * Those two things cannot both be satisfied. `verifyCitations` rejects every
 * numeric token that is not in the evidence set (bar the universally-safe
 * 0/1/2/3/100), so a recap that obeys the instruction is guaranteed to fail
 * verification, and `compose()` throws the whole recap away in favour of the
 * deterministic fallback. The model is punished for using exactly what it
 * was handed.
 *
 * Measured in production 2026-08-17 from `golf_coachhelm_llm_calls`: every
 * discarded call that recorded its evidence set recorded it EMPTY (4 of 4),
 * and the unmatched tokens are plainly the facts themselves —
 * `71` (a score), `26,78,73.5`, `27,78.6`, `14,50`. Across the whole
 * `round_review` task, 75 calls fell back to template vs 28 verified.
 *
 * The fix registers the figures the prompt already shows the model, using the
 * verifier's OWN scanner so the two cannot drift. It does not loosen the
 * verifier: a number that was never handed to the model is still rejected.
 */
import { describe, it, expect } from 'vitest';
import { verifyCitations } from '@/lib/coachhelm/v3/llm/citations';
import { buildRecapEvidence } from '@/lib/coachhelm/v3/llm/recap-evidence';

/** The real shape `generateLLMRecap` builds, for an 18-hole round. */
const FACTS = [
  'Score: 71 (+1) over 18 holes',
  'Course: Pinehurst No. 2 in Pinehurst, NC',
  'Round type: tournament',
  'Putts: 30',
  'Fairways hit: 78.6%',
  'Greens in regulation: 73.5%',
  'Front 9 / Back 9: 35 / 36',
  "Player's season scoring average: 74.7",
];

describe('round recap citations', () => {
  it('verifies a recap that cites the figures the prompt handed the model', () => {
    const text =
      'Bennett signed for 71 at Pinehurst No. 2, hitting 78.6% of fairways to keep the round upright. ' +
      'Thirty putts is the thread to pull before the next start.';

    const result = verifyCitations(text, buildRecapEvidence(FACTS));
    expect(result.unmatched_tokens).toEqual([]);
    expect(result.verified).toBe(true);
  });

  it('registers the score, which is the token production rejected most', () => {
    // `unmatched_tokens: ["71"]` — golf_coachhelm_llm_calls, 2026-08-17 02:37 UTC.
    const result = verifyCitations('Bennett signed for 71.', buildRecapEvidence(FACTS));
    expect(result.verified).toBe(true);
  });

  it('registers both renderings of a percentage the model may round', () => {
    // The model writes "79%" as readily as "78.6%"; both are the same fact.
    for (const text of ['Fairways at 78.6% held the round together.', 'Fairways at 79% held the round together.']) {
      expect(verifyCitations(text, buildRecapEvidence(FACTS)).verified, text).toBe(true);
    }
  });

  it('STILL rejects a number that was never handed to the model', () => {
    // The whole point: this must not become a way to smuggle a fabricated
    // figure past the verifier. 61 is not in FACTS.
    const result = verifyCitations('Bennett signed for 61.', buildRecapEvidence(FACTS));
    expect(result.verified).toBe(false);
    expect(result.unmatched_tokens).toContain('61');
  });

  it('returns no claims for an empty fact list rather than throwing', () => {
    expect(buildRecapEvidence([])).toEqual([]);
  });
});
