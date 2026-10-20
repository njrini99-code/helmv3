import { describe, expect, it } from 'vitest';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { markLocallyRead, moreLabel, notificationKey, openStack, stackFeed } from '../notification-stacks';

const item = (id: string, category: UnifiedNotificationItem['category'], minutesAgo: number, read = false): UnifiedNotificationItem => ({
  id,
  source: 'notifications',
  category,
  title: id,
  body: null,
  action_url: null,
  created_at: new Date(Date.UTC(2026, 9, 12, 12) - minutesAgo * 60000).toISOString(),
  read_at: read ? '2026-10-12T12:00:00.000Z' : null,
});

describe('stackFeed', () => {
  it('stacks unread items by kind, the stack with the newest item first, newest first inside', () => {
    const feed = stackFeed([item('m1', 'messages', 30), item('c1', 'coachhelm', 5), item('m2', 'messages', 2), item('e1', 'events', 60)]);
    expect(feed.fresh.map((s) => s.key)).toEqual(['new:messages', 'new:coachhelm', 'new:events']);
    expect(feed.fresh[0]!.items.map((i) => i.id)).toEqual(['m2', 'm1']);
    expect(feed.unread).toBe(4);
    expect(feed.earlier).toBeNull();
  });

  it('puts everything read in one Earlier stack, newest first', () => {
    const feed = stackFeed([item('a', 'events', 50, true), item('b', 'messages', 1), item('c', 'tasks', 10, true)]);
    expect(feed.fresh.map((s) => s.key)).toEqual(['new:messages']);
    expect(feed.earlier?.items.map((i) => i.id)).toEqual(['c', 'a']);
    expect(feed.earlier?.unread).toBe(0);
  });

  it('sorts a row with no real time to the bottom instead of the top', () => {
    const bad = { ...item('x', 'events', 0), created_at: 'not a date' };
    const feed = stackFeed([bad, item('y', 'events', 90)]);
    expect(feed.fresh[0]!.items.map((i) => i.id)).toEqual(['y', 'x']);
  });
});

describe('openStack', () => {
  it('opens the only New stack when it holds more than one item, and nothing otherwise', () => {
    expect(openStack(stackFeed([item('a', 'messages', 1), item('b', 'messages', 2)]), null)).toBe('new:messages');
    expect(openStack(stackFeed([item('a', 'messages', 1)]), null)).toBeNull();
    expect(openStack(stackFeed([item('a', 'messages', 1), item('b', 'events', 2)]), null)).toBeNull();
  });

  it('keeps the chosen stack while it exists, and forgets it once it is gone', () => {
    const feed = stackFeed([item('a', 'messages', 1), item('b', 'events', 2)]);
    expect(openStack(feed, 'new:events')).toBe('new:events');
    expect(openStack(feed, 'new:tasks')).toBeNull();
  });
});

describe('markLocallyRead', () => {
  it('marks only the given items, keeps an earlier read time, and moves them to Earlier', () => {
    const items = [item('a', 'messages', 1), item('b', 'messages', 2), item('c', 'events', 3, true)];
    const next = markLocallyRead(items, new Set([notificationKey(items[0]!), notificationKey(items[2]!)]), '2026-10-12T13:00:00.000Z');
    expect(next[0]!.read_at).toBe('2026-10-12T13:00:00.000Z');
    expect(next[1]!.read_at).toBeNull();
    expect(next[2]!.read_at).toBe('2026-10-12T12:00:00.000Z');
    const feed = stackFeed(next);
    expect(feed.fresh[0]!.items.map((i) => i.id)).toEqual(['b']);
    expect(feed.earlier?.items.map((i) => i.id)).toEqual(['a', 'c']);
  });
});

describe('moreLabel', () => {
  it('counts the cards folded under the top one', () => {
    expect(moreLabel(stackFeed([item('a', 'tasks', 1), item('b', 'tasks', 2), item('c', 'tasks', 3)]).fresh[0]!)).toBe('2 more');
    expect(moreLabel(stackFeed([item('a', 'tasks', 1)]).fresh[0]!)).toBeNull();
  });
});
