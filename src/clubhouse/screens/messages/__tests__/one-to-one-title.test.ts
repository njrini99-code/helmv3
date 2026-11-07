import { describe, expect, it } from 'vitest';
import { isNamedForOneOfTwo } from '../model';

describe('a two-person thread named for one of the two', () => {
  const row = { is_group: true, participant_count: 2, title: 'Cole Bennett' };
  it('reads as one-to-one on both sides, whoever is looking', () => {
    expect(isNamedForOneOfTwo(row, ['Cole Bennett', 'Nick Rini'])).toBe(true); // Cole's own view
    expect(isNamedForOneOfTwo(row, ['Nick Rini', 'Cole Bennett'])).toBe(true); // the coach's view
    expect(isNamedForOneOfTwo({ ...row, title: '' }, ['Nick Rini'])).toBe(true);
  });
  it('a named group that holds one player stays a group (audit L4)', () => {
    expect(isNamedForOneOfTwo({ ...row, title: 'Putting group' }, ['Cole Bennett', 'Nick Rini'])).toBe(false);
  });
  it('the channel and three people are never one-to-one', () => {
    expect(isNamedForOneOfTwo({ ...row, is_team_channel: true }, ['Cole Bennett'])).toBe(false);
    expect(isNamedForOneOfTwo({ ...row, participant_count: 3 }, ['Cole Bennett'])).toBe(false);
  });
});
