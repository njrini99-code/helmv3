import { describe, it, expect } from 'vitest';
import { detectFailureBurst } from '@/lib/admin/data/auth';

const now = new Date('2026-07-01T12:00:00Z');
const at = (minAgo: number) => ({ created_at: new Date(now.getTime() - minAgo * 60000).toISOString() });

describe('detectFailureBurst', () => {
  it('flags >= threshold failures inside the window', () => {
    expect(detectFailureBurst([at(1), at(5), at(9), at(14)], 15, 4, now)).toBe(true);
  });
  it('ignores failures outside the window', () => {
    expect(detectFailureBurst([at(1), at(20), at(40), at(60)], 15, 4, now)).toBe(false);
  });
  it('quiet feed → no burst', () => {
    expect(detectFailureBurst([], 15, 4, now)).toBe(false);
  });
});
