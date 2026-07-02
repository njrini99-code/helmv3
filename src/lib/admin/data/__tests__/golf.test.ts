import { describe, it, expect } from 'vitest';
import { classifyTeamHealth } from '@/lib/admin/data/golf';

const now = new Date('2026-07-01T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

describe('classifyTeamHealth', () => {
  it('active within 7d', () => {
    expect(classifyTeamHealth(daysAgo(2), now)).toBe('active');
  });
  it('cooling between 7 and 14d', () => {
    expect(classifyTeamHealth(daysAgo(10), now)).toBe('cooling');
  });
  it('dormant past 14d or never', () => {
    expect(classifyTeamHealth(daysAgo(30), now)).toBe('dormant');
    expect(classifyTeamHealth(null, now)).toBe('dormant');
  });
});
