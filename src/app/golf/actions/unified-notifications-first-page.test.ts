/**
 * Audit rows 53 + 56 — first-page composition of the notification feed.
 * 64% of calendar rows sat unread (one user at 407, 1,581 older than 30
 * days) and a burst of calendar rows pushed every CoachHelm receipt out of a
 * limit-N page. Receipts whose insight is gone kept counting as unread.
 */
import { describe, it, expect } from 'vitest';
import {
  CALENDAR_UNREAD_MAX_AGE_DAYS,
  calendarUnreadCutoffIso,
  categorizeNotificationRow,
  composeFirstPage,
  insightIdOfReceipt,
  type UnifiedNotificationItem,
} from './unified-notifications-model';

const NOW = new Date('2026-09-28T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function cal(id: string, ageDays: number, read = false): UnifiedNotificationItem {
  return {
    id,
    source: 'golf_calendar_notifications',
    category: 'events',
    title: `event ${id}`,
    body: null,
    action_url: null,
    created_at: daysAgo(ageDays),
    read_at: read ? daysAgo(ageDays) : null,
  };
}
function ch(id: string, ageDays: number): UnifiedNotificationItem {
  return {
    id,
    source: 'notifications',
    category: 'coachhelm',
    title: `insight ${id}`,
    body: null,
    action_url: null,
    created_at: daysAgo(ageDays),
    read_at: null,
  };
}

describe('calendarUnreadCutoffIso', () => {
  it('is 30 days before now', () => {
    expect(CALENDAR_UNREAD_MAX_AGE_DAYS).toBe(30);
    expect(calendarUnreadCutoffIso(NOW)).toBe(daysAgo(30));
  });
});

describe('composeFirstPage', () => {
  it('collapses calendar rows older than the cutoff into one read summary item', () => {
    const page = composeFirstPage({
      notifications: [],
      calendar: [cal('c1', 1), cal('c2', 40), cal('c3', 45)],
      staleCalendarCount: 57,
      limit: 10,
      now: NOW,
    });
    expect(page.map((i) => i.id)).toEqual(['c1', 'calendar-older-summary']);
    const summary = page[1]!;
    expect(summary.title).toBe('57 older calendar updates');
    expect(summary.read_at).not.toBeNull();
    expect(summary.action_url).toBe('/golf/dashboard/calendar');
  });

  it('adds no summary when nothing is stale', () => {
    const page = composeFirstPage({ notifications: [], calendar: [cal('c1', 1)], staleCalendarCount: 0, limit: 10, now: NOW });
    expect(page.map((i) => i.id)).toEqual(['c1']);
  });

  it('reserves CoachHelm slots so a calendar burst cannot push receipts off the page', () => {
    const calendar = Array.from({ length: 12 }, (_, i) => cal(`c${i}`, 0.01 * (i + 1)));
    const notifications = [ch('h1', 3), ch('h2', 4), ch('h3', 5), ch('h4', 6)];
    const page = composeFirstPage({ notifications, calendar, staleCalendarCount: 0, limit: 9, now: NOW });
    expect(page).toHaveLength(9);
    // min(5, floor(9/3)) = 3 reserved slots
    expect(page.filter((i) => i.category === 'coachhelm').map((i) => i.id)).toEqual(['h1', 'h2', 'h3']);
    // still newest-first
    const times = page.map((i) => Date.parse(i.created_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('does not displace anything when CoachHelm items already fit', () => {
    const page = composeFirstPage({
      notifications: [ch('h1', 0.001)],
      calendar: [cal('c1', 1), cal('c2', 2)],
      staleCalendarCount: 0,
      limit: 3,
      now: NOW,
    });
    expect(page.map((i) => i.id)).toEqual(['h1', 'c1', 'c2']);
  });
});

describe('insightIdOfReceipt', () => {
  it('reads data.insightId from a CoachHelm receipt', () => {
    expect(insightIdOfReceipt({ insightId: 'i1', coachhelm_category: 'new_insight' })).toBe('i1');
    expect(insightIdOfReceipt({ coachhelm_category: 'weekly_digest' })).toBeNull();
    expect(insightIdOfReceipt(null)).toBeNull();
  });
});

describe('categorizeNotificationRow per-category CoachHelm types', () => {
  it('files a coachhelm_* type as CoachHelm even without the data tag', () => {
    expect(categorizeNotificationRow({ type: 'coachhelm_goal_missed', data: null })).toBe('coachhelm');
  });
});

describe('partitionExpiredReceipts', () => {
  it('expires receipts whose insight is not visible, counting unread once per row', async () => {
    const { partitionExpiredReceipts } = await import('./unified-notifications-model');
    const rows = [
      { id: 'n1', read_at: null, data: { insightId: 'gone' } },
      { id: 'n1', read_at: null, data: { insightId: 'gone' } },
      { id: 'n2', read_at: '2026-09-01T00:00:00Z', data: { insightId: 'gone' } },
      { id: 'n3', read_at: null, data: { insightId: 'live' } },
      { id: 'n4', read_at: null, data: { coachhelm_category: 'weekly_digest' } },
    ];
    const out = partitionExpiredReceipts(rows, new Set(['live']));
    expect([...out.expired].sort()).toEqual(['n1', 'n2']);
    expect(out.expiredUnread).toBe(1);
  });
});
