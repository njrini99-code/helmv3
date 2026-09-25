// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const getUnifiedNotifications = vi.fn();
vi.mock('@/app/golf/actions/unified-notifications', () => ({
  getUnifiedNotifications: (...a: unknown[]) => getUnifiedNotifications(...a),
  markNotificationRead: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({ refetch: vi.fn() }) }));
vi.mock('../NotificationPanelContext', () => ({ useNotificationPanel: () => ({ setOpen: vi.fn() }) }));

import { NotificationsLatestModule } from '../NotificationsLatestModule';

describe('NotificationsLatestModule seed (PERF-03)', () => {
  it('makes no client read when the server seeded the items', () => {
    getUnifiedNotifications.mockClear();
    render(<NotificationsLatestModule initialItems={[]} />);
    expect(getUnifiedNotifications).not.toHaveBeenCalled();
  });

  it('reads on the client when nothing was seeded', () => {
    getUnifiedNotifications.mockReset();
    getUnifiedNotifications.mockResolvedValue({ success: true, data: { items: [] } });
    render(<NotificationsLatestModule />);
    expect(getUnifiedNotifications).toHaveBeenCalledWith({ limit: 5 });
  });

  it('keys the unread dot in words (DS-N7)', () => {
    const item = (id: string, read_at: string | null) => ({
      id, source: 'notification' as never, category: 'team' as never, title: `Item ${id}`, body: null,
      action_url: null, created_at: '2026-09-24T12:00:00Z', read_at,
    });
    const { container } = render(
      <NotificationsLatestModule initialItems={[item('a', null), item('b', null), item('c', '2026-09-24T13:00:00Z')]} />,
    );
    expect(container.querySelector('[data-slot="latest-unread-key"]')?.textContent).toBe('2 new');
  });

  it('shows no key when everything is read', () => {
    const { container } = render(
      <NotificationsLatestModule
        initialItems={[{ id: 'a', source: 'notification' as never, category: 'team' as never, title: 'A', body: null, action_url: null, created_at: '2026-09-24T12:00:00Z', read_at: '2026-09-24T13:00:00Z' }]}
      />,
    );
    expect(container.querySelector('[data-slot="latest-unread-key"]')).toBeNull();
  });
});
