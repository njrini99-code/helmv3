/**
 * `toCoachVoice` is mangling English on the coach's primary surface.
 *
 * Observed in production 2026-08-17 on `/golf/dashboard/intelligence` as coach
 * Ben Potter (Guilford College Men's Golf Team), on SIX different players'
 * signal cards. Every string below is copied verbatim from that page.
 *
 *     "Connor attempteds 53 short-game shots from rough or bunker"
 *     "the recovery technique isn't bailing Connor outs"
 *     "Connor founds the green 77% of the time"
 *     "45% of Luke's double-or-worse holes trace to missed greens Luke
 *      couldns't get up-and-down"
 *     "so the second putt stops costing Braeden as stroke"
 *
 * The mechanism is `claim-voice.ts:98`:
 *
 *     out.replace(/\byou\b(\s+)([A-Za-z]+)/gi, ...)  →  thirdPerson(verb)
 *
 * `thirdPerson` appends `s` to anything that is not on one of three short
 * denylists. So it inflects past tenses (`attempted` → `attempteds`,
 * `found` → `founds`), prepositions (`out` → `outs`), and articles
 * (`a` → `as`). The `[A-Za-z]+` class also stops at an apostrophe, so
 * `couldn't` is seen as the word `couldn` and becomes `couldns't`.
 *
 * The file's own docblock states the contract it is breaking: "Anything it
 * cannot conjugate confidently it leaves ALONE — a sentence that still says
 * 'you' is strictly better than one that says 'Cole escape'." A sentence that
 * says "Connor attempteds" is worse than either.
 *
 * In every observed case the correct output is the name plus the following word
 * UNCHANGED: third-person past tense is identical to second-person past
 * ("you attempted" → "Connor attempted"), and where the word is not a verb the
 * pronoun was an object, not a subject ("bailing you out" → "bailing Connor
 * out").
 */
import { describe, it, expect } from 'vitest';
import { toCoachVoice, thirdPerson } from '@/lib/golf/claim-voice';

describe('toCoachVoice — the strings production actually renders', () => {
  it('does not inflect a past-tense verb', () => {
    expect(
      toCoachVoice('You attempted 53 short-game shots from rough or bunker', 'Connor Lynde'),
    ).toBe('Connor attempted 53 short-game shots from rough or bunker');
  });

  it('does not inflect an irregular past tense', () => {
    expect(toCoachVoice('you found the green 77% of the time', 'Connor Lynde')).toBe(
      'Connor found the green 77% of the time',
    );
  });

  it('does not slice a contraction in half', () => {
    // `[A-Za-z]+` matched "couldn" and produced "couldns't".
    expect(toCoachVoice("missed greens you couldn't get up-and-down", 'Luke Wise')).toBe(
      "missed greens Luke couldn't get up-and-down",
    );
  });

  it('does not turn a trailing preposition into a verb', () => {
    expect(toCoachVoice("the recovery technique isn't bailing you out", 'Connor Lynde')).toBe(
      "the recovery technique isn't bailing Connor out",
    );
  });

  it('does not turn the article "a" into "as"', () => {
    expect(toCoachVoice('the second putt stops costing you a stroke', 'Braeden Gillen')).toBe(
      'the second putt stops costing Braeden a stroke',
    );
  });
});

describe('toCoachVoice — the cases it already got right stay right', () => {
  it('still inflects a genuine present-simple verb', () => {
    expect(toCoachVoice('You escape the bunker fine', 'Cole Bennett')).toBe(
      'Cole escapes the bunker fine',
    );
  });

  it('preserves emphasis casing', () => {
    expect(toCoachVoice('You ESCAPE the bunker fine', 'Cole Bennett')).toBe(
      'Cole ESCAPES the bunker fine',
    );
  });

  it('still handles contractions, possessives and modals', () => {
    expect(toCoachVoice("you're only making 47%", 'Braeden Gillen')).toBe(
      'Braeden is only making 47%',
    );
    expect(toCoachVoice('your lag putts', 'Braeden Gillen')).toBe("Braeden's lag putts");
    expect(toCoachVoice('you can reach it', 'Braeden Gillen')).toBe('Braeden can reach it');
  });

  it('leaves a claim with no second person untouched', () => {
    const s = 'College players in our data average ~0.9 penalty strokes.';
    expect(toCoachVoice(s, 'Luke Wise')).toBe(s);
  });
});

describe('thirdPerson — refuses rather than guesses', () => {
  it('returns null for past tenses', () => {
    // null is the caller's signal to substitute the name and leave the word.
    expect(thirdPerson('attempted')).toBeNull();
    expect(thirdPerson('found')).toBeNull();
    expect(thirdPerson('made')).toBeNull();
    expect(thirdPerson('lost')).toBeNull();
  });

  it('returns null for function words that can follow an object pronoun', () => {
    expect(thirdPerson('out')).toBeNull();
    expect(thirdPerson('a')).toBeNull();
    expect(thirdPerson('the')).toBeNull();
    expect(thirdPerson('up')).toBeNull();
  });

  it('still conjugates real present-simple verbs', () => {
    expect(thirdPerson('escape')).toBe('escapes');
    expect(thirdPerson('finish')).toBe('finishes');
    expect(thirdPerson('carry')).toBe('carries');
    expect(thirdPerson('have')).toBe('has');
  });
});
