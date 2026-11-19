import { LazyMotion, domAnimation } from 'motion/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * F-25 (audit 2026-11-19): on the phone the notification drop is a sheet, so the page behind it holds still (the shared
 * overlay lock, lib/overlay-scroll.ts, as Modal, PhoneScreen and Stories take it); on the desk it is a popover and the page
 * stays live.
 */

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const routerSpy = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routerSpy, usePathname: () => '/golf/dashboard' }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({ notificationsUnread: 3, calendarNotifications: 0, messages: 0, announcements: 0, tasks: 0, travel: 0, refetch: vi.fn() }) }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));
const switcher = vi.hoisted(() => ({ setActiveTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-switcher', () => switcher);
const who = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
const phone = vi.hoisted(() => ({ on: false }));
vi.mock('../../lib/use-phone', async (orig) => ({ ...(await orig<object>()), useChPhone: () => phone.on }));
vi.mock('@/contexts/golf-user-context', () => ({ useGolfUserOptional: () => who.user, useGolfUser: () => who.user }));

import { Bell, BellSourceProvider, type ChBellApi } from '../Bell';
import { ToastProvider } from '../../ui/Toast';

function mount() {
  const api: ChBellApi = {
    unread: 0,
    load: vi.fn(() => Promise.resolve({ success: true, data: { items: [] } })),
    markRead: vi.fn(() => Promise.resolve({ success: true })),
    markAll: vi.fn(() => Promise.resolve({ success: true })),
    refetchCount: vi.fn(),
  };
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <BellSourceProvider api={api}>
            <Bell />
          </BellSourceProvider>
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}

afterEach(() => {
  phone.on = false;
  document.body.removeAttribute('style');
});

describe('the bell and the page behind it', () => {
  it('locks the page behind the phone drop while it is open, and lets it go on close', () => {
    phone.on = true;
    const { unmount } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(document.body.style.position).toBe('fixed');
    unmount();
    expect(document.body.style.position).toBe('');
  });

  it('leaves the desk page live under the popover', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(document.body.style.position).toBe('');
  });
});
