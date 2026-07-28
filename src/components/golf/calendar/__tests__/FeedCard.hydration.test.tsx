import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FeedCard, type CalendarFeed } from '@/components/golf/calendar/FeedCard';

/**
 * Regression for the React #418 Helm Bridge incident on `calendar_events`
 * (fingerprint a1172aa2 — "Hydration failed because the server rendered text
 * didn't match the client", 5 occurrences / 2 users, last seen 2026-07-22).
 *
 * FeedCard is a 'use client' component, so it ALSO renders on the server. It
 * used `formatDistanceToNow(...)`, which reads the wall clock during render —
 * the server and the client's first pass land on different sides of a minute/
 * hour boundary and the text node disagrees.
 *
 * The invariant that actually prevents #418 is: server-rendered markup must
 * not depend on the clock. These tests assert exactly that, rather than
 * asserting a particular label, so they keep holding if the copy changes.
 */

const feed: CalendarFeed = {
  id: 'feed-1',
  name: 'Team Events',
  type: 'team',
  url: 'https://example.com/feed/abc.ics',
  created_at: '2026-07-20T10:00:00.000Z',
  last_synced_at: '2026-07-22T09:30:00.000Z',
};

function ssr() {
  return renderToString(
    <FeedCard feed={feed} onRegenerate={async () => {}} onDelete={async () => {}} />,
  );
}

describe('FeedCard server render (React #418 regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces identical markup no matter what time the server renders at', () => {
    vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
    const first = ssr();

    // The exact drift that produced the incident: a later render that would
    // have crossed "about 1 hour ago" -> "about 5 hours ago".
    vi.setSystemTime(new Date('2026-07-22T14:31:00.000Z'));
    const second = ssr();

    expect(second).toBe(first);
  });

  it('emits no relative time label on the server pass', () => {
    vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
    const html = ssr();

    // "ago" / "in ..." only ever appear once a client clock exists.
    expect(html).not.toMatch(/\bago\b/);
    // ...and the deterministic absolute fallback is what ships instead.
    expect(html).toContain('Last synced');
    expect(html).toContain('Created');
  });
});
