/**
 * ============================================================================
 * unified-notifications-model — pure normalize / categorize / merge / sort
 * ----------------------------------------------------------------------------
 * No Supabase mocking: every function under test is a plain sync transform
 * over fixture rows, mirroring the attention-queue.test.ts pattern for the
 * dashboard's other pure view-model modules.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { DELIVERY_NOTIFICATION_GROUPS } from '@/lib/coachhelm/v3/notifications/types';
import {
  categorizeCalendarNotificationRow,
  categorizeNotificationRow,
  clampNotificationsLimit,
  countByCategory,
  countUnread,
  dayBucketFor,
  groupByDayBucket,
  isUnread,
  itemMatchesFilter,
  mergeAndSortNotifications,
  normalizeCalendarNotificationRow,
  normalizeNotificationRow,
  NOTIFICATION_CATEGORY_IDS,
  type NotificationCategoryId,
  type RawCalendarNotificationRow,
  type RawNotificationRow,
  type UnifiedNotificationItem,
} from './unified-notifications-model';

// ── fixtures ─────────────────────────────────────────────────────────────────

function notifRow(overrides: Partial<RawNotificationRow> = {}): RawNotificationRow {
  return {
    id: 'n-1',
    type: 'dev_plan_assigned',
    title: 'Title',
    body: 'Body',
    action_url: null,
    created_at: '2026-07-20T12:00:00.000Z',
    read_at: null,
    data: null,
    ...overrides,
  };
}

function calRow(overrides: Partial<RawCalendarNotificationRow> = {}): RawCalendarNotificationRow {
  return {
    id: 'c-1',
    notification_type: 'event_reminder',
    title: 'Practice tomorrow',
    message: 'Reminder',
    action_url: null,
    created_at: '2026-07-20T12:00:00.000Z',
    read_at: null,
    ...overrides,
  };
}

function item(overrides: Partial<UnifiedNotificationItem> = {}): UnifiedNotificationItem {
  return {
    id: 'i-1',
    source: 'notifications',
    category: 'coachhelm',
    title: 'Item',
    body: null,
    action_url: null,
    created_at: '2026-07-20T12:00:00.000Z',
    read_at: null,
    ...overrides,
  };
}

// ── taxonomy drift guard ─────────────────────────────────────────────────────

describe('NOTIFICATION_CATEGORY_IDS', () => {
  it('matches DELIVERY_NOTIFICATION_GROUPS exactly (no drift from the settings-panel taxonomy)', () => {
    expect(NOTIFICATION_CATEGORY_IDS).toEqual(DELIVERY_NOTIFICATION_GROUPS.map((g) => g.id));
  });

  it('contains all 7 canonical category ids', () => {
    expect(new Set(NOTIFICATION_CATEGORY_IDS)).toEqual(
      new Set<NotificationCategoryId>([
        'messages',
        'events',
        'announcements',
        'tasks',
        'coachhelm',
        'pipeline',
        'profile_views',
      ]),
    );
  });
});

// ── categorization ───────────────────────────────────────────────────────────

describe('categorizeNotificationRow', () => {
  it('routes any row carrying data.coachhelm_category to coachhelm, regardless of type', () => {
    const row = notifRow({ type: 'dev_plan_assigned', data: { coachhelm_category: 'new_insight' } });
    expect(categorizeNotificationRow(row)).toBe('coachhelm');
  });

  it('routes task-reminder rows (data.task_type) to tasks even though they share the event_reminder enum value', () => {
    const row = notifRow({ type: 'event_reminder', data: { task_id: 't1', task_type: 'task_reminder' } });
    expect(categorizeNotificationRow(row)).toBe('tasks');
  });

  it('routes a bare event_reminder (no task_type) to events', () => {
    const row = notifRow({ type: 'event_reminder', data: null });
    expect(categorizeNotificationRow(row)).toBe('events');
  });

  it('routes message to messages', () => {
    expect(categorizeNotificationRow(notifRow({ type: 'message' }))).toBe('messages');
  });

  it.each(['team_invite', 'team_join_request', 'team_join_approved', 'team_join_rejected', 'team_join'])(
    'routes %s to pipeline',
    (type) => {
      expect(categorizeNotificationRow(notifRow({ type }))).toBe('pipeline');
    },
  );

  it.each(['profile_view', 'watchlist_add', 'video_view'])('routes %s to profile_views', (type) => {
    expect(categorizeNotificationRow(notifRow({ type }))).toBe('profile_views');
  });

  it('falls back dev_plan_assigned with no coachhelm_category tag to coachhelm', () => {
    expect(categorizeNotificationRow(notifRow({ type: 'dev_plan_assigned', data: null }))).toBe('coachhelm');
  });

  it('falls back an unknown enum value to events rather than throwing', () => {
    expect(categorizeNotificationRow(notifRow({ type: 'some_future_enum_value' }))).toBe('events');
  });

  it('ignores non-object data payloads (array) instead of crashing', () => {
    expect(categorizeNotificationRow(notifRow({ type: 'message', data: ['not', 'an', 'object'] }))).toBe('messages');
  });
});

describe('categorizeCalendarNotificationRow', () => {
  it('always categorizes as events', () => {
    expect(categorizeCalendarNotificationRow(calRow({ notification_type: 'rsvp_response' }))).toBe('events');
    expect(categorizeCalendarNotificationRow(calRow({ notification_type: 'event_cancelled' }))).toBe('events');
  });
});

// ── normalization ────────────────────────────────────────────────────────────

describe('normalizeNotificationRow', () => {
  it('maps every field verbatim and tags the source', () => {
    const row = notifRow({
      id: 'abc',
      title: 'New insight',
      body: 'Detail',
      action_url: '/golf/dashboard/intelligence',
      created_at: '2026-07-20T10:00:00.000Z',
      read_at: '2026-07-20T11:00:00.000Z',
      data: { coachhelm_category: 'new_insight' },
    });
    expect(normalizeNotificationRow(row)).toEqual({
      id: 'abc',
      source: 'notifications',
      category: 'coachhelm',
      title: 'New insight',
      body: 'Detail',
      action_url: '/golf/dashboard/intelligence',
      created_at: '2026-07-20T10:00:00.000Z',
      read_at: '2026-07-20T11:00:00.000Z',
    });
  });

  it('falls back a null created_at to the epoch instead of null (safe for sorting)', () => {
    const out = normalizeNotificationRow(notifRow({ created_at: null }));
    expect(out.created_at).toBe(new Date(0).toISOString());
  });
});

describe('normalizeCalendarNotificationRow', () => {
  it('maps message → body and title fallback, tags source golf_calendar_notifications', () => {
    const row = calRow({ id: 'evt-1', title: null, message: 'RSVP received', action_url: '/golf/dashboard/calendar' });
    const out = normalizeCalendarNotificationRow(row);
    expect(out).toEqual({
      id: 'evt-1',
      source: 'golf_calendar_notifications',
      category: 'events',
      title: 'Calendar update',
      body: 'RSVP received',
      action_url: '/golf/dashboard/calendar',
      created_at: row.created_at,
      read_at: null,
    });
  });
});

// ── merge + sort ─────────────────────────────────────────────────────────────

describe('mergeAndSortNotifications', () => {
  it('unions both sources and sorts newest-first', () => {
    const a = [item({ id: 'a', created_at: '2026-07-20T10:00:00.000Z' })];
    const b = [
      item({ id: 'b', source: 'golf_calendar_notifications', created_at: '2026-07-20T12:00:00.000Z' }),
      item({ id: 'c', source: 'golf_calendar_notifications', created_at: '2026-07-19T00:00:00.000Z' }),
    ];
    expect(mergeAndSortNotifications(a, b).map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('applies limit AFTER merging (never favors one source)', () => {
    const a = [item({ id: 'a1', created_at: '2026-07-20T09:00:00.000Z' })];
    const b = [item({ id: 'b1', created_at: '2026-07-20T10:00:00.000Z' })];
    expect(mergeAndSortNotifications(a, b, 1).map((i) => i.id)).toEqual(['b1']);
  });

  it('treats an unparsable created_at as the oldest item rather than throwing', () => {
    const a = [item({ id: 'good', created_at: '2026-07-20T10:00:00.000Z' })];
    const b = [item({ id: 'bad', created_at: 'not-a-date' })];
    expect(mergeAndSortNotifications(a, b).map((i) => i.id)).toEqual(['good', 'bad']);
  });

  it('returns an empty array for two empty inputs', () => {
    expect(mergeAndSortNotifications([], [])).toEqual([]);
  });
});

// ── unread ───────────────────────────────────────────────────────────────────

describe('isUnread / countUnread', () => {
  it('read_at null is unread; any timestamp is read', () => {
    expect(isUnread(item({ read_at: null }))).toBe(true);
    expect(isUnread(item({ read_at: '2026-07-20T10:00:00.000Z' }))).toBe(false);
  });

  it('counts only unread items', () => {
    const items = [item({ read_at: null }), item({ read_at: '2026-07-20T10:00:00.000Z' }), item({ read_at: null })];
    expect(countUnread(items)).toBe(2);
  });
});

// ── limit clamping ───────────────────────────────────────────────────────────

describe('clampNotificationsLimit', () => {
  it('defaults when omitted, zero, negative, or non-finite', () => {
    expect(clampNotificationsLimit(undefined)).toBe(30);
    expect(clampNotificationsLimit(0)).toBe(30);
    expect(clampNotificationsLimit(-5)).toBe(30);
    expect(clampNotificationsLimit(Number.NaN)).toBe(30);
  });

  it('floors fractional values', () => {
    expect(clampNotificationsLimit(5.9)).toBe(5);
  });

  it('caps at the max', () => {
    expect(clampNotificationsLimit(500)).toBe(100);
  });

  it('passes through an in-range integer', () => {
    expect(clampNotificationsLimit(10)).toBe(10);
  });
});

// ── day-bucket grouping ──────────────────────────────────────────────────────
//
// `dayBucketFor` compares LOCAL calendar days (mirrors FairwayWhatsNew's
// startOfDay). Fixtures are built with the local `Date(y, m, d, h)`
// constructor (not a hardcoded `Z`-suffixed instant) so the "same local day"
// relationships hold regardless of the host machine's timezone (CI/dev vs
// `America/New_York` — see feedback_utc_timestamp_staleness_trap), then
// converted to ISO via `.toISOString()` for the round-trip through
// `Date.parse` inside `dayBucketFor`.

describe('dayBucketFor', () => {
  const now = new Date(2026, 6, 20, 15, 0, 0); // local: Jul 20 2026, 15:00
  const todayEarly = new Date(2026, 6, 20, 1, 0, 0);
  const yesterdayLate = new Date(2026, 6, 19, 23, 0, 0);
  const twoDaysAgoLate = new Date(2026, 6, 18, 23, 0, 0);

  it('buckets same local day as today', () => {
    expect(dayBucketFor(todayEarly.toISOString(), now)).toBe('today');
  });

  it('buckets the prior local calendar day as yesterday', () => {
    expect(dayBucketFor(yesterdayLate.toISOString(), now)).toBe('yesterday');
  });

  it('buckets two local days back as earlier', () => {
    expect(dayBucketFor(twoDaysAgoLate.toISOString(), now)).toBe('earlier');
  });

  it('buckets an unparsable date as earlier rather than throwing', () => {
    expect(dayBucketFor('not-a-date', now)).toBe('earlier');
  });
});

describe('groupByDayBucket', () => {
  const now = new Date(2026, 6, 20, 15, 0, 0);
  const t1 = new Date(2026, 6, 20, 10, 0, 0);
  const t2 = new Date(2026, 6, 20, 8, 0, 0);
  const y1 = new Date(2026, 6, 19, 10, 0, 0);

  it('groups into non-empty buckets only, preserving incoming order within each', () => {
    const items = [
      item({ id: 't1', created_at: t1.toISOString() }),
      item({ id: 'y1', created_at: y1.toISOString() }),
      item({ id: 't2', created_at: t2.toISOString() }),
    ];
    const grouped = groupByDayBucket(items, now);
    expect(grouped.map((g) => g.bucket)).toEqual(['today', 'yesterday']);
    expect(grouped[0]?.items.map((i) => i.id)).toEqual(['t1', 't2']);
    expect(grouped[1]?.items.map((i) => i.id)).toEqual(['y1']);
  });

  it('omits empty buckets entirely (no "Earlier" header with zero rows)', () => {
    const items = [item({ id: 't1', created_at: t1.toISOString() })];
    expect(groupByDayBucket(items, now).map((g) => g.bucket)).toEqual(['today']);
  });

  it('returns an empty array for no items', () => {
    expect(groupByDayBucket([], now)).toEqual([]);
  });
});

// ── filtering ────────────────────────────────────────────────────────────────

describe('itemMatchesFilter / countByCategory', () => {
  it('"all" matches everything', () => {
    expect(itemMatchesFilter(item({ category: 'tasks' }), 'all')).toBe(true);
  });

  it('a category filter matches only that category', () => {
    expect(itemMatchesFilter(item({ category: 'tasks' }), 'tasks')).toBe(true);
    expect(itemMatchesFilter(item({ category: 'tasks' }), 'events')).toBe(false);
  });

  it('counts every category id plus "all", zero-filled for absent categories', () => {
    const items = [item({ category: 'coachhelm' }), item({ category: 'coachhelm' }), item({ category: 'events' })];
    const counts = countByCategory(items);
    expect(counts.all).toBe(3);
    expect(counts.coachhelm).toBe(2);
    expect(counts.events).toBe(1);
    expect(counts.messages).toBe(0);
    expect(counts.tasks).toBe(0);
    expect(counts.pipeline).toBe(0);
    expect(counts.profile_views).toBe(0);
    expect(counts.announcements).toBe(0);
  });
});
