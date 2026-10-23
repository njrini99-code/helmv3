/**
 * Audit row 40(b): the recap prompt's limits (two sentences, <= 36 words,
 * no em-dash) were never enforced; 63% of stored recaps exceeded 36 words
 * and 14% carried an em-dash, mostly from the deterministic template itself.
 */
import { describe, it, expect } from 'vitest';
import {
  checkRecapStyle,
  buildDeterministicRecap,
  countRecapWords,
  RECAP_MAX_WORDS,
  RECAP_SENTENCE_WORD_TARGETS,
  RECAP_SHORTEN_SENTENCE_WORD_TARGETS,
  type DeterministicRecapRound,
} from './recap-style';

describe('checkRecapStyle', () => {
  it('passes a compliant two-sentence recap', () => {
    expect(checkRecapStyle('Caden carded 74 at Pinehurst No. 2 with 31 putts. Tighter wedges would turn pars into birdies.', ['Pinehurst No. 2'])).toEqual([]);
  });

  it('flags an em-dash or en-dash', () => {
    expect(checkRecapStyle('Caden carded 74 — steady. Next round matters.', [])).toContain('em_dash');
    expect(checkRecapStyle('Caden carded 74 – steady. Next round matters.', [])).toContain('em_dash');
  });

  it('flags more than 36 words', () => {
    const long = `${'word '.repeat(30)}end. ${'more '.repeat(8)}end.`;
    expect(checkRecapStyle(long, [])).toContain('too_many_words');
  });

  it('counts words the same way the limit does, so a prompt can quote the count', () => {
    const atCap = `${'word '.repeat(RECAP_MAX_WORDS - 2)}end. last.`;
    expect(countRecapWords(atCap)).toBe(RECAP_MAX_WORDS);
    expect(checkRecapStyle(atCap, [])).not.toContain('too_many_words');
    expect(countRecapWords(`${atCap} extra`)).toBe(RECAP_MAX_WORDS + 1);
    expect(countRecapWords('  31 putts,   50% of greens.\n')).toBe(5);
  });

  it('asks the model for per-sentence caps that leave headroom under the enforced limit', () => {
    // The model overshoots the caps it is given (2026-10-21 data: 74% of first
    // drafts ran past 36), so the caps must sum well under 36, and the rewrite
    // pass, which already overshot once, gets less room than the first ask.
    const first = RECAP_SENTENCE_WORD_TARGETS[0] + RECAP_SENTENCE_WORD_TARGETS[1];
    const shorten = RECAP_SHORTEN_SENTENCE_WORD_TARGETS[0] + RECAP_SHORTEN_SENTENCE_WORD_TARGETS[1];
    expect(first).toBeLessThanOrEqual(RECAP_MAX_WORDS - 8);
    expect(shorten).toBeLessThan(first);
  });

  it('flags a sentence count other than two, without splitting on decimals or No.', () => {
    expect(checkRecapStyle('He hit 78.6% of fairways at St. Andrews.', ['St. Andrews'])).toContain('not_two_sentences');
    expect(checkRecapStyle('One. Two. Three.', [])).toContain('not_two_sentences');
    expect(checkRecapStyle('He hit 78.6% of fairways. Next round matters.', [])).toEqual([]);
  });
});

describe('buildDeterministicRecap', () => {
  const base: DeterministicRecapRound = {
    course_name: 'The Country Club of North Carolina Dogwood Course at Pinehurst No. 2',
    total_score: 74,
    score_to_par: 2,
    total_putts: 31,
    total_fairways: 14,
    total_fairways_hit: 7,
    total_gir: 9,
    total_gir_possible: 18,
    holes_played: 18,
  };
  const variants: Array<[string, Partial<DeterministicRecapRound>, { scoring_average: number | null; best_round: number | null } | null]> = [
    ['below average', {}, { scoring_average: 78, best_round: 70 }],
    ['season low', {}, { scoring_average: 74.5, best_round: 75 }],
    ['under par', { score_to_par: -2, total_score: 70 }, null],
    ['putter', { total_putts: 40 }, null],
    ['fairways', { total_fairways_hit: 12 }, null],
    ['greens', { total_gir: 5, total_fairways_hit: 7 }, null],
    ['plain', { total_fairways_hit: 8, total_gir: 10 }, null],
    ['under par + low fir', { score_to_par: -1, total_score: 71, total_fairways_hit: 5, total_gir: 12 }, null],
  ];
  it.each(variants)('%s branch meets the recap limits', (_n, over, stats) => {
    const round = { ...base, ...over };
    const text = buildDeterministicRecap(round, stats);
    expect(checkRecapStyle(text, [round.course_name ?? ''])).toEqual([]);
  });

  it('keeps the plain lede text the claim-gate test pins', () => {
    const text = buildDeterministicRecap(
      { ...base, course_name: 'Pinehurst No. 2', total_fairways_hit: 8, total_gir: 10 },
      null,
    );
    expect(text).toBe('74 on the card at Pinehurst No. 2. The next round is where this baseline gets tested.');
  });
});
