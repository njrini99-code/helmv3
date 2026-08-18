import { describe, it, expect } from 'vitest';
import { extractNumericTokens, verifyCitations } from './citations';
import type { EvidenceClaim } from './types';

/**
 * The citation verifier is the gate that decides whether a coach reads a real
 * narrative or a deterministic template, and it shipped with no tests of its
 * own. Its stated contract (module docblock) is asymmetric:
 *
 *   "False positives are tolerated (we just won't flag verified=true); false
 *    negatives are not (a fabricated cite must not pass)."
 *
 * A false negative is exactly what a fraction produced. `NUMERIC_RE` requires a
 * number to be preceded by start/space/`(` and followed by whitespace or
 * sentence punctuation. In `8/14` the first number is followed by `/` and the
 * second is preceded by it, so NEITHER is extracted and the claim is invisible
 * to the verifier — the model could write any fraction it liked and still be
 * logged `verified: true`.
 *
 * The same fact written "(8 of 14)" IS scrutinised, so two renderings of one
 * claim got opposite levels of trust.
 *
 * Fractions are not a hypothetical rendering here: `buildEvidence` in
 * ./round-review.ts registers `fairways_hit`/`fairways_total` and
 * `gir`/`gir_total` as separate counts precisely because the model is handed
 * counts and asked for prose about them, and its own comment lists the
 * derivations it produces (`57.1 = 8/14`, `72.2 = 13/18`).
 */

const FAIRWAYS: EvidenceClaim[] = [
  { field: 'fairways_hit', value: 8 },
  { field: 'fairways_total', value: 14 },
];

describe('extractNumericTokens — fractions', () => {
  it('finds both sides of a made/attempted fraction', () => {
    expect(extractNumericTokens('You hit 8/14 fairways.')).toEqual(['8', '14']);
  });

  it('finds a fraction at the start of a sentence and inside parentheses', () => {
    expect(extractNumericTokens('10/18 greens.')).toEqual(['10', '18']);
    expect(extractNumericTokens('Greens (13/18) were the story.')).toEqual(['13', '18']);
  });

  it('does NOT treat a slash date as a fraction', () => {
    // Registering 8, 14 and 2026 as citable claims would make an ordinary date
    // unverifiable and discard the whole review — the exact failure mode
    // round-review.ts documents at 17.8% of calls.
    expect(extractNumericTokens('Your round on 8/14/2026 was solid.')).toEqual([]);
  });
});

describe('verifyCitations — fractions', () => {
  it('rejects a fabricated fraction', () => {
    const out = verifyCitations('You hit 13/14 fairways.', FAIRWAYS);
    expect(out.unmatched_tokens).toContain('13');
    expect(out.verified).toBe(false);
  });

  it('accepts the truthful fraction the counts support', () => {
    const out = verifyCitations('You hit 8/14 fairways.', FAIRWAYS);
    expect(out.unmatched_tokens).toEqual([]);
    expect(out.verified).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
 * Characterisation of the behaviour that already worked, so the fraction change
 * cannot quietly alter it.
 * ------------------------------------------------------------------------- */
describe('extractNumericTokens — existing behaviour', () => {
  it('extracts decimals, percentages and negatives', () => {
    expect(extractNumericTokens('You gained 1.4 strokes putting.')).toEqual(['1.4']);
    expect(extractNumericTokens('Your GIR was 50%, up from 44%.')).toEqual(['50%', '44%']);
    expect(extractNumericTokens('You lost -0.8 strokes off the tee.')).toEqual(['-0.8']);
  });

  it('extracts the numbers in an "N of M" rendering', () => {
    expect(extractNumericTokens('Scrambling sat at 55.6% (5 of 9).')).toEqual(['55.6%', '5', '9']);
  });

  it('leaves a hyphenated range alone', () => {
    // Deliberate: registering band endpoints is not done anywhere, so treating
    // `-` as a boundary would turn "From 100-150 yards" into two unmatched
    // tokens and discard a correct review.
    expect(extractNumericTokens('From 100-150 yards you gained 0.8.')).toEqual(['0.8']);
    expect(extractNumericTokens('Your 3-5 ft make rate was 47%.')).toEqual(['47%']);
  });
});

describe('verifyCitations — existing behaviour', () => {
  it('normalises unit suffixes and trailing .0 on the evidence side', () => {
    const evidence: EvidenceClaim[] = [
      { field: 'putt_distance', value: '28 ft' },
      { field: 'sg_putting', value: '1.40' },
      { field: 'putts', value: 30.0 },
    ];
    expect(verifyCitations('From 28 ft you holed it.', evidence).verified).toBe(true);
    expect(verifyCitations('You took 30 putts.', evidence).verified).toBe(true);
  });

  it('treats 0/1/2/3/100 as universally safe rather than claims', () => {
    expect(verifyCitations('You three-putted 3 times.', []).verified).toBe(true);
  });

  it('flags a number that appears nowhere in the evidence', () => {
    const out = verifyCitations('You hit 47% of greens.', [{ field: 'gir_pct', value: 50 }]);
    expect(out.unmatched_tokens).toEqual(['47%']);
    expect(out.verified).toBe(false);
  });
});
