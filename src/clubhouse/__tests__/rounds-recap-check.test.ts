import { describe, expect, it } from 'vitest';
import { checkedRecap, sentences } from '../screens/rounds/recap-check';
import { PREVIEW_REVIEW } from '../preview/fixtures-round-review';

const SG = { total: 0.6, tee: 0.4, approach: 1.3, around: -0.2, putting: -0.9 };

describe('P011-D13 the round recap agrees with its own figures', () => {
  it('cuts the fixture’s “the putter held steady” beside putting −0.9 and keeps the rest', () => {
    const out = checkedRecap(PREVIEW_REVIEW)!;
    expect(out).not.toMatch(/putter/);
    expect(out).toContain('Ball-striking carried this one at Finley.');
    expect(out).toContain('where four bogeys undid two birdies.');
    expect(out).toContain('Scoring the long holes is the work before Thursday.');
  });

  it('drops a sentence that blames a part of the game the round gained, or cites figures it does not have', () => {
    const r = { strokesGained: SG, putts: 35 };
    expect(checkedRecap({ ...r, recap: 'Your approach play cost you today. Putting lost 0.9.' })).toBe('Putting lost 0.9.');
    expect(checkedRecap({ ...r, recap: 'Approach gained 2.4 strokes. You took 31 putts.' })).toBeNull();
    expect(checkedRecap({ ...r, recap: 'You took 35 putts.' })).toBe('You took 35 putts.');
  });

  it('keeps a recap the figures do not contradict, and shows none when there is none', () => {
    expect(checkedRecap({ strokesGained: SG, putts: 35, recap: 'The putter cost you a few. Driving was solid.' })).toBe('The putter cost you a few. Driving was solid.');
    expect(checkedRecap({ strokesGained: null, putts: null, recap: null })).toBeNull();
    expect(sentences('One. Two!')).toEqual(['One.', 'Two!']);
  });
});
