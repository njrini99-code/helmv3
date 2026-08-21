import { describe, it, expect } from 'vitest';
import { formatStuckRoundIdle } from '../OverviewBriefing';

describe('formatStuckRoundIdle', () => {
  it('formats under a day in hours', () => {
    expect(formatStuckRoundIdle(3)).toBe('3h idle');
  });

  it('formats a day or more in days', () => {
    expect(formatStuckRoundIdle(30)).toBe('1d idle');
    expect(formatStuckRoundIdle(48)).toBe('2d idle');
  });
});
