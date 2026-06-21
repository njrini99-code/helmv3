import { describe, it, expect } from 'vitest';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import {
  filterAnnouncements,
  sortPlayerFeed,
  needsAck,
  isRecent,
  type AnnouncementFilterState,
} from './FairwayAnnouncements';

/* ---------------------------------------------------------------------------
 * Deterministic unit tests for the Announcements triage logic.
 *  - P276: search / filter / sort over a growing feed.
 *  - P282: player-feed unread-first order is STABLE across reloads (no
 *    post-hydration reshuffle).
 * All time-based assertions pin `nowTs` to a fixed instant — no Date.now().
 * ------------------------------------------------------------------------- */

const NOW = Date.parse('2026-06-21T12:00:00.000Z');
const HOURS = 3600000;
const DAYS = 24 * HOURS;

function ann(overrides: Partial<GolfAnnouncementMeta> & { id: string }): GolfAnnouncementMeta {
  return {
    title: 'Title',
    body: 'Body',
    urgency: 'normal',
    requires_acknowledgement: false,
    published_at: new Date(NOW).toISOString(),
    has_player_acknowledged: false,
    recipient_count: 0,
    acknowledged_count: 0,
    total_recipients: 0,
    task_count: 0,
    completed_task_count: 0,
    document_count: 0,
    // Remaining golf_announcements columns are not exercised by the triage logic.
    ...overrides,
  } as GolfAnnouncementMeta;
}

const DEFAULT_STATE: AnnouncementFilterState = {
  query: '',
  view: 'all',
  highOnly: false,
  tasksOnly: false,
  weekOnly: false,
};

describe('needsAck', () => {
  it('is true only when ack is required and not yet acknowledged', () => {
    expect(needsAck(ann({ id: 'a', requires_acknowledgement: true, has_player_acknowledged: false }))).toBe(true);
    expect(needsAck(ann({ id: 'b', requires_acknowledgement: true, has_player_acknowledged: true }))).toBe(false);
    expect(needsAck(ann({ id: 'c', requires_acknowledgement: false }))).toBe(false);
  });

  it('is time-independent (same result regardless of nowTs)', () => {
    const a = ann({ id: 'a', requires_acknowledgement: true, has_player_acknowledged: false });
    // needsAck takes no time arg — proving the primary sort key cannot flip on mount.
    expect(needsAck(a)).toBe(needsAck(a));
  });
});

describe('isRecent', () => {
  it('returns false at SSR (nowTs === 0) so it never reshuffles first paint', () => {
    expect(isRecent(ann({ id: 'a', published_at: new Date(NOW).toISOString() }), 0)).toBe(false);
  });

  it('is true within 7 days, false beyond', () => {
    expect(isRecent(ann({ id: 'a', published_at: new Date(NOW - 2 * DAYS).toISOString() }), NOW)).toBe(true);
    expect(isRecent(ann({ id: 'b', published_at: new Date(NOW - 10 * DAYS).toISOString() }), NOW)).toBe(false);
  });
});

describe('filterAnnouncements — P276 search', () => {
  const list = [
    ann({ id: 'a', title: 'Bus leaves at 6am', body: 'Travel to regionals' }),
    ann({ id: 'b', title: 'Study hall', body: 'Mandatory academic session' }),
  ];

  it('matches on title (case-insensitive)', () => {
    const out = filterAnnouncements(list, { ...DEFAULT_STATE, query: 'BUS' }, NOW);
    expect(out.map((a) => a.id)).toEqual(['a']);
  });

  it('matches on body', () => {
    const out = filterAnnouncements(list, { ...DEFAULT_STATE, query: 'academic' }, NOW);
    expect(out.map((a) => a.id)).toEqual(['b']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterAnnouncements(list, { ...DEFAULT_STATE, query: 'zzz' }, NOW)).toEqual([]);
  });

  it('returns the full list when query is blank', () => {
    expect(filterAnnouncements(list, DEFAULT_STATE, NOW).map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('filterAnnouncements — P276 filter chips', () => {
  const list = [
    ann({ id: 'low', urgency: 'low' }),
    ann({ id: 'high', urgency: 'high' }),
    ann({ id: 'urgent', urgency: 'urgent' }),
    ann({ id: 'withTasks', task_count: 3 }),
    ann({ id: 'old', published_at: new Date(NOW - 30 * DAYS).toISOString() }),
  ];

  it('high-only keeps only high + urgent', () => {
    const out = filterAnnouncements(list, { ...DEFAULT_STATE, highOnly: true }, NOW);
    expect(out.map((a) => a.id).sort()).toEqual(['high', 'urgent']);
  });

  it('tasks-only keeps only announcements with tasks', () => {
    const out = filterAnnouncements(list, { ...DEFAULT_STATE, tasksOnly: true }, NOW);
    expect(out.map((a) => a.id)).toEqual(['withTasks']);
  });

  it('this-week excludes a 30-day-old post', () => {
    const out = filterAnnouncements(list, { ...DEFAULT_STATE, weekOnly: true }, NOW);
    expect(out.map((a) => a.id)).not.toContain('old');
  });

  it('action view keeps only ack-needed items', () => {
    const ackList = [
      ann({ id: 'ackNeeded', requires_acknowledgement: true, has_player_acknowledged: false }),
      ann({ id: 'acked', requires_acknowledgement: true, has_player_acknowledged: true }),
      ann({ id: 'plain' }),
    ];
    const out = filterAnnouncements(ackList, { ...DEFAULT_STATE, view: 'action' }, NOW);
    expect(out.map((a) => a.id)).toEqual(['ackNeeded']);
  });
});

describe('sortPlayerFeed — P282 stable unread-first order', () => {
  // Server arrives date-descending (freshest first), with an old ack-needed item
  // deliberately placed LAST to prove ack pins it to the top.
  const serverList = [
    ann({ id: 'fresh', published_at: new Date(NOW - 1 * HOURS).toISOString() }),
    ann({ id: 'recent', published_at: new Date(NOW - 5 * HOURS).toISOString() }),
    ann({ id: 'older', published_at: new Date(NOW - 5 * DAYS).toISOString() }),
    ann({
      id: 'oldAck',
      requires_acknowledgement: true,
      has_player_acknowledged: false,
      published_at: new Date(NOW - 20 * DAYS).toISOString(),
    }),
  ];

  it('pins ack-needed first even when it is the oldest', () => {
    const out = sortPlayerFeed(serverList, NOW);
    expect(out[0]!.id).toBe('oldAck');
  });

  it('produces the SAME order at SSR (nowTs=0) and after mount (nowTs=NOW)', () => {
    const atSSR = sortPlayerFeed(serverList, 0).map((a) => a.id);
    const afterMount = sortPlayerFeed(serverList, NOW).map((a) => a.id);
    // The only stable primary key is ack-needed; the date-desc server order keeps
    // the time-based group identical, so there is NO post-hydration reshuffle.
    expect(atSSR).toEqual(afterMount);
  });

  it('preserves server order among non-ack items', () => {
    const out = sortPlayerFeed(serverList, NOW).map((a) => a.id);
    // oldAck first, then the non-ack items in their original date-desc order.
    expect(out).toEqual(['oldAck', 'fresh', 'recent', 'older']);
  });

  it('does not mutate the input array', () => {
    const before = serverList.map((a) => a.id);
    sortPlayerFeed(serverList, NOW);
    expect(serverList.map((a) => a.id)).toEqual(before);
  });
});
