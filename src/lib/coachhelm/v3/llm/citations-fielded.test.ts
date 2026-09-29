import { describe, it, expect } from 'vitest';
import {
  citationField,
  extractNumericTokens,
  isFieldedEvidence,
  verifyCitations,
  type CitationField,
} from './citations';
import type { EvidenceClaim } from './types';

/**
 * Field-aware citation audit (CoachHelm deep audit row 40a).
 *
 * The legacy verifier is field-blind: every numeric token only has to equal
 * ANY evidence value, so "31 fairways" passes when 31 is the putt count. The
 * fielded mode binds each number to the stat its surrounding words name and
 * checks it against THAT stat's value only.
 */

function ev(entries: Array<[CitationField, string | number]>): EvidenceClaim[] {
  return entries.map(([f, v]) => ({ field: citationField(f), value: v }));
}

// An 18-hole round: 74 (+2), 30 putts, FIR 71.4%, GIR 66.7%, 37/37,
// season average 74.2, season best 70.
const ROUND = ev([
  ['score', 74],
  ['to_par', 2],
  ['holes', 18],
  ['putts', 30],
  ['fairways_pct', 71.4],
  ['fairways_pct', 71],
  ['gir_pct', 66.7],
  ['gir_pct', 67],
  ['front_nine', 38],
  ['back_nine', 36],
  ['season_avg', 74.2],
  ['season_best', 70],
]);

describe('isFieldedEvidence — opt-in by evidence shape', () => {
  it('engages only when every entry carries a fielded key', () => {
    expect(isFieldedEvidence(ROUND)).toBe(true);
    expect(isFieldedEvidence([])).toBe(false);
    expect(isFieldedEvidence([...ROUND, { field: 'total_score', value: 74 }])).toBe(false);
  });

  it('never engages on the bare names other callers already use (round-review gir_pct, hero-narrative, practice-rx)', () => {
    expect(isFieldedEvidence([{ field: 'gir_pct', value: 50 }])).toBe(false);
    expect(isFieldedEvidence([{ field: 'metric_label', value: 'GIR' }, { field: 'your_value', value: '50%' }])).toBe(false);
    expect(isFieldedEvidence([{ field: 'goal_id', value: 'g1' }, { field: 'window_days', value: 30 }])).toBe(false);
    expect(isFieldedEvidence([{ field: 'recap_fact_figure', value: '74' }])).toBe(false);
  });
});

describe('verifyCitations — legacy callers keep the field-blind set match', () => {
  it('still accepts a true number in the wrong slot when evidence is not fielded (unchanged behaviour)', () => {
    const legacy: EvidenceClaim[] = [
      { field: 'total_putts', value: 30 },
      { field: 'total_score', value: 74 },
    ];
    expect(verifyCitations('You hit 30 fairways.', legacy).verified).toBe(true);
  });
});

describe('verifyCitations — fielded mode binds each number to its named stat', () => {
  it('accepts every number when each sits next to its own stat', () => {
    const text =
      'Caden carded 74 with 30 putts, finding 71.4% of fairways and 67% of greens. A 38 on the front and 36 coming home leaves his 74.2 average in reach.';
    const out = verifyCitations(text, ROUND);
    expect(out.unmatched_tokens).toEqual([]);
    expect(out.verified).toBe(true);
  });

  it('rejects a true number in the wrong slot: the putt count written as fairways', () => {
    const out = verifyCitations('Caden hit 30 fairways on the way to 74.', ROUND);
    expect(out.verified).toBe(false);
    expect(out.unmatched_tokens).toEqual(['30']);
    expect(out.mismatched_fields).toEqual([{ token: '30', bound_to: 'fairways_pct' }]);
  });

  it('rejects GIR cited at the fairway percentage', () => {
    const out = verifyCitations('Caden found 71.4% of greens.', ROUND);
    expect(out.verified).toBe(false);
    expect(out.unmatched_tokens).toEqual(['71.4%']);
  });

  it('binds a left-hand label: "GIR 67%" and "season best of 70"', () => {
    expect(verifyCitations('His GIR 67% held up.', ROUND).verified).toBe(true);
    expect(verifyCitations('He matched his season best of 70.', ROUND).verified).toBe(true);
    expect(verifyCitations('He matched his season best of 74.', ROUND).verified).toBe(false);
  });

  it('reads "percent" as a percentage and binds the noun after it', () => {
    expect(verifyCitations('He hit 66.7 percent of greens in regulation.', ROUND).verified).toBe(true);
    expect(verifyCitations('He hit 71.4 percent of greens in regulation.', ROUND).verified).toBe(false);
  });

  it('checks to-par only on "N over/under", and not "over 18 holes"', () => {
    expect(verifyCitations('Caden finished 2 over par.', ROUND).verified).toBe(true);
    expect(verifyCitations('Caden finished 3 over par.', ROUND).verified).toBe(false);
    expect(verifyCitations('Caden carded 74 over 18 holes.', ROUND).verified).toBe(true);
  });

  it('does not cross a clause boundary or another number when looking for a cue', () => {
    // "putts" belongs to 30; 74 must not borrow it.
    expect(verifyCitations('30 putts and 74 on the card.', ROUND).verified).toBe(true);
    expect(verifyCitations('Caden shot 74, needing 30 putts.', ROUND).verified).toBe(true);
  });

  it('treats "front 9" / "back 9" as the name of a nine, not a cited figure', () => {
    expect(verifyCitations('He went 38 on the front 9 and 36 on the back 9.', ROUND).verified).toBe(true);
    expect(extractNumericTokens('the back 9')).toEqual(['9']); // the legacy scanner is unchanged
  });

  it('checks a cued safe token instead of waving it through', () => {
    // "1 under par" is a claim about to-par, not a harmless counting word.
    const out = verifyCitations('Caden finished 1 under par.', ROUND);
    expect(out.verified).toBe(false);
    expect(out.unmatched_tokens).toEqual(['1']);
  });

  it('checks season comparisons by direction: "N strokes better than his average"', () => {
    const below = ev([
      ['score', 72],
      ['season_avg', 74.2],
      ['season_avg_below', 2.2],
      ['season_avg_below', 2],
    ]);
    expect(verifyCitations('Caden shot 72, 2.2 strokes better than his season average.', below).verified).toBe(true);
    expect(verifyCitations('Caden shot 72, 2 shots below his average.', below).verified).toBe(true);
    // Right size, wrong direction: no season_avg_above was registered.
    expect(verifyCitations('Caden shot 72, 2.2 strokes worse than his season average.', below).verified).toBe(false);
  });

  describe('restricted rule for a number with no recognizable field cue', () => {
    it('accepts a bare integer only when it equals the score', () => {
      expect(verifyCitations("Caden's 74 at Pinehurst was steady.", ROUND).verified).toBe(true);
      // 30 is a real value (putts) but nothing names it: reject.
      const out = verifyCitations("Caden's 30 at Pinehurst was steady.", ROUND);
      expect(out.verified).toBe(false);
      expect(out.mismatched_fields).toEqual([{ token: '30', bound_to: null }]);
    });

    it('accepts a bare percentage that equals one of the percentage stats', () => {
      expect(verifyCitations('Hitting 71% kept him in play.', ROUND).verified).toBe(true);
      expect(verifyCitations('Hitting 30% kept him in play.', ROUND).verified).toBe(false);
    });

    it('reads a bare negative number as signed to-par', () => {
      const under = ev([
        ['score', 70],
        ['to_par', 2],
        ['to_par', -2],
      ]);
      expect(verifyCitations('Caden posted 70 (-2) at home.', under).verified).toBe(true);
      expect(verifyCitations('Caden posted 70 (-3) at home.', under).verified).toBe(false);
    });

    it('keeps the universally-safe small counts for bare numbers', () => {
      expect(verifyCitations('Two sentences, 1 takeaway, 74 on the card.', ROUND).verified).toBe(true);
    });
  });

  it('rejects the production wrong-slot recap the field-blind audit let through', () => {
    // Stored recap (2026-09): "carding 30 strokes on six under par" when 30 is
    // not a score. Rebuilt here against a round whose putts are 30.
    const out = verifyCitations(
      "Blake's back-nine execution, carding 30 strokes, matched his season best of 70.",
      ROUND,
    );
    expect(out.verified).toBe(false);
    expect(out.unmatched_tokens).toEqual(['30']);
  });
});

describe('fielded audit: cue tuning from the production replay', () => {
  const ev = [
    { field: citationField('score'), value: 74 },
    { field: citationField('front_nine'), value: 38 },
    { field: citationField('back_nine'), value: 36 },
    { field: citationField('putts'), value: 31 },
    { field: citationField('gir_pct'), value: 50 },
  ];

  it('accepts a nine score stated with a score verb when the sentence names a nine', () => {
    expect(verifyCitations('He came home strong on the back nine, where he carded 36.', ev).verified).toBe(true);
    expect(verifyCitations("Nick's second nine, a 36, steadied the round.", ev).verified).toBe(true);
  });

  it('still rejects a nine figure that matches neither nine', () => {
    expect(verifyCitations('On the back nine he carded 33.', ev).verified).toBe(false);
  });

  it('does not let a nine rescue a wrong score outside a nine sentence', () => {
    expect(verifyCitations('He carded 36 at Pinehurst.', ev).verified).toBe(false);
  });

  it('reads "strokes on the greens" as putts, not GIR', () => {
    expect(verifyCitations('He needed 31 strokes on the greens.', ev).verified).toBe(true);
    expect(verifyCitations('He needed 50 strokes on the greens.', ev).verified).toBe(false);
  });
});

describe('fielded audit: a verb ends the right-hand cue search', () => {
  const ev = [
    { field: citationField('score'), value: 74 },
    { field: citationField('back_nine'), value: 39 },
    { field: citationField('fairways_pct'), value: 50 },
  ];
  it('binds "back nine collapse to 39 suggests that fairway accuracy" to the back nine', () => {
    expect(verifyCitations('The back nine collapse to 39 suggests that fairway accuracy will decide it.', ev).verified).toBe(true);
  });
  it('still binds a direct fairway figure', () => {
    expect(verifyCitations('He found 50 percent of fairways.', ev).verified).toBe(true);
    expect(verifyCitations('He found 39 percent of fairways.', ev).verified).toBe(false);
  });
});

describe('fielded audit: putting-stroke phrasing', () => {
  const ev = [
    { field: citationField('score'), value: 76 },
    { field: citationField('putts'), value: 32 },
    { field: citationField('fairways_pct'), value: 78.6 },
  ];
  it('binds "putting held steady at 32 strokes" to putts', () => {
    expect(verifyCitations('His putting held steady at 32 strokes.', ev).verified).toBe(true);
    expect(verifyCitations('His putting held steady at 33 strokes.', ev).verified).toBe(false);
  });
  it('does not let a later clause steal the number', () => {
    expect(verifyCitations("The putter's 32 strokes while fairways kept him in play at 78.6%.", ev).verified).toBe(true);
  });
});
