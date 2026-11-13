import { describe, expect, it } from 'vitest';
import { displayHandicap } from '../season';
import { hcpWords } from '../../screens/roster/format';

/**
 * Coach audit 13 Nov 2026 (§8, data): five Guilford players have `handicap = 0` and no `handicap_index`, and the roster
 * showed them as scratch, sorting them to the top. No writer in the app stores a 0 default; the value came with the team's
 * data. A 0 with no index is read as not known; an index of 0 (a verified scratch) and any other handicap stay.
 */
describe('displayHandicap', () => {
  it('a 0 with no index is not known', () => {
    expect(displayHandicap({ handicap: 0, handicap_index: null })).toBeNull();
  });

  it('an index of 0 is a scratch golfer', () => {
    expect(displayHandicap({ handicap: 0, handicap_index: 0 })).toBe(0);
    expect(displayHandicap({ handicap: null, handicap_index: 0 })).toBe(0);
  });

  it('the index first, else any other handicap', () => {
    expect(displayHandicap({ handicap: 4, handicap_index: 2.4 })).toBe(2.4);
    expect(displayHandicap({ handicap: 3.1, handicap_index: null })).toBe(3.1);
    expect(displayHandicap({ handicap: -1.2, handicap_index: null })).toBe(-1.2);
    expect(displayHandicap(null)).toBeNull();
  });
});

describe('the phone roster’s handicap words', () => {
  it('are left out when the handicap is not known, never "— HCP"', () => {
    expect(hcpWords(null)).toBeNull();
  });

  it('read the handicap with its short name otherwise', () => {
    expect(hcpWords(2.4)).toBe('2.4 HCP');
    expect(hcpWords(-1.2)).toBe('+1.2 HCP');
  });
});
