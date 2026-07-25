import { describe, it, expect } from 'vitest';
import { formatScoringAverage } from './format-scoring-average';

describe('formatScoringAverage', () => {
  it('cuts the raw mean down to a tenth', () => {
    // The exact value a coach saw on the Roster page before this existed.
    expect(formatScoringAverage(75.58333333333334)).toBe('75.6');
  });

  it('keeps a trailing zero so a column of averages stays aligned', () => {
    expect(formatScoringAverage(76)).toBe('76.0');
  });

  it('renders an em dash for a player with no rounds', () => {
    expect(formatScoringAverage(null)).toBe('—');
    expect(formatScoringAverage(undefined)).toBe('—');
  });

  it('refuses to print a non-finite average as a number', () => {
    // A zero-round divide reaches the UI as NaN; "NaN avg" is worse than "—".
    expect(formatScoringAverage(Number.NaN)).toBe('—');
    expect(formatScoringAverage(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
