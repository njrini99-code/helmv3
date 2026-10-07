import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GolfUserData } from '@/contexts/golf-user-context';

const { bundleMock, markSeenMock, userRef } = vi.hoisted(() => ({
  bundleMock: vi.fn(),
  markSeenMock: vi.fn(),
  userRef: { current: null as unknown as Partial<GolfUserData> },
}));

vi.mock('@/app/golf/actions/notification-badges', () => ({
  getNotificationBadgeBundle: bundleMock,
}));
vi.mock('@/app/golf/actions/player-notifications', () => ({
  markAnnouncementsSeen: markSeenMock,
}));
vi.mock('@/contexts/golf-user-context', () => ({
  useGolfUser: () => userRef.current,
}));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));

import {
  NotificationBadgeProvider,
  useNotificationBadges,
  VISIBILITY_REFETCH_MIN_GAP,
  INITIAL_FETCH_FALLBACK_DELAY,
} from '../notification-badge-context';

function Probe() {
  const b = useNotificationBadges();
  return (
    <div>
      <span data-testid="messages">{b.messages}</span>
      <span data-testid="coachhelm">{b.coachhelm}</span>
      <span data-testid="unread">{b.notificationsUnread}</span>
      <span data-testid="tasks">{b.tasks}</span>
    </div>
  );
}

const PLAYER = { role: 'player', userId: 'u1', playerId: 'p1', teamId: 't1' } as const;
const COACH = { role: 'coach', userId: 'u2', coachId: 'c1', teamId: 't1' } as const;

function playerBundle(unreadMessages: number | null, extra: Record<string, unknown> = {}) {
  return {
    player: {
      success: true,
      data: {
        unreadAnnouncements: 1,
        pendingTasks: 2,
        unreadMessages,
        unseenTravel: 0,
        calendarNotifications: 0,
        unseenAnnouncements: [],
        lastSeenAt: null,
      },
      ...extra,
    },
    coach: null,
    alerts: null,
    unread: { success: true, data: { unread: 4 } },
  };
}

/** Past the deferred first read (no requestIdleCallback in jsdom). */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INITIAL_FETCH_FALLBACK_DELAY + 500);
  });
}

describe('NotificationBadgeProvider — one consolidated badge action', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bundleMock.mockReset();
    markSeenMock.mockReset();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes exactly ONE server-action call per poll for a player and fills every badge from it', async () => {
    userRef.current = PLAYER;
    bundleMock.mockResolvedValue(playerBundle(3));
    render(<NotificationBadgeProvider><Probe /></NotificationBadgeProvider>);
    await flush();

    expect(bundleMock).toHaveBeenCalledTimes(1);
    expect(bundleMock).toHaveBeenCalledWith({ role: 'player', userId: 'u1', playerId: 'p1', teamId: 't1', coachId: null });
    expect(screen.getByTestId('messages').textContent).toBe('3');
    expect(screen.getByTestId('tasks').textContent).toBe('2');
    expect(screen.getByTestId('unread').textContent).toBe('4');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(bundleMock).toHaveBeenCalledTimes(2);
  });

  it('fills the coach counts and the CoachHelm alert badge from the same single call', async () => {
    userRef.current = COACH;
    bundleMock.mockResolvedValue({
      player: null,
      coach: { success: true, data: { calendarNotifications: 1, unreadMessages: 5 } },
      alerts: { success: true, counts: { critical: 2, warning: 0, info: 0, total: 2 } },
      unread: { success: true, data: { unread: 1 } },
    });
    render(<NotificationBadgeProvider><Probe /></NotificationBadgeProvider>);
    await flush();

    expect(bundleMock).toHaveBeenCalledTimes(1);
    expect(bundleMock.mock.calls[0]?.[0]).toMatchObject({ role: 'coach', coachId: 'c1' });
    expect(screen.getByTestId('messages').textContent).toBe('5');
    expect(screen.getByTestId('coachhelm').textContent).toBe('2');
    expect(screen.getByTestId('unread').textContent).toBe('1');
  });

  it('HOLDS the previous unread-messages value when the read comes back null', async () => {
    userRef.current = PLAYER;
    bundleMock.mockResolvedValueOnce(playerBundle(3)).mockResolvedValueOnce(playerBundle(null));
    render(<NotificationBadgeProvider><Probe /></NotificationBadgeProvider>);
    await flush();
    expect(screen.getByTestId('messages').textContent).toBe('3');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(bundleMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('messages').textContent).toBe('3');
  });

  it('stops polling once any part reports authExpired', async () => {
    userRef.current = COACH;
    bundleMock.mockResolvedValue({
      player: null,
      coach: { success: true, data: { calendarNotifications: 0, unreadMessages: 0 } },
      alerts: { success: true, counts: { critical: 0, warning: 0, info: 0, total: 0 }, authExpired: true },
      unread: null,
    });
    render(<NotificationBadgeProvider><Probe /></NotificationBadgeProvider>);
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000 * 3);
    });
    expect(bundleMock).toHaveBeenCalledTimes(1);
  });

  it('skips a visibility-return refetch while the last read is fresh, and refetches once it is stale', async () => {
    userRef.current = PLAYER;
    bundleMock.mockResolvedValue(playerBundle(0));
    render(<NotificationBadgeProvider><Probe /></NotificationBadgeProvider>);
    await flush();
    expect(bundleMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(bundleMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VISIBILITY_REFETCH_MIN_GAP);
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(bundleMock).toHaveBeenCalledTimes(2);
  });

  it('defers the first read past mount so page-level server actions queue first', async () => {
    userRef.current = PLAYER;
    bundleMock.mockResolvedValue(playerBundle(0));
    render(<NotificationBadgeProvider><Probe /></NotificationBadgeProvider>);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(bundleMock).not.toHaveBeenCalled();
    await flush();
    expect(bundleMock).toHaveBeenCalledTimes(1);
  });

  it('does not refetch on a plain rerender (e.g. a route change re-rendering the shell)', async () => {
    userRef.current = PLAYER;
    bundleMock.mockResolvedValue(playerBundle(0));
    const { rerender } = render(<NotificationBadgeProvider><Probe /></NotificationBadgeProvider>);
    await flush();
    rerender(<NotificationBadgeProvider><Probe /></NotificationBadgeProvider>);
    rerender(<NotificationBadgeProvider><Probe /></NotificationBadgeProvider>);
    await flush();
    expect(bundleMock).toHaveBeenCalledTimes(1);
  });

  it('never calls the action for a viewer with no resolved role ids', async () => {
    userRef.current = { role: 'player', userId: 'u1' };
    render(<NotificationBadgeProvider><Probe /></NotificationBadgeProvider>);
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
    });
    expect(bundleMock).not.toHaveBeenCalled();
  });
});
