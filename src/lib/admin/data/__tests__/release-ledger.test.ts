import { describe, it, expect } from 'vitest';
import { bucketLabel, bucketStartMs, reignIndexFor } from '@/lib/admin/data/release-ledger';

describe('bucketStartMs', () => {
  it('floors to the top of the UTC hour', () => {
    const t = Date.parse('2026-07-16T14:37:09.123Z');
    expect(bucketStartMs(t)).toBe(Date.parse('2026-07-16T14:00:00.000Z'));
  });

  it('is idempotent on an exact hour boundary', () => {
    const t = Date.parse('2026-07-16T14:00:00.000Z');
    expect(bucketStartMs(t)).toBe(t);
  });
});

describe('bucketLabel', () => {
  it('renders a deterministic UTC label regardless of host timezone', () => {
    const t = Date.parse('2026-01-05T09:00:00.000Z');
    expect(bucketLabel(t)).toBe('01/05 09:00 UTC');
  });
});

describe('reignIndexFor', () => {
  // Newest-first, matching fetchReleaseLedger's own ordering.
  const cards = [
    { createdAt: 300 }, // newest
    { createdAt: 200 },
    { createdAt: 100 }, // oldest
  ];

  it('assigns a timestamp to the newest card whose createdAt it is >= to', () => {
    expect(reignIndexFor(350, cards)).toBe(0); // after the newest deploy — its reign
    expect(reignIndexFor(300, cards)).toBe(0); // exactly at the newest deploy's own createdAt
    expect(reignIndexFor(250, cards)).toBe(1); // between deploy 1 and 0 — deploy 1's reign
    expect(reignIndexFor(150, cards)).toBe(2); // between deploy 2 and 1 — deploy 2's reign
    expect(reignIndexFor(100, cards)).toBe(2); // exactly at the oldest deploy's own createdAt
  });

  it('returns null for anything before the oldest card in the ledger', () => {
    expect(reignIndexFor(99, cards)).toBeNull();
    expect(reignIndexFor(0, cards)).toBeNull();
  });

  it('returns null for an empty card list', () => {
    expect(reignIndexFor(500, [])).toBeNull();
  });
});
