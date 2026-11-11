import { describe, expect, it } from 'vitest';
import { getGolfReference, SERVED_SECTIONS } from '../../golf-reference';
import { GOLF_REFERENCE_SECTIONS } from '../../golf-reference.generated';
import { golfSenseQuestions } from '../eval';
import { EXPANSIONS, plainHeading, plainText, SELF_REFERENCE_GUARD, stripSelfReferences } from '../reference-plain';
import { REFERENCE_TOPICS, servedText } from '../reference-topics';

const LINKS = /\[[^\]]*\]\([^)]*\)/g;
const withoutLinks = (text: string) => text.replace(LINKS, '');
const raw = new Map(GOLF_REFERENCE_SECTIONS.map((s) => [s.id, s]));
const tokens = (text: string) => Math.round(text.length / 4);

describe('the expansion table', () => {
  // One line per rule: what the document writes, and what the model is handed.
  const CASES: Array<[string, string]> = [
    ['**Strokes Gained (SG)** was developed', '**Strokes gained** was developed'],
    ['- **SG: OTT (Off-the-Tee)** — tee shots', '- **Strokes gained off the tee** — tee shots'],
    ['but **SG:APP and short-putt make %** carry', 'But **strokes gained approach and short-putt make %** carry'],
    ['SG:ARG (creative chips), SG:PUTT (long lag putting)', 'Strokes gained around the green (creative chips), strokes gained putting (long lag putting)'],
    ['adopted SG: Putting in 2011', 'Adopted strokes gained putting in 2011'],
    ['Sum to **SG: Total**', 'Sum to **strokes gained total**'],
    ['SG isolates per-shot quality.', 'Strokes gained isolates per-shot quality.'],
    ['Shot Scope: GIR is the biggest separator, while FW% barely moves.', 'Shot Scope: greens in regulation is the biggest separator, while fairways hit % barely moves.'],
    ['a 25-yd FW miss', 'A 25-yard fairway miss'],
    ['amateur 15-HCP ≈ 25-30%', 'Amateur 15-handicap about 25-30%'],
    ['| 0 HCP | 5 HCP |', '| 0-handicap | 5-handicap |'],
    ['3-putts dominated by speed control; they 1-putt for bogey', 'Three-putts dominated by speed control; they one-putt for bogey'],
    ['Tour avg ~50% GIR', 'Tour average about 50% greens in regulation'],
    ['| 0-6 ft | 92.8% |', '| 0 to 6 feet | 92.8% |'],
    ['| 30+ ft | 4.3% |', '| 30 feet and out | 4.3% |'],
    ['from 25+ ft', 'From 25 feet and out'],
    ['Lag Putting (>25 ft)', 'Lag Putting (over 25 feet)'],
    ['shifts 5-ft make % from 75% → 85%', 'Shifts 5-foot make % from 75% to 85%'],
    ['costs ~3-5 ft of proximity', 'Costs about 3 to 5 feet of proximity'],
    ['inside 3 ft', 'Inside 3 feet'],
    ['gain per 5,000 ft altitude', 'Gain per 5,000 feet altitude'],
    ['50% from 110 yds but below 50% by 150 yds', '50% from 110 yards but below 50% by 150 yards'],
    ['80-100 yd lay-up beats 30-50 yd lay-up', '80 to 100 yards lay-up beats 30 to 50 yards lay-up'],
    ['a 320-yd miss into rough vs. a 250-yd fairway', 'A 320-yard miss into rough against a 250-yard fairway'],
    ['costs <20 yds but cuts penalty rate by 50%+', 'Costs under 20 yards but cuts penalty rate by 50% or more'],
    ['putter from 30+ yds', 'Putter from 30 yards and out'],
    ['~1.3 yds per 10°F', 'About 1.3 yards per 10 degrees Fahrenheit'],
    ['10 mph headwind ≈ 10% distance loss', '10 miles an hour headwind about 10% distance loss'],
    ['gains <2 mph/year', 'Gains under 2 miles an hour a year'],
    ['lob with 58-60°', 'Lob with 58 to 60 degrees'],
    ['frequency is ~6-10/round', 'Frequency is about 6-10 a round'],
    ['**Long iron (2-4i):** stinger', '**Long iron (2- to 4-iron):** stinger'],
    ['very low launch (3i/4i)', 'Very low launch (3-iron/4-iron)'],
    ['bump-and-run with 7i-9i', 'Bump-and-run with 7-iron to 9-iron'],
    ['Switching to 3W/hybrid', 'Switching to 3-wood/hybrid'],
    ['pitch with PW/GW', 'Pitch with pitching wedge/gap wedge'],
    ['| Top-25 D1 | D2 / Top NAIA | D3 | JUCO |', '| Top-25 Division I | Division II / Top NAIA | Division III | Junior college |'],
    ['water/OB in the landing zone', 'Water/out of bounds in the landing zone'],
    ['fairway → ~65% GIR from 150; rough → ~45%', 'Fairway: about 65% greens in regulation from 150; rough: about 45%'],
    ['"Scrambling % × greens missed"', '"Scrambling % times greens missed"'],
    ['If player hits 12+ GIR', 'If player hits 12 or more greens in regulation'],
    ['- Short (<175): GIR target ~75%+; pin-hunting', '- Short (under 175): greens in regulation target about 75% or more; pin-hunting'],
  ];

  it.each(CASES)('writes out %j', (from, to) => {
    expect(plainText(from)).toBe(to);
  });

  it('has a case here for every rule, so a rule cannot sit in the table unproven', () => {
    for (const rule of EXPANSIONS) {
      const proven = CASES.some(([from]) => new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', '')).test(from));
      expect(proven, `no case exercises the rule ${rule.name}`).toBe(true);
    }
  });

  it('never touches a markdown link: a publication\'s title and its address stay as they are', () => {
    const line = 'GIR falls ~10% (Source: [Golf.com 3-putt by handicap](https://golf.com/instruction/3-putt-vs-1-putt/)) and [Data Golf — True SG Query Tool](https://datagolf.com/sg-query) agrees.';
    const out = plainText(line);
    expect(out).toContain('[Golf.com 3-putt by handicap](https://golf.com/instruction/3-putt-vs-1-putt/)');
    expect(out).toContain('[Data Golf — True SG Query Tool](https://datagolf.com/sg-query)');
    expect(out.startsWith('Greens in regulation falls about 10% (Source: ')).toBe(true);
    for (const s of SERVED_SECTIONS) for (const link of raw.get(s.id)!.text.match(LINKS) ?? []) expect(s.text, s.id).toContain(link);
  });

  it('never changes a number, nor a plus handicap, a percentage or a proper noun', () => {
    for (const fine of ['mostly +2 to 4 handicap', '71-72 | +2 to +4', 'the Tour\'s 99.4%', '6,600-7,000 yards', '2.3 strokes per round better', 'PGA Tour research (Pope & Schweitzer; Hickman & Metz)', 'NCAA, Golfstat, Clippd', 'USGA/Trackman', 'AJGA-invitational: 73-75 scoring on 6,800-yard setups', 'Stimp 12-13']) expect(plainText(fine).toLowerCase(), fine).toBe(fine.toLowerCase());
    // Across every served section: the numbers handed to the model are the document's, in the same order. The only
    // digits that become words are the ones in a name: "3-putt", "1-putt", "D1".
    const numbers = (text: string) => withoutLinks(text).match(/\d+(?:[.,]\d+)*/g) ?? [];
    for (const s of SERVED_SECTIONS) {
      const before = stripSelfReferences(servedText(s.id, raw.get(s.id)!.text)).replace(/\b[13]-([Pp]utt)/g, '$1').replace(/\bD[123]\b/g, 'Division');
      expect(numbers(s.text), s.id).toEqual(numbers(before));
    }
  });

  it('puts a heading in sentence case, without its chapter number, proper nouns kept', () => {
    expect(plainHeading('4. Causal Chains — What Actually Moves Scoring')).toBe('Causal chains — what actually moves scoring');
    expect(plainHeading('Drive → Approach Distance/Lie → GIR')).toBe('Drive to approach distance/lie to greens in regulation');
    expect(plainHeading('Lag Putting (>25 ft) → 3-Putt Avoidance')).toBe('Lag putting (over 25 feet) to three-putt avoidance');
    expect(plainHeading('Pressure Gap (Tournament vs Practice)')).toBe('Pressure gap (tournament against practice)');
    expect(plainHeading('Where College Differs from Tour')).toBe('Where college differs from Tour');
    expect(plainHeading('Variance Explained at PGA Tour Level')).toBe('Variance explained at PGA Tour level');
    expect(plainHeading('Shot Scope Make % by Handicap')).toBe('Shot Scope make % by handicap');
    expect(plainHeading('Junior / AJGA Benchmarks')).toBe('Junior / AJGA benchmarks');
    expect(plainHeading('SOURCES')).toBe('Sources');
    expect(plainText('| Lie | Key Effect | Skill That Matters | Expected Outcome |\n|---|---|---|---|\n| **Fairway** | Clean strike |')).toBe('| Lie | Key effect | Skill that matters | Expected outcome |\n|---|---|---|---|\n| **Fairway** | Clean strike |');
  });
});

describe('self-references', () => {
  it('are stripped from any text: an insight that cites the research document reads as if it never did', () => {
    expect(stripSelfReferences('Per Research doc §4, lag distance drives three-putts.')).toBe('Lag distance drives three-putts.');
    expect(stripSelfReferences('The pressure gap tends to show first (Research doc §9), so check the short putts.')).toBe('The pressure gap tends to show first, so check the short putts.');
    expect(stripSelfReferences('Sand shots are harder than they look. Research doc §5.')).toBe('Sand shots are harder than they look.');
    expect(stripSelfReferences('No college figure is quoted here without a source (see the next section for the few that have one).')).toBe('No college figure is quoted here without a source.');
    expect(stripSelfReferences('0 per round by definition; the Tour\'s own elite thresholds are in section 2 | Section 2 sources |')).toBe('0 per round by definition | |');
    expect(stripSelfReferences('See the research document §4.2: penalties lead to big numbers.')).toBe('Penalties lead to big numbers.');
    const untouched = 'Lag distance drives three-putts, and Shot Scope says the same.';
    expect(stripSelfReferences(untouched)).toBe(untouched);
  });

  it('are in nothing the reference serves: text, headings, the source line and the note', () => {
    for (const s of SERVED_SECTIONS) {
      expect(withoutLinks(s.text), s.id).not.toMatch(SELF_REFERENCE_GUARD);
      expect(`${s.chapter} ${s.heading}`, s.id).not.toMatch(SELF_REFERENCE_GUARD);
      expect(s.chapter, s.id).not.toMatch(/^\d+\./);
    }
    for (const t of REFERENCE_TOPICS) {
      const e = getGolfReference({ topic: t.id });
      const d = e.detail as { reference: Array<{ source: string; chapter: string; heading: string }> };
      for (const r of d.reference) expect(`${r.source} ${r.chapter} ${r.heading}`, t.id).not.toMatch(/§|\b\d+\.\s[A-Z]|[Rr]esearch doc/);
      expect(e.coverage_note).toMatch(/Never cite a chapter, a section or this reference by number\./);
      // The workaround note is gone: the text no longer needs translating.
      expect(e.coverage_note).not.toMatch(/shorthand/);
    }
  });
});

describe('what the reference hands the model', () => {
  // The writing rules every answer is held to (eval/golf-sense.json, global_forbid), minus one: the reference keeps the
  // document's tables and bold labels, which is its own structure, not notation for an answer.
  const rules = golfSenseQuestions()[0]!.forbid.filter((f) => ['abbreviation', 'sample_notation', 'wrong_case', 'proper_noun_case', 'names_internals'].includes(f.pattern));

  it('contains none of the tokens the writing rules forbid, outside a publication\'s own title', () => {
    expect(rules.map((r) => r.pattern).sort()).toEqual(['abbreviation', 'names_internals', 'proper_noun_case', 'sample_notation', 'wrong_case']);
    for (const s of SERVED_SECTIONS) {
      const prose = withoutLinks(`${s.chapter}\n${s.heading}\n${s.text}`);
      for (const rule of rules) expect(prose.match(rule.re)?.[0] ?? null, `${s.id}: ${rule.pattern}`).toBeNull();
      // And none of the document's other shorthand.
      expect(prose.match(/\bSG\b|\bGIR\b|\bFW\b|\bHCP\b|\bOB\b|\bJUCO\b|\bD[123]\b|\b[PG]W\b|\b\dW\b|\b\di\b|\bft\b|\byds?\b|\bmph\b|\bavg\b|\bvs\b|~|≈|→|×|°/)?.[0] ?? null, s.id).toBeNull();
    }
    // The same holds for what a read actually returns, the note and the topic index included.
    for (const t of REFERENCE_TOPICS.filter((t) => t.id !== 'sources')) {
      const e = getGolfReference({ topic: t.id });
      const handed = withoutLinks(JSON.stringify({ ...e, as_of: undefined, detail: { ...(e.detail as object), reference: (e.detail as { reference: Array<{ section: string }> }).reference.map((r) => ({ ...r, section: undefined })) } }));
      for (const rule of rules.filter((r) => r.pattern !== 'names_internals')) expect(handed.match(rule.re)?.[0] ?? null, `${t.id}: ${rule.pattern}`).toBeNull();
    }
    const miss = withoutLinks(JSON.stringify(getGolfReference({ topic: 'zzzz qqqq' }).detail));
    for (const rule of rules.filter((r) => r.pattern !== 'names_internals')) expect(miss.match(rule.re)?.[0] ?? null, `miss: ${rule.pattern}`).toBeNull();
  });

  it('starts every sentence, bullet and table cell with a capital where the expansion wrote the first word', () => {
    for (const s of SERVED_SECTIONS) expect(withoutLinks(s.text).match(/(?:^|\n)(?:[-*>]\s|\d+\.\s)?\*{0,2}(?:strokes gained|greens in regulation|fairways? hit|three-putt|about|under|over)\b/)?.[0] ?? null, s.id).toBeNull();
  });

  it('is still found by a question written in shorthand', () => {
    const headings = (topic: string) => (getGolfReference({ topic }).detail as { reference: Array<{ heading: string }> }).reference.map((r) => r.heading);
    expect(headings('GIR and scrambling').join(' | ')).toMatch(/[Gg]reens in regulation/);
    expect(headings('3-putts from long range').join(' | ')).toMatch(/three-putt/);
    expect(headings('SG approach').join(' | ').length).toBeGreaterThan(0);
  });

  it('costs a little more than the shorthand did (characters / 4, by topic)', () => {
    const served = new Map(SERVED_SECTIONS.map((s) => [s.id, s]));
    let before = 0;
    let after = 0;
    for (const t of REFERENCE_TOPICS) {
      const b = t.sections.reduce((n, id) => n + `${raw.get(id)!.chapter} ${raw.get(id)!.heading} ${servedText(id, raw.get(id)!.text)}`.length, 0);
      const a = t.sections.reduce((n, id) => n + `${served.get(id)!.chapter} ${served.get(id)!.heading} ${served.get(id)!.text}`.length, 0);
      console.info(`reference topic ${t.id}: ${tokens('x'.repeat(b))} -> ${tokens('x'.repeat(a))} tokens`);
      before += b;
      after += a;
      // Writing a term out never doubles a section.
      expect(a).toBeLessThan(b * 1.35);
    }
    expect(after).toBeLessThan(before * 1.12);
  });
});
