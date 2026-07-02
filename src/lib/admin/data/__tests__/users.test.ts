import { describe, it, expect } from 'vitest';
import { classifyAtRisk } from '@/lib/admin/data/users';

const now = new Date('2026-07-01T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();

describe('classifyAtRisk', () => {
  it('active when seen within 14d', () => {
    expect(classifyAtRisk({ lastSeen: daysAgo(3), createdAt: daysAgo(100) }, now)).toBe('active');
  });
  it('at-risk past 14d inactivity', () => {
    expect(classifyAtRisk({ lastSeen: daysAgo(20), createdAt: daysAgo(100) }, now)).toBe('at-risk');
  });
  it('never-seen when lastSeen is null and account is older than 3d (grace for fresh signups)', () => {
    expect(classifyAtRisk({ lastSeen: null, createdAt: daysAgo(10) }, now)).toBe('never-seen');
    expect(classifyAtRisk({ lastSeen: null, createdAt: daysAgo(1) }, now)).toBe('active');
  });
});
