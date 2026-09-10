/**
 * ============================================================================
 * NotificationBadgeProvider — reference stability + concurrent poll (2026-09-10)
 * ----------------------------------------------------------------------------
 * Two perf defects in the 45s poll:
 *
 *   1. `setUnseenAnnouncements` wrote a FRESH array (a literal `[]`, or
 *      whatever the server returned) every poll, even when the content was
 *      identical to what was already in state. That new reference flowed
 *      into the memoized context `value`, which re-rendered all 8 consumers
 *      of `useNotificationBadges()` for a no-op.
 *   2. The poll's 2-3 server actions were awaited one after another, so the
 *      round-trip latency of a single poll was the SUM of each call instead
 *      of the max.
 *
 * These tests pin: unchanged data keeps the same array reference, changed
 * data still updates it, and the calls that make up one poll fire together
 * rather than in series.
 * ============================================================================
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBadgeProvider, useNotificationBadges } from './notification-badge-context';
import type { GolfUserData } from './golf-user-context';

let mockGolfUser: GolfUserData;

vi.mock('./golf-user-context', () => ({
  useGolfUser: () => mockGolfUser,
}));

vi.mock('@/lib/utils/capacitor', () => ({
  isNativeApp: () => false,
}));

const getPlayerNotificationCounts = vi.fn();
const markSeenAction = vi.fn().mockResolvedValue(undefined);
vi.mock('@/app/golf/actions/player-notifications', () => ({
  getPlayerNotificationCounts: (...args: unknown[]) => getPlayerNotificationCounts(...args),
  markAnnouncementsSeen: (...args: unknown[]) => markSeenAction(...args),
}));

const getCoachNotificationCounts = vi.fn();
vi.mock('@/app/golf/actions/coach-notifications', () => ({
  getCoachNotificationCounts: (...args: unknown[]) => getCoachNotificationCounts(...args),
}));

const getAlertCounts = vi.fn();
vi.mock('@/app/golf/actions/alerts', () => ({
  getAlertCounts: (...args: unknown[]) => getAlertCounts(...args),
}));

const getNotificationsUnreadCount = vi.fn();
vi.mock('@/app/golf/actions/unified-notifications', () => ({
  getNotificationsUnreadCount: (...args: unknown[]) => getNotificationsUnreadCount(...args),
}));

type Badges = ReturnType<typeof useNotificationBadges>;
let latest: Badges | null = null;
let renderCount = 0;

function Consumer() {
  latest = useNotificationBadges();
  renderCount++;
  return null;
}

function makeAnnouncement(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ann-1',
    team_id: 't1',
    title: 'Practice moved',
    body: 'Moved to 4pm',
    urgency: 'normal',
    created_at: null,
    created_by: null,
    publish_at: null,
    published_at: null,
    requires_acknowledgement: null,
    send_email: null,
    send_push: null,
    updated_at: '2026-09-01T00:00:00Z',
    recipient_count: 12,
    acknowledged_count: 3,
    total_recipients: 12,
    task_count: 0,
    completed_task_count: 0,
    document_count: 0,
    has_player_acknowledged: false,
    ...overrides,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  latest = null;
  renderCount = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NotificationBadgeProvider — unseenAnnouncements reference stability', () => {
  it('keeps the SAME array reference across polls when a coach payload is content-identical', async () => {
    mockGolfUser = { role: 'coach', userId: 'u1', coachId: 'c1', teamId: 't1' } as GolfUserData;
    getCoachNotificationCounts.mockResolvedValue({
      success: true,
      data: { unreadMessages: 2, calendarNotifications: 1 },
    });
    getAlertCounts.mockResolvedValue({ success: true, counts: { critical: 0, warning: 0, info: 0, total: 0 } });
    getNotificationsUnreadCount.mockResolvedValue({ success: true, data: { unread: 0 } });

    render(
      <NotificationBadgeProvider>
        <Consumer />
      </NotificationBadgeProvider>,
    );
    await flush();

    const firstArray = latest!.unseenAnnouncements;
    expect(firstArray).toEqual([]);
    const rendersAfterFirstPoll = renderCount;

    // A second poll with the exact same (empty, for a coach) result must not
    // allocate a new array or trigger an extra render.
    await act(async () => {
      await latest!.refetch();
    });

    expect(latest!.unseenAnnouncements).toBe(firstArray);
    expect(renderCount).toBe(rendersAfterFirstPoll);
  });

  it('keeps the SAME array reference for a player when the server payload is content-identical', async () => {
    mockGolfUser = { role: 'player', userId: 'u1', playerId: 'p1', teamId: 't1' } as GolfUserData;
    const announcement = makeAnnouncement();
    getPlayerNotificationCounts.mockResolvedValue({
      success: true,
      data: {
        unreadAnnouncements: 1,
        pendingTasks: 0,
        unreadMessages: 0,
        unseenTravel: 0,
        calendarNotifications: 0,
        unseenAnnouncements: [announcement],
        lastSeenAt: null,
      },
    });
    getNotificationsUnreadCount.mockResolvedValue({ success: true, data: { unread: 0 } });

    render(
      <NotificationBadgeProvider>
        <Consumer />
      </NotificationBadgeProvider>,
    );
    await flush();

    const firstArray = latest!.unseenAnnouncements;
    expect(firstArray).toHaveLength(1);

    // Next poll returns a DIFFERENT array instance with IDENTICAL content
    // (the common real-world case: a fresh server round trip, same data).
    getPlayerNotificationCounts.mockResolvedValue({
      success: true,
      data: {
        unreadAnnouncements: 1,
        pendingTasks: 0,
        unreadMessages: 0,
        unseenTravel: 0,
        calendarNotifications: 0,
        unseenAnnouncements: [makeAnnouncement()],
        lastSeenAt: null,
      },
    });

    await act(async () => {
      await latest!.refetch();
    });

    expect(latest!.unseenAnnouncements).toBe(firstArray);
  });

  it('still updates to a NEW reference when the content actually changes', async () => {
    mockGolfUser = { role: 'player', userId: 'u1', playerId: 'p1', teamId: 't1' } as GolfUserData;
    getPlayerNotificationCounts.mockResolvedValue({
      success: true,
      data: {
        unreadAnnouncements: 1,
        pendingTasks: 0,
        unreadMessages: 0,
        unseenTravel: 0,
        calendarNotifications: 0,
        unseenAnnouncements: [makeAnnouncement()],
        lastSeenAt: null,
      },
    });
    getNotificationsUnreadCount.mockResolvedValue({ success: true, data: { unread: 0 } });

    render(
      <NotificationBadgeProvider>
        <Consumer />
      </NotificationBadgeProvider>,
    );
    await flush();
    const firstArray = latest!.unseenAnnouncements;

    // A teammate acknowledges it — acknowledged_count changes.
    getPlayerNotificationCounts.mockResolvedValue({
      success: true,
      data: {
        unreadAnnouncements: 1,
        pendingTasks: 0,
        unreadMessages: 0,
        unseenTravel: 0,
        calendarNotifications: 0,
        unseenAnnouncements: [makeAnnouncement({ acknowledged_count: 4 })],
        lastSeenAt: null,
      },
    });

    await act(async () => {
      await latest!.refetch();
    });

    expect(latest!.unseenAnnouncements).not.toBe(firstArray);
    expect(latest!.unseenAnnouncements[0]?.acknowledged_count).toBe(4);
  });

  it('markAnnouncementsSeen bails out to the shared empty reference without a redundant render when already empty', async () => {
    mockGolfUser = { role: 'coach', userId: 'u1', coachId: 'c1', teamId: 't1' } as GolfUserData;
    getCoachNotificationCounts.mockResolvedValue({ success: true, data: { unreadMessages: 0, calendarNotifications: 0 } });
    getAlertCounts.mockResolvedValue({ success: true, counts: { critical: 0, warning: 0, info: 0, total: 0 } });
    getNotificationsUnreadCount.mockResolvedValue({ success: true, data: { unread: 0 } });

    render(
      <NotificationBadgeProvider>
        <Consumer />
      </NotificationBadgeProvider>,
    );
    await flush();

    const firstArray = latest!.unseenAnnouncements;
    await act(async () => {
      await latest!.markAnnouncementsSeen();
    });
    expect(latest!.unseenAnnouncements).toBe(firstArray);
  });
});

describe('NotificationBadgeProvider — poll dispatches its calls concurrently', () => {
  it('player branch: fires getNotificationsUnreadCount without waiting for the main counts call to resolve', async () => {
    mockGolfUser = { role: 'player', userId: 'u1', playerId: 'p1', teamId: 't1' } as GolfUserData;
    let resolvePlayer!: (v: unknown) => void;
    getPlayerNotificationCounts.mockImplementation(
      () => new Promise((res) => { resolvePlayer = res; }),
    );
    getNotificationsUnreadCount.mockResolvedValue({ success: true, data: { unread: 5 } });

    render(
      <NotificationBadgeProvider>
        <Consumer />
      </NotificationBadgeProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    // The unified call must already have been DISPATCHED even though the
    // main counts call hasn't resolved — proof they run concurrently, not
    // one after the other.
    expect(getNotificationsUnreadCount).toHaveBeenCalledTimes(1);

    resolvePlayer({
      success: true,
      data: {
        unreadAnnouncements: 0,
        pendingTasks: 0,
        unreadMessages: 0,
        unseenTravel: 0,
        calendarNotifications: 0,
        unseenAnnouncements: [],
        lastSeenAt: null,
      },
    });
    await flush();
    expect(latest!.notificationsUnread).toBe(5);
  });

  it('coach branch: fires getAlertCounts and getNotificationsUnreadCount without waiting for the main counts call', async () => {
    mockGolfUser = { role: 'coach', userId: 'u1', coachId: 'c1', teamId: 't1' } as GolfUserData;
    let resolveCoach!: (v: unknown) => void;
    getCoachNotificationCounts.mockImplementation(
      () => new Promise((res) => { resolveCoach = res; }),
    );
    getAlertCounts.mockResolvedValue({ success: true, counts: { critical: 3, warning: 0, info: 0, total: 3 } });
    getNotificationsUnreadCount.mockResolvedValue({ success: true, data: { unread: 7 } });

    render(
      <NotificationBadgeProvider>
        <Consumer />
      </NotificationBadgeProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(getAlertCounts).toHaveBeenCalledTimes(1);
    expect(getNotificationsUnreadCount).toHaveBeenCalledTimes(1);

    resolveCoach({ success: true, data: { unreadMessages: 1, calendarNotifications: 2 } });
    await flush();

    expect(latest!.coachhelm).toBe(3);
    expect(latest!.notificationsUnread).toBe(7);
    expect(latest!.calendarNotifications).toBe(2);
  });

  it('an inactive identity (no coachId, so isCoach is false) polls nothing at all', async () => {
    mockGolfUser = { role: 'coach', userId: 'u1', coachId: undefined, teamId: 't1' } as GolfUserData;

    render(
      <NotificationBadgeProvider>
        <Consumer />
      </NotificationBadgeProvider>,
    );
    await flush();
    expect(getAlertCounts).not.toHaveBeenCalled();
    expect(getCoachNotificationCounts).not.toHaveBeenCalled();
    expect(getNotificationsUnreadCount).not.toHaveBeenCalled();
  });
});

describe('NotificationBadgeProvider — error handling semantics preserved under concurrency', () => {
  it('an authExpired result from EITHER concurrent call stops future polling', async () => {
    mockGolfUser = { role: 'coach', userId: 'u1', coachId: 'c1', teamId: 't1' } as GolfUserData;
    getCoachNotificationCounts.mockResolvedValue({ success: true, data: { unreadMessages: 0, calendarNotifications: 0 } });
    getAlertCounts.mockResolvedValue({ success: false, authExpired: true });
    getNotificationsUnreadCount.mockResolvedValue({ success: true, data: { unread: 0 } });

    render(
      <NotificationBadgeProvider>
        <Consumer />
      </NotificationBadgeProvider>,
    );
    await flush();

    const callsAfterFirstPoll = getCoachNotificationCounts.mock.calls.length;
    await act(async () => {
      await latest!.refetch();
    });
    // The session-expired circuit breaker (sessionExpiredRef) short-circuits
    // fetchCounts before it dispatches anything on the next call.
    expect(getCoachNotificationCounts.mock.calls.length).toBe(callsAfterFirstPoll);
  });

  it('a rejected getAlertCounts call is swallowed and coachhelm falls back to 0, matching the original try/catch', async () => {
    mockGolfUser = { role: 'coach', userId: 'u1', coachId: 'c1', teamId: 't1' } as GolfUserData;
    getCoachNotificationCounts.mockResolvedValue({ success: true, data: { unreadMessages: 0, calendarNotifications: 0 } });
    getAlertCounts.mockRejectedValue(new Error('network down'));
    getNotificationsUnreadCount.mockResolvedValue({ success: true, data: { unread: 0 } });

    render(
      <NotificationBadgeProvider>
        <Consumer />
      </NotificationBadgeProvider>,
    );
    await flush();

    expect(latest!.coachhelm).toBe(0);
    // The sibling unified call is unaffected by the alerts rejection.
    expect(latest!.notificationsUnread).toBe(0);
  });

  it('a rejected main counts call does not prevent the sibling unified call from updating state', async () => {
    mockGolfUser = { role: 'player', userId: 'u1', playerId: 'p1', teamId: 't1' } as GolfUserData;
    getPlayerNotificationCounts.mockRejectedValue(new Error('network down'));
    getNotificationsUnreadCount.mockResolvedValue({ success: true, data: { unread: 9 } });

    render(
      <NotificationBadgeProvider>
        <Consumer />
      </NotificationBadgeProvider>,
    );
    await flush();

    expect(latest!.notificationsUnread).toBe(9);
    expect(latest!.announcements).toBe(0);
  });
});
