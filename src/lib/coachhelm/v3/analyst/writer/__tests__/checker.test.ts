import { describe, expect, it } from 'vitest';
import { checkDraft, repairFeedback, similarity, UNSUPPORTED_CAUSES } from '../checker';
import { evaluate, extractDates, extractNumbers, matchesAtPrecision } from '../numbers';
import { numberPool, payloadFor, type WriterPayload } from '../payload';
import type { Draft, RejectionRule } from '../types';
import { syntheticPlayers } from './fixtures';

const players = syntheticPlayers();
const byId = (id: string) => players.find((p) => p.id === id)!;
const coach = (id: string): WriterPayload => payloadFor(byId(id).sheet, byId(id).notability, 'coach')!;
const player = (id: string): WriterPayload => payloadFor(byId(id).sheet, byId(id).notability, 'player')!;

/**
 * The long-irons player (coach view): approach costs 3.1 a round, 2.2 of it from 175 yards and longer, 10 of 50 of
 * those on the green, 74.6 feet from the hole on average; 50 to 125 yards costs 0.2. Evidence rounds include 24 October.
 */
const good: Draft = {
  what: 'Approach shots cost 3.1 strokes a round this season, and most of it comes from 175 yards and longer: 2.2 a round from there. Only 10 of those 50 long approaches finished on the green, and they finished 74.6 feet away on average.',
  rules_in_out: 'The shots show where the loss is: the long approaches, not the ones from 50 to 125 yards, which cost 0.2 a round. They cannot tell whether it is the club, the contact or the target.',
  this_week: 'Hit 30 balls from 180 to 200 yards over two sessions and count how many finish on the green. Aim for 8 of the 30.',
  watch: 'Note the club and the miss side on every approach from 175 yards and longer over the next 5 rounds.',
  this_week_area: 'approach',
  declared: [
    { value: 30, kind: 'prescription', unit: 'reps' },
    { value: 180, kind: 'prescription', unit: 'yards' },
    { value: 200, kind: 'prescription', unit: 'yards' },
    { value: 2, kind: 'prescription', unit: 'sessions' },
    { value: 8, kind: 'prescription', unit: 'count' },
  ],
};

const rules = (d: Draft, p: WriterPayload = coach('long-irons'), others?: string[]): RejectionRule[] => checkDraft(d, p, { others }).map((r) => r.rule);
const with_ = (patch: Partial<Draft>): Draft => ({ ...good, ...patch });

describe('a good read', () => {
  it('passes, in the coach view and in the player view', () => {
    expect(checkDraft(good, coach('long-irons'))).toEqual([]);
    expect(checkDraft(good, player('long-irons'))).toEqual([]);
  });
});

describe('numbers', () => {
  it('passes a fact at the precision written, and fails one outside it', () => {
    expect(rules(with_({ what: 'Approach shots cost 3 strokes a round.' }))).toEqual([]); // 3.1 rounded
    expect(rules(with_({ what: 'Approach shots cost 3.1 strokes a round.' }))).toEqual([]);
    expect(rules(with_({ what: 'They finish 75 feet away.' }))).toEqual([]); // 74.6 rounded
    expect(rules(with_({ what: 'They finish 74.6 feet away.' }))).toEqual([]);
    expect(rules(with_({ what: 'They finish 74.7 feet away.' }))).toEqual(['number_not_in_facts']);
    expect(rules(with_({ what: 'Approach shots cost 3.4 strokes a round.' }))).toEqual(['number_not_in_facts']);
    expect(rules(with_({ what: 'Approach shots cost 4 strokes a round.' }))).toEqual(['number_not_in_facts']);
  });

  it('reads number words, so spelling a number out does not dodge the check', () => {
    expect(rules(with_({ what: 'Ten of fifty long approaches found the green.' }))).toEqual([]);
    expect(rules(with_({ what: 'Eleven of fifty long approaches found the green.' }))).toEqual(['number_not_in_facts']);
  });

  it('accepts declared arithmetic that code can redo from facts, and nothing else', () => {
    // 80% of the long approaches missed: (50 - 10) / 50, which is not itself a fact.
    expect(numberPool(coach('long-irons'))).not.toContain(80);
    const text = '80% of the 50 long approaches missed the green.';
    const missed: Draft = with_({ what: text, declared: [...good.declared, { value: 80, kind: 'arithmetic', expression: '(50 - 10) / 50 * 100' }] });
    expect(rules(missed)).toEqual([]);
    expect(rules(with_({ what: text }))).toEqual(['number_not_in_facts']);
    expect(rules({ ...missed, declared: [...good.declared, { value: 80, kind: 'arithmetic', expression: '(50 - 11) / 50 * 100' }] })).toContain('arithmetic_wrong');
    expect(rules({ ...missed, declared: [...good.declared, { value: 80, kind: 'arithmetic', expression: '(57 - 17) / 50 * 100' }] })).toContain('arithmetic_wrong');
    expect(rules({ ...missed, declared: [...good.declared, { value: 80, kind: 'arithmetic', expression: 'misses' }] })).toContain('arithmetic_wrong');
  });

  it('allows a prescribed number only in the advice', () => {
    expect(rules(with_({ what: 'Approach shots cost 3.1 strokes a round, about 30 a month.' }))).toEqual(['prescription_outside_advice']);
  });

  it('allows a practice distance only inside the band the strokes go from', () => {
    const near = with_({ this_week: 'Hit 30 balls from 120 yards and count the greens. Aim for 8 of the 30.', declared: [{ value: 30, kind: 'prescription', unit: 'reps' }, { value: 120, kind: 'prescription', unit: 'yards' }, { value: 8, kind: 'prescription', unit: 'count' }] });
    // Turned down, and so not declared: 120 is then also a number the facts do not have.
    expect(rules(near)).toEqual(['prescription_out_of_range', 'number_not_in_facts']);
    const putts = with_({ this_week: 'Hit 30 balls from 190 yards. Aim for 8 of the 30.', declared: [{ value: 30, kind: 'prescription', unit: 'reps' }, { value: 190, kind: 'prescription', unit: 'yards' }, { value: 8, kind: 'prescription', unit: 'count' }] });
    expect(rules(putts)).toEqual([]);
    expect(rules(with_({ declared: [...good.declared, { value: 500, kind: 'prescription', unit: 'reps' }] }))).toEqual(['prescription_out_of_range']);
    expect(rules(with_({ declared: [...good.declared, { value: 120, kind: 'prescription', unit: 'percent' }] }))).toEqual(['prescription_out_of_range']);
  });

  it('reads golf terms as words: three-putts, par 5s, 18 holes, hole 1', () => {
    expect(rules(with_({ rules_in_out: 'It is not three-putts or par 5s or the 18 holes as a whole; hole 1 plays like the rest.' }))).toEqual([]);
  });
});

describe('dates', () => {
  it('passes a date of an evidence round and fails one that is not in the facts', () => {
    expect(rules(with_({ watch: 'Open the round of 24 October and note the miss side on each long approach.' }))).toEqual([]);
    expect(rules(with_({ watch: 'Open the round of October 24 and note the miss side on each long approach.' }))).toEqual([]);
    expect(rules(with_({ watch: 'Open the round of 25 October and note the miss side on each long approach.' }))).toEqual(['date_not_in_facts']);
  });
});

describe('causes the data cannot show', () => {
  it('rejects a cause stated as fact', () => {
    expect(rules(with_({ what: 'Her swing breaks down on approaches from 175 yards and longer.' }))).toEqual(['unsupported_cause']);
    expect(rules(with_({ what: 'The wind pushes the long approaches away.' }))).toEqual(['unsupported_cause']);
    expect(rules(with_({ what: 'Nerves take over on the long approaches.' }))).toEqual(['unsupported_cause']);
    expect(rules(with_({ this_week: 'Work on tempo with 30 balls from 190 yards.', declared: [{ value: 30, kind: 'prescription', unit: 'reps' }, { value: 190, kind: 'prescription', unit: 'yards' }] }))).toEqual(['unsupported_cause']);
  });

  it('allows one named only to say the data cannot tell, and only where the read says what it rules in and out', () => {
    expect(rules(with_({ rules_in_out: 'The shots cannot tell whether it is the swing, the wind or the club choice.' }))).toEqual([]);
    // "whether" alone is not a limitation; the advice never names a cause; "unknown" does not excuse a guess.
    const reps = [{ value: 30, kind: 'prescription' as const, unit: 'reps' as const }];
    expect(rules(with_({ this_week: 'Hit 30 balls and check whether your tempo holds.', declared: reps }))).toEqual(['unsupported_cause']);
    expect(rules(with_({ this_week: 'Hit 30 balls. The shots cannot tell whether it is tempo.', declared: reps }))).toEqual(['unsupported_cause']);
    expect(rules(with_({ what: 'Nerves decide whether the long approaches find the green.' }))).toEqual(['unsupported_cause']);
    expect(rules(with_({ rules_in_out: 'The cause is unknown, probably her grip.' }))).toEqual(['unsupported_cause']);
  });

  it('lets watch ask to record a cause that can be recorded, but not one that cannot', () => {
    expect(rules(with_({ watch: 'Note the wind and the club on each approach from 175 yards and longer.' }))).toEqual([]);
    expect(rules(with_({ watch: 'Watch her tempo on each approach from 175 yards and longer.' }))).toEqual(['unsupported_cause']);
  });

  it('allows a term a counted fact names', () => {
    const p = coach('long-irons');
    const named: WriterPayload = { ...p, measures: [...p.measures, { ...p.measures[0]!, label: 'Tournament rounds under pressure against practice rounds' }] };
    const draft = with_({ what: 'Approach shots cost 3.1 strokes a round under pressure.' });
    expect(rules(draft, named)).toEqual([]);
    expect(rules(draft, p)).toEqual(['unsupported_cause']);
  });

  it('keeps the list in one constant, every group with terms', () => {
    expect(UNSUPPORTED_CAUSES.map((g) => g.id)).toEqual(['swing_mechanics', 'grip', 'tempo', 'intent', 'head', 'conditions', 'equipment', 'fitness']);
    for (const g of UNSUPPORTED_CAUSES) expect(g.terms.length).toBeGreaterThan(0);
    const caught = (s: string) => UNSUPPORTED_CAUSES.some((g) => g.terms.some((t) => t.test(s)));
    for (const s of ['her grip', 'the backswing', 'hit it fat', 'green speed', 'pin position', 'he lost focus', 'mentally', 'a new driver', 'she meant to', 'tired late']) expect(caught(s), s).toBe(true);
    // Coaching words that are not causes.
    for (const s of ['aim for 8 of 30', 'focus this week on lag putts', 'set up a ladder drill', 'a real strength', 'the biggest impact on her score', 'try to hole 7 of 10']) expect(caught(s), s).toBe(false);
  });
});

describe('teammates, in the player view', () => {
  it('rejects a teammate reference on the player card and allows it on the coach card', () => {
    const d = with_({ rules_in_out: 'The team loses most on approach too. They cannot tell whether it is the club.' });
    expect(rules(d, coach('long-irons'))).toEqual([]);
    expect(rules(d, player('long-irons'))).toEqual(['teammate_reference']);
    expect(rules(with_({ what: 'Approach shots cost 3.1 strokes a round, more than her teammates.' }), player('long-irons'))).toEqual(['teammate_reference']);
  });

  it("does not accept a teammate's figure as a number in the player view", () => {
    // The teammates' middle value of strokes gained on approach this season is -2.8: on the coach card only.
    const d = with_({ what: 'Approach shots cost 3.1 strokes a round, against 2.8 for the middle player.' });
    expect(rules(d, coach('long-irons'))).toEqual([]);
    expect(rules(d, player('long-irons'))).toEqual(['number_not_in_facts']);
  });
});

describe('claims of change', () => {
  const changed = (p: WriterPayload, verdict: 'better' | 'worse'): WriterPayload => ({
    ...p,
    candidates: [{ label: 'Greens hit in regulation', area: 'approach', rank: 1, supporting: [], reasons: [{ rule: 'changed', verdict, compared_with: 'x', player: 1, against: 1, difference: { value: 0, low: 0, high: 0 }, strokes_per_round: null }] }],
  });

  it('needs rule (a) in the same direction', () => {
    const d = with_({ what: 'Approach shots have improved, but still cost 3.1 strokes a round.' });
    expect(rules(d)).toEqual(['change_claim_unsupported']);
    expect(rules(d, changed(coach('long-irons'), 'better'))).toEqual([]);
    expect(rules(d, changed(coach('long-irons'), 'worse'))).toEqual(['change_claim_unsupported']);
    expect(rules(with_({ what: 'Lately approach shots cost 3.1 strokes a round.' }))).toEqual(['change_claim_unsupported']);
    expect(rules(with_({ what: 'Lately approach shots cost 3.1 strokes a round.' }), changed(coach('long-irons'), 'worse'))).toEqual([]);
  });
});

describe('certainty', () => {
  it('rejects "clearly" on a leaning read and allows it on a clear one', () => {
    const d = with_({ what: 'Approach is clearly where the strokes go, 2.2 a round from 175 yards and longer.' });
    expect(coach('leaning').priority.certainty).toBe('leaning');
    expect(rules(d, coach('leaning'))).toEqual(['overstated_certainty']);
    expect(rules(d, coach('long-irons'))).toEqual([]);
  });
});

describe('the advice', () => {
  it('is about the priority or a candidate, and says so', () => {
    expect(rules(with_({ this_week_area: 'putting' }))).toEqual(['advice_outside_areas']);
    expect(rules(with_({ this_week: 'Roll 30 putts from 8 to 10 feet. Aim for 8 of the 30.', declared: [{ value: 30, kind: 'prescription', unit: 'reps' }, { value: 8, kind: 'prescription', unit: 'count' }, { value: 10, kind: 'prescription', unit: 'feet' }] }))).toContain('advice_outside_areas');
  });

  it('has a number to count', () => {
    expect(rules(with_({ this_week: 'Spend time on long approaches and count the greens.' }))).toEqual(['advice_not_measurable']);
  });
});

describe('style', () => {
  it('rejects em dashes, jargon and length', () => {
    expect(rules(with_({ what: 'Approach shots cost 3.1 strokes a round — mostly long ones.' }))).toEqual(['em_dash']);
    expect(rules(with_({ what: 'Approach shots cost 3.1 strokes a round of SG.' }))).toEqual(['jargon']);
    expect(rules(with_({ what: 'Her GIR from 175 yards and longer is low.' }))).toEqual(['jargon']);
    expect(rules(with_({ what: `${'Approach shots cost 3.1 strokes a round. '.repeat(10)}` }))).toEqual(['too_long']);
  });
});

describe('templates', () => {
  it("rejects a draft that reads like another player's paragraph", () => {
    const text = [good.what, good.rules_in_out, good.this_week, good.watch].join(' ');
    expect(similarity(text, text)).toBe(1);
    expect(rules(good, coach('long-irons'), [text])).toEqual(['template_like']);
    expect(rules(good, coach('long-irons'), ['Putting costs 2.4 strokes a round, spread across every distance.'])).toEqual([]);
  });
});

describe('the repair feedback', () => {
  it('numbers each reason with its field, in plain words', () => {
    const reasons = checkDraft(with_({ what: 'Her swing costs 3.4 strokes.' }), coach('long-irons'));
    const text = repairFeedback(reasons);
    expect(text).toContain('1. [what] 3.4 is not a number in the facts');
    expect(text).toContain('2. [what] "swing" (swing mechanics) is a cause the shots cannot show');
    expect(text).toContain('Call submit_read once more');
  });
});

describe('reading numbers', () => {
  it('finds digits, words and ranges, and ignores signs, terms and dates', () => {
    expect(extractNumbers('costs -3.2 a round, 30-40 feet, 1,350 cards, twenty-one putts, five rounds').map((n) => n.value)).toEqual([3.2, 30, 40, 1350, 21, 5]);
    expect(extractNumbers('one thing: three-putts on par 4s over 18 holes, since 21 August')).toEqual([]);
    expect(extractDates('since 21 August and Oct 3, 2026').dates).toEqual([
      { raw: '21 August', day: 21, month: 8, year: null },
      { raw: 'Oct 3, 2026', day: 3, month: 10, year: 2026 },
    ]);
  });

  it('matches at the written precision', () => {
    expect(matchesAtPrecision(3, 0, 3.2)).toBe(true);
    expect(matchesAtPrecision(3, 0, 3.5)).toBe(false);
    expect(matchesAtPrecision(3.2, 1, 3.24)).toBe(true);
    expect(matchesAtPrecision(3.2, 1, 3.26)).toBe(false);
    expect(matchesAtPrecision(72, 0, 71.6)).toBe(true);
    expect(matchesAtPrecision(3.2, 1, -3.2)).toBe(true);
  });

  it('evaluates plain arithmetic only', () => {
    expect(evaluate('75 / 104 * 100')).toEqual({ value: (75 / 104) * 100, operands: [75, 104, 100] });
    expect(evaluate('(3.2 - 0.9) * 2')?.value).toBeCloseTo(4.6);
    for (const bad of ['', '3 +', 'Math.max(1,2)', '1 / 0', 'misses']) expect(evaluate(bad), bad).toBeNull();
  });
});
