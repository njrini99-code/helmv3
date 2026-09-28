// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NotificationCategoryId,
  UnifiedNotificationItem,
} from '@/app/golf/actions/unified-notifications-model';

const markNotificationRead = vi.fn();
const push = vi.fn();
const refetch = vi.fn();
vi.mock('@/app/golf/actions/unified-notifications', () => ({
  getUnifiedNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: (...a: unknown[]) => markNotificationRead(...a),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/contexts/notification-badge-context', () => ({
  useNotificationBadges: () => ({ refetch, notificationsUnread: 0, calendarNotifications: 0 }),
}));
vi.mock('../NotificationPanelContext', () => ({ useNotificationPanel: () => ({ setOpen: vi.fn() }) }));

import { NotificationsLatestModule, groupConsecutive } from '../NotificationsLatestModule';

function item(
  id: string,
  category: NotificationCategoryId,
  title: string,
  opts: { body?: string | null; read?: boolean; url?: string | null } = {},
): UnifiedNotificationItem {
  return {
    id,
    source: 'notifications',
    category,
    title,
    body: opts.body ?? null,
    action_url: opts.url ?? null,
    created_at: '2026-09-27T12:00:00Z',
    read_at: opts.read ? '2026-09-27T13:00:00Z' : null,
  };
}

describe('groupConsecutive', () => {
  it('merges consecutive messages from the same person, newest first', () => {
    const groups = groupConsecutive([
      item('m2', 'messages', 'Message from Cole Bennett'),
      item('m1', 'messages', 'Message from cole bennett'),
      item('e1', 'events', 'Practice moved to 4pm'),
    ]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['m2', 'm1'], ['e1']]);
    expect(groups[0].key).toBe('notifications:m2');
  });

  it('gives two separate runs of the same person distinct keys', () => {
    // Regression: keying on the person made these collide ("messages:cole bennett").
    const groups = groupConsecutive([
      item('m3', 'messages', 'Message from Cole Bennett'),
      item('m2', 'messages', 'Message from Ava Reyes'),
      item('m1', 'messages', 'Message from Cole Bennett'),
    ]);
    const keys = groups.map((g) => g.key);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });

  it('never merges rows that are not about a person, or across categories', () => {
    const groups = groupConsecutive([
      item('e2', 'events', 'Practice moved'),
      item('e1', 'events', 'Practice moved'),
      item('p1', 'pipeline', 'New player', { body: 'Cole Bennett has joined Varsity' }),
      item('m1', 'messages', 'Message from Cole Bennett'),
    ]);
    expect(groups.map((g) => g.items.length)).toEqual([1, 1, 1, 1]);
  });
});

describe('NotificationsLatestModule grouped row', () => {
  beforeEach(() => {
    markNotificationRead.mockReset();
    markNotificationRead.mockResolvedValue({ success: true });
    push.mockReset();
    refetch.mockReset();
  });

  it('shows one row with a count, opens the newest and marks every unread member read', async () => {
    render(
      <NotificationsLatestModule
        initialItems={[
          item('m2', 'messages', 'Message from Cole Bennett', { body: 'See you at 3', url: '/golf/messages/2' }),
          item('m1', 'messages', 'Message from Cole Bennett', { body: 'Running late' }),
        ]}
      />,
    );

    const rows = screen.getAllByRole('button', { name: /Cole Bennett/ });
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('2 messages');
    expect(rows[0].textContent).toContain('See you at 3');

    fireEvent.click(rows[0]);

    expect(push).toHaveBeenCalledWith('/golf/messages/2');
    expect(markNotificationRead).toHaveBeenCalledTimes(2);
    expect(markNotificationRead).toHaveBeenCalledWith('m2', 'notifications');
    expect(markNotificationRead).toHaveBeenCalledWith('m1', 'notifications');
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(rows[0].hasAttribute('data-unread')).toBe(false);
  });

  it('marks only the members that were still unread', () => {
    render(
      <NotificationsLatestModule
        initialItems={[
          item('m2', 'messages', 'Message from Cole Bennett'),
          item('m1', 'messages', 'Message from Cole Bennett', { read: true }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cole Bennett/ }));
    expect(markNotificationRead).toHaveBeenCalledTimes(1);
    expect(markNotificationRead).toHaveBeenCalledWith('m2', 'notifications');
  });
});
