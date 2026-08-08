import { describe, it, expect } from 'vitest';
import { livenessBand } from '../data/triage';

/**
 * The triage queue must lead with what is happening NOW.
 *
 * Ranking was `affectedUsers DESC, lastSeen DESC`. In production that first key
 * is very nearly binary — on 2026-08-05 seven groups had exactly 1 affected
 * user and ten had 0 — so it decided almost nothing, and recency was left
 * arbitrating from second place where it could never outrank a stale 1-user
 * row. The queue's top item was 8.1 hours silent while two incidents from the
 * last 18 minutes sat at #8 and #9.
 *
 * Liveness now leads and headcount breaks ties WITHIN a band, which keeps the
 * property the original comment defended: raw volume still never ranks, so one
 * retry-looping job cannot bury a low-volume auth bug.
 */

const H = 60 * 60 * 1000;
const NOW = Date.parse('2026-08-05T20:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('livenessBand', () => {
  it.each([
    ['1 minute', 60 * 1000, 0],
    ['59 minutes', 59 * 60 * 1000, 0],
    ['61 minutes', 61 * 60 * 1000, 1],
    ['5 hours', 5 * H, 1],
    ['7 hours', 7 * H, 2],
    ['8.1 hours — the row that was ranked #1', 8.1 * H, 2],
  ])('%s ago → band %i', (_label, age, band) => {
    expect(livenessBand(ago(age), NOW)).toBe(band);
  });

  it('treats an unparseable timestamp as stale rather than throwing', () => {
    expect(livenessBand('not-a-date', NOW)).toBe(2);
    expect(() => livenessBand('', NOW)).not.toThrow();
  });
});

describe('ranking intent', () => {
  /** The comparator, mirrored — band, then users, then recency. */
  const rank = (rows: { id: string; lastSeen: string; affectedUsers: number }[]) =>
    [...rows].sort((a, b) => {
      const d = livenessBand(a.lastSeen, NOW) - livenessBand(b.lastSeen, NOW);
      if (d !== 0) return d;
      if (b.affectedUsers !== a.affectedUsers) return b.affectedUsers - a.affectedUsers;
      return b.lastSeen.localeCompare(a.lastSeen);
    }).map((r) => r.id);

  it('puts a fresh low-headcount incident above a stale higher-headcount one', () => {
    // Exactly the production shape that motivated this.
    const order = rank([
      { id: 'stale-8h-1user', lastSeen: ago(8.1 * H), affectedUsers: 1 },
      { id: 'live-18min-1user', lastSeen: ago(18 * 60 * 1000), affectedUsers: 1 },
      { id: 'stale-7h-4users', lastSeen: ago(7 * H), affectedUsers: 4 },
    ]);
    expect(order[0]).toBe('live-18min-1user');
  });

  it('still ranks by affected users WITHIN a band', () => {
    // The original property: headcount matters, it just no longer outranks
    // "is this on fire right now".
    const order = rank([
      { id: 'live-1user', lastSeen: ago(10 * 60 * 1000), affectedUsers: 1 },
      { id: 'live-9users', lastSeen: ago(50 * 60 * 1000), affectedUsers: 9 },
    ]);
    expect(order).toEqual(['live-9users', 'live-1user']);
  });

  it('never lets raw event volume rank — it is not an input at all', () => {
    const order = rank([
      { id: 'quiet-but-live', lastSeen: ago(5 * 60 * 1000), affectedUsers: 0 },
      { id: 'loud-but-stale', lastSeen: ago(30 * H), affectedUsers: 0 },
    ]);
    expect(order[0]).toBe('quiet-but-live');
  });

  it('is a total order — same band, same users, same instant is stable', () => {
    const same = ago(20 * 60 * 1000);
    const order = rank([
      { id: 'b', lastSeen: same, affectedUsers: 2 },
      { id: 'a', lastSeen: same, affectedUsers: 2 },
    ]);
    expect(order).toHaveLength(2);
  });
});
