import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

import { bucketFor, weekStart } from '../player-allowance';

describe('player allowance', () => {
  it('turns usage into a word only', () => {
    expect(bucketFor(0)).toBe('plenty');
    expect(bucketFor(4_000_000)).toBe('low');
    expect(bucketFor(5_000_000)).toBe('out');
  });
  it('honours a staff raise', () => {
    expect(bucketFor(5_000_000, 10_000_000)).toBe('plenty');
  });
  it('starts the week on Monday in the team zone', () => {
    expect(weekStart(new Date('2026-11-04T12:00:00Z'), 'America/New_York')).toBe('2026-11-02');
    // Monday 1am UTC is still Sunday in New York.
    expect(weekStart(new Date('2026-11-09T01:00:00Z'), 'America/New_York')).toBe('2026-11-02');
  });
});
