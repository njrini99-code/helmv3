import { describe, expect, it } from 'vitest';
import { teamSentence } from '../StatsTeamPhoneShs';

describe('teamSentence', () => {
  it('names who gains and who loses', () => {
    expect(teamSentence([{ name: 'Sam', value: 1 }, { name: 'Lee', value: -2 }])).toBe('Sam gains the most; Lee loses the most.');
  });
  it('reads "loses the least" when everyone is below zero', () => {
    expect(teamSentence([{ name: 'Sam', value: -1 }, { name: 'Lee', value: -2 }])).toBe('Sam loses the least; Lee loses the most.');
  });
  it('says nothing with no figures', () => {
    expect(teamSentence([{ name: 'Sam', value: null }])).toBeNull();
  });
});
