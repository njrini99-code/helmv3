import { afterEach, describe, expect, it } from 'vitest';
import { fullDateTime, relativeTimeFrom } from '../time-format';

// Server (UTC) and device (US zone) must print the same text, or hydration of
// the SSR-seeded feed throws React #418.
describe('notification time-format is timezone-independent', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  const now = Date.parse('2026-10-06T02:00:00Z');
  const thirtyDaysAgo = new Date(now - 30 * 86_400_000).toISOString();

  it.each(['UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'])(
    'prints identical text under TZ=%s',
    (tz) => {
      process.env.TZ = tz;
      expect(relativeTimeFrom(thirtyDaysAgo, now)).toBe('Sep 5');
      expect(fullDateTime(thirtyDaysAgo)).toBe('Sat, Sep 5, 2026, 10:00 PM');
    },
  );

  it('keeps coarse relative buckets', () => {
    expect(relativeTimeFrom(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3h ago');
  });
});
