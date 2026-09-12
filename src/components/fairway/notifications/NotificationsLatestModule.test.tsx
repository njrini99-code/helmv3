// @vitest-environment jsdom
/**
 * ============================================================================
 * NotificationsLatestModule — additive `frame` prop (home.v2.md §6 "Activity")
 * ----------------------------------------------------------------------------
 * `frame="bare"` skips the module's internal bordered `Surface` so the rows
 * render as bare seam rows under the CALLER's own heading + hairline (coach
 * home's Activity section). Locks two things: the default stays `'card'` —
 * byte-identical to before, which is what keeps `FairwayPlayerDashboard`'s
 * existing, untouched `<NotificationsLatestModule />` call site unaffected —
 * and `'bare'` actually drops the `Surface` wrapper rather than just hiding
 * its chrome with a class.
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NotificationsLatestModule } from './NotificationsLatestModule';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/contexts/notification-badge-context', () => ({
  useNotificationBadges: () => ({ refetch: vi.fn() }),
}));

vi.mock('./NotificationPanelContext', () => ({
  useNotificationPanel: () => ({ setOpen: vi.fn() }),
}));

function makeItem(overrides: Partial<UnifiedNotificationItem> = {}): UnifiedNotificationItem {
  return {
    id: 'n1',
    source: 'notifications',
    category: 'messages',
    title: 'Jordan Lee sent a message',
    body: 'See you at practice',
    action_url: null,
    created_at: '2026-09-01T15:00:00.000Z',
    read_at: null,
    ...overrides,
  } as UnifiedNotificationItem;
}

vi.mock('@/app/golf/actions/unified-notifications', () => ({
  getUnifiedNotifications: vi.fn(async () => ({ success: true, data: { items: [makeItem()] } })),
  markNotificationRead: vi.fn(async () => ({ success: true })),
}));

describe('NotificationsLatestModule — frame', () => {
  it('defaults to "card": keeps the bordered Surface, byte-identical to the player dashboard\'s untouched call site', async () => {
    const { container } = render(<NotificationsLatestModule />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Latest' })).toBeInTheDocument());
    expect(container.querySelector('[data-slot="surface"]')).not.toBeNull();
  });

  it('frame="bare" skips the Surface — rows render as bare seam rows instead', async () => {
    const { container } = render(<NotificationsLatestModule frame="bare" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Latest' })).toBeInTheDocument());
    expect(container.querySelector('[data-slot="surface"]')).toBeNull();
    expect(container.querySelectorAll('li')).toHaveLength(1);
  });
});
