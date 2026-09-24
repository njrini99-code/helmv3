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
});
